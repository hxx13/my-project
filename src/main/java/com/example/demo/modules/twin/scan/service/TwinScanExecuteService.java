package com.example.demo.modules.twin.scan.service;

import com.example.demo.common.config.DebugToggleService;
import com.example.demo.modules.accessrule.service.AccessRuleDispatchResult;
import com.example.demo.modules.accessrule.service.AccessRuleDispatchService;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.service.UserGroupNameResolver;
import com.example.demo.modules.student.service.MobilePresenceNotifyService;
import com.example.demo.modules.twin.card.service.TwinAccessLogCorrelationService;
import com.example.demo.modules.twin.card.service.TwinCardMappingService;
import com.example.demo.modules.twin.card.support.ExemptChangeContext;
import com.example.demo.modules.twin.common.service.RoomDictionaryManager;
import com.example.demo.modules.twin.common.service.TwinAutomationLogService;
import com.example.demo.modules.twin.dahua.service.DahuaSwingRuleConfigService;
import com.example.demo.modules.twin.dahua.service.DahuaSwingRuleEngineService;
import com.example.demo.modules.twin.dashboard.service.TwinStudentViolationNoticeConfigService;
import com.example.demo.modules.twin.dashboard.service.TwinStudentViolationService;
import com.example.demo.modules.twin.rpg.service.RpgEngineService;
import com.example.demo.modules.twin.rpg.service.TwinExpStatsService;
import com.example.demo.modules.twin.scan.dto.ScanExecuteResponseDTO;
import com.example.demo.modules.twin.scan.mobile.MobileEnterGrantService;
import com.example.demo.modules.twin.scan.state.ScanDataSource;
import com.example.demo.modules.twin.scan.state.ScanOccupancyStateService;
import com.example.demo.modules.twin.scan.support.ScanPopupEntryWindowEvaluator;
import com.example.demo.modules.twin.scan.support.ScanPopupFlowLog;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.ZoneId;
import java.util.List;
import java.util.Map;

/**
 * 扫码「登记」正文（原 TwinScanController#executeScan 原样搬迁）。
 *
 * <p>刷卡弹窗（{@link ClientKind#SCAN_POPUP}）与移动端房间页（{@link ClientKind#MOBILE_ROOM}）
 * 共用同一条执行链路，行为完全一致；两处差异仅由 clientKind 决定：
 * 留痕 sourceTag、以及是否走移动端灰度门控。
 */
@Service
public class TwinScanExecuteService {

    private static final Logger log = LoggerFactory.getLogger(TwinScanExecuteService.class);

    public enum ClientKind {
        SCAN_POPUP,
        MOBILE_ROOM;

        public static ClientKind resolve(String raw) {
            if (raw == null) return SCAN_POPUP;
            return "MOBILE_ROOM".equalsIgnoreCase(raw.trim()) ? MOBILE_ROOM : SCAN_POPUP;
        }
    }

    @Autowired
    private TwinScanService twinScanService;

    @Autowired
    private TwinCardMappingService twinCardMappingService;

    @Autowired
    private RpgEngineService rpgEngineService;

    @Autowired
    private TwinExpStatsService twinExpStatsService;

    @Autowired
    private AccessRuleDispatchService accessRuleDispatchService;

    @Autowired
    private DahuaSwingRuleEngineService dahuaSwingRuleEngineService;

    @Autowired
    private TwinAutomationLogService twinAutomationLogService;

    @Autowired
    private DahuaSwingRuleConfigService dahuaSwingRuleConfigService;

    @Autowired
    private WebScanExitDahuaLinkageService webScanExitDahuaLinkageService;

    @Autowired
    private TwinAccessRuleScanConfigService twinAccessRuleScanConfigService;

    @Autowired
    private MobilePresenceNotifyService mobilePresenceNotifyService;

    @Autowired
    private TwinStudentViolationService twinStudentViolationService;

    @Autowired
    private TwinStudentViolationNoticeConfigService unboundNoticeConfigService;

    @Autowired
    private RoomDictionaryManager roomDictionaryManager;

    @Autowired
    private AroService aroService;

    @Autowired
    private AroPersonnelMapper aroPersonnelMapper;

    @Autowired
    private DebugToggleService debugToggleService;

    @Autowired
    private ScanOccupancyStateService scanOccupancyStateService;

    @Autowired
    private MobileEnterGrantService mobileEnterGrantService;

    @Autowired
    private UserGroupNameResolver userGroupNameResolver;

    @Value("${app.business-timezone:Asia/Shanghai}")
    private String businessTimeZone;

