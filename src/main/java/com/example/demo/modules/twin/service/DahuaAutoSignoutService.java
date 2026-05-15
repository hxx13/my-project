package com.example.demo.modules.twin.service;

import com.example.demo.modules.accessrule.service.AccessRuleDispatchService;
import com.example.demo.modules.aro.dto.AroRecord;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.twin.entity.TwinCardMapping;
import com.example.demo.modules.twin.support.TwinSwingLinkageDetailBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 联动规则触发的自动离开。
 * <p>默认（门禁联动规则配置 {@code autoRiskActionEnabled=true}）：ARO 登记离开后，若全局允许则调用大华回收接口；
 * 映射卡冻结等本地风控与 {@code twin_access_rule_scan_config.exit_dispatch_enabled} 解耦，不因关闭「离开大华回收」而跳过。</p>
 * <p>关闭 {@code autoRiskActionEnabled} 后：仅执行 ARO 离开登记与小穿甲同步，不 revoke、不冻结。两开关叠加：任一层关闭则不会调用大华回收接口。</p>
 */
@Service
public class DahuaAutoSignoutService {
    private static final Logger log = LoggerFactory.getLogger(DahuaAutoSignoutService.class);
    /** 同一用户「官方已无余房、仅对齐」类成功审计，避免定时器每几秒刷一条误导性记录 */
    private static final ConcurrentHashMap<String, Long> EMPTY_ARO_SYNC_LOG_AT_MS = new ConcurrentHashMap<>();
    private static final long EMPTY_ARO_SYNC_LOG_COOLDOWN_MS = 180_000L;

    private final AroService aroService;
    private final TwinCardMappingService twinCardMappingService;
    private final DahuaSwingRuleConfigService dahuaSwingRuleConfigService;
    private final AccessRuleDispatchService accessRuleDispatchService;
    private final TwinAutomationLogService automationLogService;
    private final AroMiniPenetrationSyncService miniPenetrationSyncService;
    private final TwinAccessLogCorrelationService twinAccessLogCorrelationService;
    private final TwinAccessRuleScanConfigService twinAccessRuleScanConfigService;

    public DahuaAutoSignoutService(
            AroService aroService,
            TwinCardMappingService twinCardMappingService,
            DahuaSwingRuleConfigService dahuaSwingRuleConfigService,
            AccessRuleDispatchService accessRuleDispatchService,
            TwinAutomationLogService automationLogService,
            AroMiniPenetrationSyncService miniPenetrationSyncService,
            TwinAccessLogCorrelationService twinAccessLogCorrelationService,
            TwinAccessRuleScanConfigService twinAccessRuleScanConfigService
    ) {
        this.aroService = aroService;
        this.twinCardMappingService = twinCardMappingService;
        this.dahuaSwingRuleConfigService = dahuaSwingRuleConfigService;
        this.accessRuleDispatchService = accessRuleDispatchService;
        this.automationLogService = automationLogService;
        this.miniPenetrationSyncService = miniPenetrationSyncService;
        this.twinAccessLogCorrelationService = twinAccessLogCorrelationService;
        this.twinAccessRuleScanConfigService = twinAccessRuleScanConfigService;
    }

    public boolean autoSignout(String userId) {
        return autoSignout(userId, "SYSTEM", "AUTO_SIGNOUT", null);
    }

