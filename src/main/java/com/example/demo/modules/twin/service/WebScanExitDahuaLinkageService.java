package com.example.demo.modules.twin.service;

import com.example.demo.modules.accessrule.service.AccessRuleDispatchResult;
import com.example.demo.modules.accessrule.service.AccessRuleDispatchService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.stereotype.Service;

import org.springframework.beans.factory.annotation.Qualifier;

import java.time.Instant;
import java.util.Map;

/**
 * Web 扫码离开在 ARO 成功后：大华门禁回收与物理卡冻结可配置延迟执行（秒），0 表示保持原有同步行为。
 */
@Service
public class WebScanExitDahuaLinkageService {
    private static final Logger log = LoggerFactory.getLogger(WebScanExitDahuaLinkageService.class);
    private static final int MAX_DEFER_SECONDS = 3600;

    private final ThreadPoolTaskScheduler twinSwingTaskScheduler;
    private final AccessRuleDispatchService accessRuleDispatchService;
    private final TwinCardMappingService twinCardMappingService;
    private final DahuaSwingRuleConfigService dahuaSwingRuleConfigService;

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
        int d = deferSeconds < 0 ? 0 : Math.min(deferSeconds, MAX_DEFER_SECONDS);
        if (d <= 0) {
            return runLinkage(userId, effectiveRoomId, physicalCardNo, isKeepCard);
        }
        String uid = userId != null ? userId.trim() : "";
        String rid = effectiveRoomId != null ? effectiveRoomId.trim() : "";
        String card = physicalCardNo != null ? physicalCardNo.trim() : "";
        boolean keep = isKeepCard;
        twinSwingTaskScheduler.schedule(() -> {
            try {
                runLinkage(uid, rid, card, keep);
                log.info("[scan-exit-dahua] deferred linkage done userId={} roomId={} delaySec={}", uid, rid, d);
            } catch (Exception e) {
                log.warn("[scan-exit-dahua] deferred linkage failed userId={} roomId={} err={}", uid, rid, e.getMessage(), e);
            }
        }, Instant.now().plusSeconds(d));
        log.info("[scan-exit-dahua] deferred linkage scheduled userId={} roomId={} delaySec={}", uid, rid, d);
        return null;
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