    public ScanExecuteResponseDTO execute(Map<String, Object> payload,
                                          User operator,
                                          String operatorRoleHint,
                                          ClientKind clientKind) {
        ScanExecuteResponseDTO result = new ScanExecuteResponseDTO();
        ScanPopupFlowLog.ExecuteSummary flowLog = new ScanPopupFlowLog.ExecuteSummary();
        boolean mobileOrigin = clientKind == ClientKind.MOBILE_ROOM;
        String sourceTag = mobileOrigin
                ? TwinAccessLogCorrelationService.SOURCE_MOBILE_ROOM
                : TwinAccessLogCorrelationService.SOURCE_WEB_SCAN;
        try {
            String rawUserId = (String) payload.get("userId");
            String userId = userGroupNameResolver.canonicalUserId(rawUserId);
            String roomId = (String) payload.get("roomId");
            String roomName = payload.get("roomName") != null ? String.valueOf(payload.get("roomName")) : "";
            int accessType = "ENTER".equals(payload.get("action")) ? 1 : 2;

            // 提取各种特殊标志
            boolean isSharedCard = Boolean.TRUE.equals(payload.get("isSharedCard"));
            boolean isKeepCard = Boolean.TRUE.equals(payload.get("isKeepCard"));

            Object borrowedObj = payload.get("isBorrowedCard");
            boolean isBorrowedCard = borrowedObj != null && Boolean.parseBoolean(borrowedObj.toString());

            // 姓名：调用方带了就用；没带（移动端、未来的自动化调用）回落到 aro_personnel，
            // 否则经验流水与溯源日志会写成「未知人员」，事后查不到是谁刷开的门。
            String userName = payload.containsKey("userName") ? (String) payload.get("userName") : null;
            if (userName == null || userName.isBlank()) {
                userName = resolvePersonnelName(userId);
            }

            flowLog.userId = userId;
            flowLog.userName = userName;
            flowLog.accessType = accessType;
            flowLog.borrowedCard = isBorrowedCard;

            String dahuaSeq = null;
            String physicalCardNo = null;
            com.example.demo.modules.twin.card.entity.TwinCardMapping mapping = twinCardMappingService.getByAroUserId(userId);
            if (mapping != null) {
                dahuaSeq = mapping.getDahuaSeq();
                physicalCardNo = mapping.getCardNo();
            }
            flowLog.hasPhysicalMapping = mapping != null;

            String roomLabel;
            if (roomName != null && !roomName.isBlank()) {
                roomLabel = roomName;
            } else if (roomId != null && !roomId.isBlank()) {
                String resolved = resolveRoomName(roomId);
                roomLabel = resolved != null ? resolved : "（房间名未传）";
            } else {
                roomLabel = "（房间名未传）";
            }
            flowLog.roomLabel = roomLabel;

            if (clientKind == ClientKind.MOBILE_ROOM) {
                if (userId == null || userId.isBlank() || !mobileEnterGrantService.isVisibleFor(userId)) {
                    result.setSuccess(false);
                    result.setMessage("该功能未对你开放，请联系管理员。");
                    flowLog.fail("灰度未开放");
                    return result;
                }
            }

            Map<String, Object> swingCfg = dahuaSwingRuleConfigService.getConfig();
            ZoneId winZone;
            try {
                winZone = ZoneId.of(businessTimeZone != null ? businessTimeZone : "Asia/Shanghai");
            } catch (Exception e) {
                winZone = ZoneId.systemDefault();
            }
            if (accessType == 1
                    && !ScanPopupEntryWindowEvaluator.isEntryAllowedNow(swingCfg, winZone)
                    && !twinCardMappingService.isRoomExemptForScanEntry(userId, roomId)) {
                result.setSuccess(false);
                result.setMessage("当前不在允许扫码进入的时段内，请稍后再试");
                flowLog.fail("非开放时段");
                return result;
            }

            if (accessType == 1 && twinStudentViolationService.isEnterBlocked(userId)) {
                result.setSuccess(false);
                result.setMessage("违规处理中：已被禁止进入或进入次数已达上限，请联系管理员在「学生违规管理」中解除。");
                flowLog.fail("违规禁入");
                return result;
            }

            if (accessType == 1 && unboundNoticeConfigService.isUnboundEnterForbidden(mapping != null, operator, operatorRoleHint)) {
                result.setSuccess(false);
                result.setMessage("未绑定校园卡：当前策略禁止扫码进入，请先完成绑卡或在「学生违规管理」中调整未绑卡提示设置。");
                flowLog.fail("未绑卡禁入");
                return result;
            }

            // 方向化重构后：签退倒计时期间允许手动强制离开（打断倒计时立即签退），移除原倒计时拦截

            // 离开前先解析官方正确房间号：避免 roomId 为空/过期导致 ARO 误报「无房间需要离开」
            String effectiveRoomId = roomId;
            if (accessType == 2) {
                String resolved = resolveOfficialRoomIdFromAro(userId, roomId, roomName);
                if (resolved != null && !resolved.isBlank()) {
                    effectiveRoomId = resolved;
                }
            }

            // =================================================================
            // 💥 第一关：ARO 官方登记 + 预同步本地流水 + 经验值计算（全部在 executeAccessAction 内完成）
            // =================================================================
            boolean aroSuccess = twinScanService.executeAccessAction(userId, effectiveRoomId, accessType, isSharedCard, isKeepCard, dahuaSeq, isBorrowedCard, sourceTag);
            boolean healedNoLeaveConflict = (accessType == 2 && aroService.isNoLeaveRoomError());

            if (!aroSuccess) {
                result.setSuccess(false);
                String aroMsg = aroService.getLastAroErrorMessage();
                result.setMessage((aroMsg == null || aroMsg.isBlank()) ? "打卡被官方系统拒绝，请检查人员权限！" : aroMsg);
                flowLog.fail("ARO拒绝");
                return result;
            }

            // 关键同步规则：
            // 任何“离开(accessType=2)”在 ARO 官方登记成功后，都必须清理大华联动状态，
            // 避免 twin_dahua_activation_state 残留导致定时器重复探测/重复签退。
            if (accessType == 2) {
                dahuaSwingRuleEngineService.clearActivationStatesForUser(userId);
            }

            // ENTER：取消尚未执行的「离开延迟冻结」+ 清理刷卡联动计时器，避免换房进入后被旧计时器再次签退
            if (accessType == 1) {
                webScanExitDahuaLinkageService.cancelPendingDeferredExitForUser(userId);
                dahuaSwingRuleEngineService.clearActivationStatesForUser(userId);
            }

            // ENTER：按全局开关解冻；关闭时仍执行 ARO/待激活，但若开启下放则大华可能因「冻结人员不能授权」失败
            if (accessType == 1 && physicalCardNo != null && twinAccessRuleScanConfigService.isEnterUnfreezeEnabled()) {
                try {
                    twinCardMappingService.updateCardStatus(physicalCardNo, "NORMAL");
                } catch (Exception e) {
                    log.error("[扫码·登记] 预解冻失败 id={} cardNo={} err={}", userId, physicalCardNo, e.getMessage(), e);
                    result.setSuccess(false);
                    result.setMessage("登记成功，门禁权限下发已跳过（预解冻未完成）。如有疑问请联系管理员。");
                    flowLog.fail("预解冻失败");
                    return result;
                }
            }

            // 长期保管卡豁免必须先于门禁派发/待激活计时：否则先起算待激活再写豁免，会出现「库里有待激活行但人已是豁免」的短暂不一致
            if (isKeepCard && physicalCardNo != null) {
                twinCardMappingService.updateExemptFlagByUserId(userId, 1, ExemptChangeContext.keepCard());
            }

            int deferSec = 0;
            AccessRuleDispatchResult dispatchResult = null;
            try {
                if (accessType == 1) {
                    dispatchResult = accessRuleDispatchService.tryApplyAccessForScanEnter(effectiveRoomId, userId);
                    // 待激活倒计时：对所有已发卡用户起算（免冻结增强：不再豁免激活规则）
                    dahuaSwingRuleEngineService.startPendingActivationAfterAccessRuleGrant(userId);
                    // 免冻结增强：递增 COUNT/BOTH 模式已使用次数，达到上限自动收回豁免
                    twinCardMappingService.incrementExemptUsedCount(userId, effectiveRoomId);
                } else if (accessType == 2) {
                    deferSec = webScanExitDahuaLinkageService.resolveDeferSeconds();
                    dispatchResult = webScanExitDahuaLinkageService.revokeAndFreezeAfterExit(
                            userId, effectiveRoomId, physicalCardNo, deferSec);
                }
                // 门禁联动结果仅写入自动化日志，不在弹窗展示
                if (accessType == 2 && deferSec > 0) {
                    result.setDeferredDahuaSeconds(deferSec);
                }
            } catch (Exception linkageEx) {
                if (accessType == 2) {
                    log.error("[扫码·登记] 离开联动失败 id={} err={}", userId, linkageEx.getMessage(), linkageEx);
                    result.setSuccess(false);
                    String detail = linkageEx.getMessage() != null ? linkageEx.getMessage() : linkageEx.getClass().getSimpleName();
                    result.setMessage("离开登记成功，门禁联动（权限回收/冻结）未能完成。如有需要请联系管理员处理。详情：" + detail);
                    flowLog.fail("离开联动失败");
                    return result;
                }
                throw linkageEx;
            }

            // =================================================================
            // 🎯 第三关：读取经验增量用于前端展示 + 实时写入 twin_exp_record
            // =================================================================
            com.example.demo.modules.twin.rpg.service.PredictResult predictResult = rpgEngineService.predictActionReward(userId, accessType);
            int expAdded = Math.max(0, predictResult.getExpAdded());
            result.setExpAdded(expAdded);
            result.setExpSource(predictResult.getExpSource());

            // 实时写入经验流水（方案 A 快轨）：设计规格 §5.2 —— 扫码即写，不等待定时对账
            if (expAdded > 0 && predictResult.getExpSource() != null) {
                try {
                    twinExpStatsService.recordExp(
                            userId,
                            userName,
                            expAdded,
                            predictResult.getExpSource(),
                            accessType,
                            effectiveRoomId,
                            roomName,
                            mobileOrigin
                                    ? TwinAccessLogCorrelationService.FEED_SOURCE_MATCHED_MOBILE_ROOM
                                    : "WEB_SCAN",
                            predictResult.getSessionDurationMinutes()
                    );
                } catch (Exception expWriteEx) {
                    // XP 写入失败不阻断扫码成功
                    log.error("[扫码·登记] 经验流水写入失败 userId={} exp={} source={}: {}",
                            userId, expAdded, predictResult.getExpSource(), expWriteEx.getMessage());
                }
            }

            // EXIT：大华回收 + 豁免关闭 + 冻结已由 WebScanExitDahuaLinkageService 处理（可配置延迟）；ENTER 无此处冻结

            if (physicalCardNo != null) {
                try {
                    result.setSuccess(true);
                    if (healedNoLeaveConflict) {
                        result.setMessage("ARO 显示当前已无待离开房间，系统已完成状态自愈同步。");
                    } else {
                        String actMsg;
                        if (accessType == 1) {
                            actMsg = "打卡成功！物理门禁已解锁。";
                        } else if (deferSec > 0) {
                            actMsg = "离开登记成功！大华门禁回收与物理卡冻结将在 " + deferSec + " 秒后执行。";
                        } else if (dispatchResult == AccessRuleDispatchResult.SCAN_LINKAGE_EXIT_DISABLED) {
                            actMsg = "离开登记成功！（大华门禁权限回收已按全局开关跳过）";
                        } else {
                            actMsg = "离开登记成功！权限已回收。";
                        }
                        result.setMessage(actMsg + " 本次经验 +" + expAdded);
                    }
                } catch (Exception e) {
                    log.error("[扫码·登记] 门禁收尾失败 id={} cardNo={} err={}", userId, physicalCardNo, e.getMessage(), e);
                    result.setSuccess(false);
                    result.setMessage("登记成功，物理闸机响应超时。请稍后重试或联系管理员手动处理。");
                    flowLog.fail("门禁收尾失败");
                    return result;
                }
            } else {
                result.setSuccess(true);
                if (healedNoLeaveConflict) {
                    result.setMessage("ARO 显示当前已无待离开房间，系统已完成状态自愈同步。");
                } else {
                    String base = accessType == 1
                            ? "纯数字打卡成功！(未绑定大华物理卡)"
                            : (accessType == 2 && deferSec > 0
                            ? "离开登记成功！大华门禁回收与物理卡冻结将在 " + deferSec + " 秒后执行。"
                            : "离开登记成功！(未绑定大华物理卡)");
                    result.setMessage(base + " 本次经验 +" + expAdded);
                }
            }

            String extra = healedNoLeaveConflict ? "状态自愈" : null;
            flowLog.ok("已登记", ScanPopupFlowLog.linkageShort(accessType, dispatchResult, deferSec, isKeepCard), expAdded, extra);

            if (result.isSuccess() && accessType == 1 && userId != null && !userId.isBlank()) {
                try {
                    twinStudentViolationService.recordSuccessfulEnter(userId);
                } catch (Exception ve) {
                    log.debug("[扫码·登记] 违规计数失败 id={} err={}", userId, ve.getMessage());
                }
            }

            if (result.isSuccess() && userId != null && !userId.isBlank()) {
                com.example.demo.modules.twin.card.entity.TwinCardMapping traceMapping = twinCardMappingService.getByAroUserId(userId);
                if (traceMapping != null) {
                    String actLabel = accessType == 1 ? "进入" : "离开";
                    // 移动端用独立动作码，自动化日志里可与刷卡弹窗自助登记区分（见 TwinAutomationLogDisplayHelper）
                    String tr = mobileOrigin
                            ? (accessType == 1 ? "MOBILE_ROOM_ENTER" : "MOBILE_ROOM_EXIT")
                            : (accessType == 1 ? "SCAN_EXECUTE_ENTER" : "SCAN_EXECUTE_EXIT");
                    String rid = (effectiveRoomId != null && !effectiveRoomId.isBlank()) ? effectiveRoomId : null;
                    twinAutomationLogService.write(
                            TwinAutomationLogService.TYPE_ACCESS_TRACE,
                            "LINKAGE_STEP",
                            "MANUAL",
                            tr,
                            userId,
                            rid,
                            true,
                            (mobileOrigin ? "移动端房间自助进入：动作=" : "自助登记/远程预约：动作=")
                                    + actLabel + "，房间=" + roomLabel + "，人员=" + userName,
                            "twin-scan-execute"
                    );
                }
                mobilePresenceNotifyService.notifyPresenceChanged(
                        userId, accessType == 1 ? "scan_enter" : "scan_exit");
            }

        } catch (Exception e) {
            log.error("[扫码·登记] 异常 {} err={}", e.getClass().getSimpleName(), e.getMessage(), e);
            result.setSuccess(false);
            result.setMessage("系统执行异常: " + e.getMessage());
            flowLog.fail(e.getMessage());
        } finally {
            ScanPopupFlowLog.logExecute(flowLog);
        }
        return result;
    }