    public boolean autoSignout(String userId, String triggerType, String triggerReason, String detail) {
        if (userId == null || userId.isBlank()) {
            writeAutoLog(userId, triggerType, triggerReason, false,
                    augmentLinkageSignoutDetail(triggerReason, mergeDetail(detail, "用户ID为空，无法签退"), false, userId));
            return false;
        }
        log.info("[auto-signout] start userId={}", userId);
        List<Map<String, Object>> noLeaveRooms = aroService.getNoLeaveRoom(userId);
        // null 代表上游请求失败（如 TLS/握手异常），不要当作“已离开”处理
        if (noLeaveRooms == null) {
            log.warn("[auto-signout] no-leave-room query failed userId={}", userId);
            writeAutoLog(userId, triggerType, triggerReason, false,
                    augmentLinkageSignoutDetail(triggerReason, mergeDetail(detail, "ARO「未离开房间」查询失败（网络或上游异常）"), false, userId));
            return false;
        }
        // 空列表代表官方已无滞留，视为状态已同步，可清理本地待签退状态
        if (noLeaveRooms.isEmpty()) {
            log.info("[auto-signout] no-leave-room empty userId={} treatAsSynced=true", userId);
            String reasonForLog = triggerReason;
            if ("ACTIVATION_EXPIRE_AUTO_SIGNOUT".equalsIgnoreCase(triggerReason)) {
                reasonForLog = "LINKAGE_TIMER_ARO_ALREADY_CLEAR";
            }
            String shortDetail = "查询官方滞留：已无待离开房间；本次不重复提交离馆登记，仅清理本地联动占位。"
                    + (detail != null && !detail.isBlank() ? " 原计划说明：" + detail : "");
            if (isSwingLinkageStyleReason(triggerReason)) {
                shortDetail = shortDetail + " " + linkageTimerClearOutcome(triggerReason);
            }
            long nowMs = System.currentTimeMillis();
            Long last = EMPTY_ARO_SYNC_LOG_AT_MS.get(userId);
            boolean debounce = last != null && (nowMs - last) < EMPTY_ARO_SYNC_LOG_COOLDOWN_MS
                    && "LINKAGE_TIMER_ARO_ALREADY_CLEAR".equals(reasonForLog);
            if (!debounce) {
                EMPTY_ARO_SYNC_LOG_AT_MS.put(userId, nowMs);
                writeAutoLog(userId, triggerType, reasonForLog, true, shortDetail);
            }
            return true;
        }
        Map<String, Object> first = noLeaveRooms.get(0);
        String roomId = asString(first.get("roomId"));
        if (roomId.isBlank()) {
            roomId = asString(first.get("id"));
        }
        if (roomId.isBlank()) {
            log.warn("[auto-signout] resolve roomId failed userId={} firstRow={}", userId, first);
            writeAutoLog(userId, triggerType, triggerReason, false,
                    augmentLinkageSignoutDetail(triggerReason, mergeDetail(detail, "未能从滞留记录解析房间"), false, userId));
            return false;
        }
        String roomLabel = resolveRoomDisplayLabel(first, roomId);
        log.info("[auto-signout] resolved room userId={} roomId={}", userId, roomId);
        boolean signoutOk = aroService.submitAccessRecord(userId, roomId, 2);
        if (!signoutOk) {
            log.warn("[auto-signout] aro signout rejected userId={} roomId={}", userId, roomId);
            writeAutoLog(userId, triggerType, triggerReason, false,
                    augmentLinkageSignoutDetail(triggerReason, mergeDetail(detail,
                            "ARO 提交离开登记失败（" + roomLabel + "）"), false, userId));
            return false;
        }
        log.info("[auto-signout] aro signout success userId={} roomId={}", userId, roomId);
        triggerMiniAroPenetrationRequest(userId, 2);

        if (!postAutoLeaveLinkageEnabled()) {
            log.info("[auto-signout] post-leave linkage disabled userId={} roomId={} (aro-only mode)", userId, roomId);
            String msg;
            if (isSwingLinkageStyleReason(triggerReason)) {
                msg = mergeDetail(detail, "ARO 离开登记已完成（" + roomLabel + "）。");
                msg = augmentLinkageSignoutDetail(triggerReason, msg, true, userId);
            } else {
                msg = mergeDetail(detail,
                        "仅 ARO 签退完成：" + roomLabel
                                + "；未撤销大华门禁权限、未冻结（门禁联动规则 autoRiskActionEnabled=关闭）");
            }
            Long auditId = writeAutoLogReturning(userId, triggerType, triggerReason, true, msg);
            registerSignoutCorrelation(userId, roomId, auditId, msg);
            return true;
        }

        if (twinAccessRuleScanConfigService.isExitDispatchEnabled()) {
            try {
                accessRuleDispatchService.tryRevokeAccessForScanExit(roomId, userId);
            } catch (Exception e) {
                log.warn("[auto-signout] 大华门禁规则 revoke 异常 userId={} roomId={}: {}", userId, roomId, e.getMessage());
            }
        } else {
            log.info("[auto-signout] skip-dahua-revoke exit_dispatch_disabled userId={} roomId={}", userId, roomId);
        }

        runRiskActions(userId);
        log.info("[auto-signout] done userId={}", userId);
        String msg;
        if (isSwingLinkageStyleReason(triggerReason)) {
            msg = mergeDetail(detail, "ARO 离开登记已完成（" + roomLabel + "）。");
            msg = augmentLinkageSignoutDetail(triggerReason, msg, true, userId);
        } else {
            msg = mergeDetail(detail,
                    "自动离开完成：已尝试撤销大华门禁权限并执行冻结检查（" + roomLabel + "）");
        }
        Long auditId = writeAutoLogReturning(userId, triggerType, triggerReason, true, msg);
        registerSignoutCorrelation(userId, roomId, auditId, msg);
        return true;
    }

