package com.example.demo.modules.twin.service;

import com.example.demo.modules.accessrule.service.AccessRuleDispatchResult;
import com.example.demo.modules.accessrule.service.AccessRuleDispatchService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Web 扫码离开在 ARO 成功后：大华门禁回收与物理卡冻结可配置延迟执行（秒），0 表示保持原有同步行为。
 * <p>同一用户仅保留最后一次延迟任务；若用户在延迟期内再次扫码进入，须调用 {@link #cancelPendingDeferredExitForUser(String)}，
 * 避免解冻后仍被旧计时器二次冻结。</p>
 */
@Service
public class WebScanExitDahuaLinkageService {
    private static final Logger log = LoggerFactory.getLogger(WebScanExitDahuaLinkageService.class);
    private static final int MAX_DEFER_SECONDS = 3600;

    private final ThreadPoolTaskScheduler twinSwingTaskScheduler;
    private final AccessRuleDispatchService accessRuleDispatchService;
    private final TwinCardMappingService twinCardMappingService;
    private final DahuaSwingRuleConfigService dahuaSwingRuleConfigService;

    /** userId → 当前排队的延迟冻结任务（仅 defer&gt;0 时存在） */
    private final ConcurrentHashMap<String, ScheduledFuture<?>> pendingDeferredByUser = new ConcurrentHashMap<>();

    public WebScanExitDahuaLinkageService(
            @Qualifier("twinSwingTaskScheduler") ThreadPoolTaskScheduler twinSwingTaskScheduler,
            AccessRuleDispatchService accessRuleDispatchService,
            TwinCardMappingService twinCardMappingService,
            DahuaSwingRuleConfigService dahuaSwingRuleConfigService) {
        this.twinSwingTaskScheduler = twinSwingTaskScheduler;
        this.accessRuleDispatchService = accessRuleDispatchService;
        this.twinCardMappingService = twinCardMappingService;
        this.dahuaSwingRuleConfigService = dahuaSwingRuleConfigService;
    }

    public int resolveDeferSeconds() {
        Map<String, Object> cfg = dahuaSwingRuleConfigService.getConfig();
        Object raw = cfg.get("scanLeaveDahuaDeferSeconds");
        int v = raw instanceof Number n ? n.intValue() : Integer.parseInt(String.valueOf(raw != null ? raw : "0").trim());
        if (v < 0) {
            return 0;
        }
        return Math.min(v, MAX_DEFER_SECONDS);
    }

    /**
     * 执行大华回收 +（条件满足时）关闭豁免 + 冻结物理卡；若 deferSeconds&gt;0 则异步延后执行。
     *
     * @return 立即执行时的派发结果；延迟时为 {@code null}（调用方勿用于同步 hint）
     */
    public AccessRuleDispatchResult revokeAndFreezeAfterExit(
            String userId,
            String effectiveRoomId,
            String physicalCardNo,
            boolean isKeepCard,
            int deferSeconds) {
        String uid = userId != null ? userId.trim() : "";
        int d = deferSeconds < 0 ? 0 : Math.min(deferSeconds, MAX_DEFER_SECONDS);
        if (d <= 0) {
            cancelPendingDeferredExitForUser(uid);
            return runLinkage(userId, effectiveRoomId, physicalCardNo, isKeepCard);
        }
        String rid = effectiveRoomId != null ? effectiveRoomId.trim() : "";
        String card = physicalCardNo != null ? physicalCardNo.trim() : "";
        boolean keep = isKeepCard;

        cancelPendingDeferredExitForUser(uid);

        AtomicReference<ScheduledFuture<?>> selfRef = new AtomicReference<>();
        ScheduledFuture<?> fut = twinSwingTaskScheduler.schedule(() -> {
            try {
                runLinkage(uid, rid, card, keep);
                log.info("[scan-exit-dahua] deferred linkage done userId={} roomId={} delaySec={}", uid, rid, d);
            } catch (Exception e) {
                log.warn("[scan-exit-dahua] deferred linkage failed userId={} roomId={} err={}", uid, rid, e.getMessage(), e);
            } finally {
                ScheduledFuture<?> s = selfRef.get();
                if (s != null) {
                    pendingDeferredByUser.remove(uid, s);
                }
            }
        }, Instant.now().plusSeconds(d));
        selfRef.set(fut);
        ScheduledFuture<?> prev = pendingDeferredByUser.put(uid, fut);
        if (prev != null && !prev.isDone()) {
            prev.cancel(false);
        }
        log.info("[scan-exit-dahua] deferred linkage scheduled userId={} roomId={} delaySec={}", uid, rid, d);
        return null;
    }

    /**
     * 取消该用户尚未执行的「延迟回收/冻结」任务（例如用户已在延迟期内再次扫码进入并解冻）。
     */
    public void cancelPendingDeferredExitForUser(String userId) {
        String uid = userId != null ? userId.trim() : "";
        if (uid.isEmpty()) {
            return;
        }
        ScheduledFuture<?> f = pendingDeferredByUser.remove(uid);
        if (f != null && !f.isDone()) {
            boolean cancelled = f.cancel(false);
            if (cancelled) {
                log.info("[scan-exit-dahua] cancelled pending deferred linkage userId={}", uid);
            }
        }
    }

    private AccessRuleDispatchResult runLinkage(String userId, String effectiveRoomId, String physicalCardNo, boolean isKeepCard) {
        AccessRuleDispatchResult dispatchResult =
                accessRuleDispatchService.tryRevokeAccessForScanExit(effectiveRoomId, userId);
        if (!isKeepCard && physicalCardNo != null && !physicalCardNo.isBlank()) {
            try {
                twinCardMappingService.updateExemptFlagByUserId(userId, 0);
            } catch (Exception e) {
                log.warn("[scan-exit-dahua] update exempt failed userId={} err={}", userId, e.getMessage());
            }
        }
        if (physicalCardNo != null && !physicalCardNo.isBlank()) {
            twinCardMappingService.updateCardStatus(physicalCardNo, "FROZEN");
        }
        return dispatchResult;
    }
}