    private String resolveOfficialRoomIdFromAro(String userId, String localRoomId, String roomName) {
        if (debugToggleService.getScanDataSource() == ScanDataSource.LOCAL) {
            com.example.demo.modules.twin.scan.state.ScanOccupancyState occ = scanOccupancyStateService.getByUserId(userId);
            if (occ != null && occ.getCurrentRoomId() != null && !occ.getCurrentRoomId().isBlank()) {
                return occ.getCurrentRoomId();
            }
            return null;
        }
        List<Map<String, Object>> noLeaveRooms = aroService.getNoLeaveRoom(userId);
        if (noLeaveRooms == null || noLeaveRooms.isEmpty()) {
            return null;
        }
        if (localRoomId != null && !localRoomId.isBlank()) {
            for (Map<String, Object> r : noLeaveRooms) {
                String id = r.get("id") != null ? String.valueOf(r.get("id")).trim() : "";
                if (localRoomId.equals(id)) {
                    return id;
                }
            }
        }
        if (roomName != null && !roomName.isBlank()) {
            for (Map<String, Object> r : noLeaveRooms) {
                String name = r.get("name") != null ? String.valueOf(r.get("name")).trim() : "";
                if (roomName.equals(name) || normalizeRoomName(roomName).equals(normalizeRoomName(name))) {
                    return r.get("id") != null ? String.valueOf(r.get("id")).trim() : null;
                }
            }
        }
        if (noLeaveRooms.size() == 1) {
            Object idObj = noLeaveRooms.get(0).get("id");
            return idObj != null ? String.valueOf(idObj).trim() : null;
        }
        return null;
    }