    private void registerSignoutCorrelation(String userId, String roomId, Long automationLogId, String detailForMatch) {
        if (automationLogId == null) {
            return;
        }
        twinAccessLogCorrelationService.registerPending(
                2,
                userId,
                roomId,
                TwinAccessLogCorrelationService.SOURCE_AUTO_SIGNOUT,
                automationLogId,
                "孪生·自动离开（ARO 离开登记）",
                detailForMatch != null ? detailForMatch : ""
        );
    }

    /** 仅用于面向人的日志文案，不附带 roomId 等技术标识 */
    private String resolveRoomDisplayLabel(Map<String, Object> row, String roomId) {
        if (row != null) {
            for (String key : List.of("roomName", "room_name", "name", "title", "roomTitle")) {
                String v = asString(row.get(key));
                if (!v.isBlank()) {
                    return v;
                }
            }
        }
        return roomId.isBlank() ? "当前房间" : "房间";
    }

    /** 写入自动签退审计；detail 建议为中文叙述。 */
    private void writeAutoLog(String userId, String triggerType, String triggerReason, boolean success, String detail) {
        writeAutoLogReturning(userId, triggerType, triggerReason, success, detail);
    }

    private Long writeAutoLogReturning(String userId, String triggerType, String triggerReason, boolean success, String detail) {
        return automationLogService.writeReturningId(
                TwinAutomationLogService.TYPE_AUTO_SIGNOUT,
                "AUTO_SIGNOUT_EXEC",
                triggerType,
                triggerReason,
                userId,
                null,
                success,
                detail,
                "dahua-auto-signout"
        );
    }

    private String mergeDetail(String detail, String append) {
        if (detail == null || detail.isBlank()) {
            return append;
        }
        if (append == null || append.isBlank()) {
            return detail;
        }
        return detail + " | " + append;
    }

    private String asString(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    /**
     * 门禁联动规则页唯一开关：开启则自动签退后继续 revoke 大华权限并冻结；关闭则仅 ARO 签退。
     */
    private boolean postAutoLeaveLinkageEnabled() {
        try {
            Map<String, Object> cfg = dahuaSwingRuleConfigService.getConfig();
            return parseConfigToggle(cfg.get("autoRiskActionEnabled"), true);
        } catch (Exception ignore) {
            return true;
        }
    }

    /** 解析开关：支持 Boolean、0/1、false/true 字符串；异常或未知时返回 defaultVal */
    private static boolean parseConfigToggle(Object v, boolean defaultVal) {
        if (v == null) {
            return defaultVal;
        }
        if (v instanceof Boolean b) {
            return b;
        }
        if (v instanceof Number n) {
            return n.intValue() != 0;
        }
        String s = String.valueOf(v).trim().toLowerCase();
        if (s.isEmpty()) {
            return defaultVal;
        }
        if ("false".equals(s) || "0".equals(s) || "no".equals(s) || "off".equals(s)) {
            return false;
        }
        if ("true".equals(s) || "1".equals(s) || "yes".equals(s) || "on".equals(s)) {
            return true;
        }
        return defaultVal;
    }

    private static boolean isSwingLinkageStyleReason(String reason) {
        if (reason == null) {
            return false;
        }
        String u = reason.toUpperCase(Locale.ROOT);
        return "ACTIVATION_EXPIRE_AUTO_SIGNOUT".equals(u)
                || "SWING_EXIT_DELAY_AUTO_SIGNOUT".equals(u)
                || "ACTIVATED_SLA_EXPIRE_AUTO_SIGNOUT".equals(u);
    }

    /**
     * 联动类自动签退：在详情末尾统一补「后置风控是否撤销/冻结」与状态时间，便于与瀑布流溯源对照。
     */
    private String augmentLinkageSignoutDetail(String triggerReason, String detail, boolean success, String userId) {
        if (!isSwingLinkageStyleReason(triggerReason)) {
            return detail;
        }
        if (success) {
            return mergeDetail(detail, linkageSuccessOutcomeLine(userId));
        }
        return mergeDetail(detail, "状态：失败；时间：" + TwinSwingLinkageDetailBuilder.nowTs() + "。");
    }

    private String linkageSuccessOutcomeLine(String userId) {
        String time = TwinSwingLinkageDetailBuilder.nowTs();
        if (!postAutoLeaveLinkageEnabled()) {
            return "自动离开后置开关（autoRiskActionEnabled）为关闭：未自动删除大华联动门禁权限、未自动冻结权限；"
                    + "仍已发起小穿甲流水同步。状态：已完成；时间：" + time + "。";
        }
        if (!twinAccessRuleScanConfigService.isExitDispatchEnabled()) {
            try {
                TwinCardMapping m = twinCardMappingService.getByAroUserId(userId);
                if (m == null) {
                    return "全局「扫码离开门禁联动」为关闭：未调用大华接口回收门禁规则权限；未找到孪生卡映射，未执行冻结。状态：已完成；时间：" + time + "。";
                }
                if (m.getFreezeExemptFlag() != null && m.getFreezeExemptFlag() == 1) {
                    return "全局「扫码离开门禁联动」为关闭：未调用大华接口回收门禁规则权限；卡片为免冻结豁免，未自动冻结。状态：已完成；时间：" + time + "。";
                }
                if (m.getCardNo() != null && !m.getCardNo().isBlank()) {
                    return "全局「扫码离开门禁联动」为关闭：未调用大华接口回收门禁规则权限；已按自动签退策略尝试冻结映射卡。状态：已完成；时间：" + time + "。";
                }
                return "全局「扫码离开门禁联动」为关闭：未调用大华接口回收门禁规则权限。状态：已完成；时间：" + time + "。";
            } catch (Exception e) {
                return "全局「扫码离开门禁联动」为关闭：未回收大华权限；读取卡映射异常。状态：已完成；时间：" + time + "。";
            }
        }
        try {
            TwinCardMapping m = twinCardMappingService.getByAroUserId(userId);
            if (m == null) {
                return "已自动删除大华联动门禁权限（撤销下发）；未找到孪生卡映射，未执行冻结。状态：已完成；时间：" + time + "。";
            }
            if (m.getFreezeExemptFlag() != null && m.getFreezeExemptFlag() == 1) {
                return "已自动删除大华联动门禁权限（撤销下发）；卡片为免冻结豁免，未自动冻结权限。状态：已完成；时间：" + time + "。";
            }
            return "已自动删除大华联动门禁权限（撤销下发）；已自动冻结权限（映射卡置为冻结）。状态：已完成；时间：" + time + "。";
        } catch (Exception e) {
            return "已尝试删除大华联动门禁权限并冻结；读取卡映射异常，未补全冻结说明。状态：已完成；时间：" + time + "。";
        }
    }

    private String linkageTimerClearOutcome(String originalTriggerReason) {
        String time = TwinSwingLinkageDetailBuilder.nowTs();
        if (isSwingLinkageStyleReason(originalTriggerReason)) {
            return "官方侧已无余房，本次未再提交离馆；联动占位已清理。状态：已完成；时间：" + time + "。";
        }
        return "状态：已完成；时间：" + time + "。";
    }

    private void runRiskActions(String userId) {
        try {
            TwinCardMapping mapping = twinCardMappingService.getByAroUserId(userId);
            if (mapping == null) {
                return;
            }
            if (mapping.getFreezeExemptFlag() != null && mapping.getFreezeExemptFlag() == 1) {
                return;
            }
            if (mapping.getCardNo() != null && !mapping.getCardNo().isBlank()) {
                twinCardMappingService.updateCardStatus(mapping.getCardNo(), "FROZEN");
            }
        } catch (Exception e) {
            log.warn("[auto-signout] runRiskActions 冻结失败 userId={} err={}", userId, e.getMessage(), e);
        }
    }

    /**
     * 离开闭环后的轻量穿甲请求（异步，不阻塞主流程）。
     * 小请求接口说明：
     * GET /jtu/api/access/record/list?pageNum=1&pageSize=20
     * 项目内统一由 AroService.fetchLatestRecordsForRealtime(20) 发起。
     */
    private void triggerMiniAroPenetrationRequest(String userId, Integer expectedAccessType) {
        CompletableFuture.runAsync(() -> {
            try {
                AroRecord target = miniPenetrationSyncService.syncLatestForUser(userId, expectedAccessType, 20, true);
                if (target == null) {
                    log.info("[auto-signout] mini-penetration requested userId={} fetched=0", userId);
                    return;
                }
                log.info("[auto-signout] mini-penetration requested userId={} expectedAccessType={} targetRecordId={}",
                        userId, expectedAccessType, target.getId());
            } catch (Exception e) {
                log.warn("[auto-signout] mini-penetration failed userId={} err={}", userId, e.getMessage());
            }
        });
    }
}