    private String resolveRoomName(String roomId) {
        if (roomId == null || roomId.isBlank()) return null;
        try {
            String rid = roomId.trim();
            RoomDictionaryManager.RoomMapping mapped = roomDictionaryManager.translate(rid);
            if (mapped != null && mapped.displayName != null && !mapped.displayName.isBlank()) {
                return mapped.displayName.trim();
            }
        } catch (Exception ignored) {}
        return null;
    }

    /** 入参 userId 需已归一化为 aro_personnel.user_id。查不到才回落「未知人员」。 */
    private String resolvePersonnelName(String canonicalUserId) {
        if (canonicalUserId == null || canonicalUserId.isBlank()) {
            return "未知人员";
        }
        try {
            AroPersonnel p = aroPersonnelMapper.findByUserId(canonicalUserId);
            if (p != null && p.getName() != null && !p.getName().isBlank()) {
                return p.getName().trim();
            }
        } catch (Exception e) {
            log.debug("[扫码·登记] 姓名兜底查询失败 id={} err={}", canonicalUserId, e.getMessage());
        }
        return "未知人员";
    }

    private String normalizeRoomName(String name) {
        if (name == null) {
            return "";
        }
        String s = name.trim();
        int idx = s.indexOf('-');
        if (idx >= 0 && idx + 1 < s.length()) {
            s = s.substring(idx + 1).trim();
        }
        return s.replaceAll("\\s+", "").toUpperCase();
    }
}
