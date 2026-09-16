package com.example.demo.modules.twin.scan.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.entity.UserAroBinding;
import com.example.demo.modules.auth.mapper.UserAroBindingMapper;
import com.example.demo.modules.accessrule.service.AccessRuleDispatchHintHelper;
import com.example.demo.modules.accessrule.service.AccessRuleDispatchResult;
import com.example.demo.modules.twin.scan.dto.ScanAnalyzeResponseDTO;
import com.example.demo.modules.twin.scan.dto.ScanExecuteResponseDTO;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.twin.scan.service.TwinScanAppService;
import com.example.demo.modules.twin.scan.service.TwinScanExecuteService;
import com.example.demo.modules.twin.scan.service.TwinScanNoticeAutoSuppressService;
import com.example.demo.modules.twin.card.service.TwinCardMappingService;
import com.example.demo.modules.twin.card.service.TwinAccessLogCorrelationService;
import com.example.demo.modules.twin.dahua.service.DahuaSwingRuleEngineService;
import com.example.demo.modules.twin.scan.service.TwinScanService;
import com.example.demo.modules.twin.scan.state.ScanDataSource;
import com.example.demo.modules.twin.scan.state.ScanOccupancyState;
import com.example.demo.modules.twin.scan.state.ScanOccupancyStateService;
import com.example.demo.modules.twin.dashboard.service.TwinStudentViolationService;
import com.example.demo.modules.twin.obligation.service.ObligationService;
import com.example.demo.modules.twin.scan.service.WebScanExitDahuaLinkageService;
import com.example.demo.modules.twin.scan.service.TwinAccessRuleScanConfigService;
import com.example.demo.modules.twin.scan.service.DahuaIssueAccessRulePrefillService;
import com.example.demo.modules.twin.scan.service.DahuaIssueCardOrchestratorService;
import com.example.demo.modules.twin.scan.dto.DahuaIssueAccessPrefillVO;
import com.example.demo.modules.twin.scan.dto.DahuaIssueCardRequest;
import com.example.demo.modules.twin.scan.service.DahuaIssueException;
import com.example.demo.modules.twin.card.entity.TwinCardMapping;
import com.example.demo.common.time.BusinessTimeWindow;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.common.service.RoomDictionaryManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/twin/scan")
public class TwinScanController {
    private static final Logger log = LoggerFactory.getLogger(TwinScanController.class);

    // 💥 换回我们的核动力引擎！决不能直接裸调 AroService！
    @Autowired
    private TwinScanService twinScanService;

    @Autowired
    private TwinDashboardMapper dashboardMapper;

    @Autowired
    private BusinessTimeWindow businessTimeWindow;

    @Autowired
    private TwinScanAppService twinScanAppService;

    @Autowired
    private TwinCardMappingService twinCardMappingService; // 🚨 注入我们的极速缓存字典

    @Autowired
    private DahuaSwingRuleEngineService dahuaSwingRuleEngineService;

    @Autowired
    private TwinScanExecuteService twinScanExecuteService;

    @Autowired
    private WebScanExitDahuaLinkageService webScanExitDahuaLinkageService;

    @Autowired
    private TwinAccessRuleScanConfigService twinAccessRuleScanConfigService;

    @Autowired
    private TwinStudentViolationService twinStudentViolationService;

    @Autowired
    private RoomDictionaryManager roomDictionaryManager;

    @Autowired
    private DahuaIssueCardOrchestratorService dahuaIssueCardOrchestratorService;

    @Autowired
    private DahuaIssueAccessRulePrefillService dahuaIssueAccessRulePrefillService;

    @Autowired
    private AuthContextService authContextService;

    @Autowired
    private com.example.demo.modules.twin.common.service.AroMiniPenetrationSyncService aroMiniPenetrationSyncService;

    @Autowired
    private com.example.demo.common.config.DebugToggleService debugToggleService;

    @Autowired
    private ScanOccupancyStateService scanOccupancyStateService;

    @Autowired
    private TwinScanNoticeAutoSuppressService scanNoticeAutoSuppressService;

    @Autowired
    private ObligationService obligationService;

    private static final long STUDENT_DAHUA_BIND_DEPT_ID = 26L;
    private static final java.util.List<Long> STUDENT_DAHUA_BIND_DOOR_GROUP_IDS = java.util.List.of(58L, 59L);


    /**
     * ⚡ 接口一：扫码决断引擎 (The Analyzer) - 升级为【柔性智能路由网关】
     */
    @GetMapping("/analyze")
    public Result<ScanAnalyzeResponseDTO> analyzeScan(
            @RequestParam("userId") String rawInput,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestHeader(value = "X-Scan-Operator-Role", required = false) String operatorRoleHint
    ) {
        try {
            User operator = authContextService.resolveUserFromBearer(authorization);
            ScanAnalyzeResponseDTO dto = twinScanAppService.analyzeScan(rawInput, operator, operatorRoleHint);
            // 笼位处理提示 source 透传（绕过 DTO 编译缓存问题）
            if (dto.getStudentViolationNotice() != null) {
                dto.setStudentViolationSource(dto.getStudentViolationNotice().getSource());
            }
            return Result.success(dto);
        } catch (Exception e) {
            ScanAnalyzeResponseDTO fallback = new ScanAnalyzeResponseDTO();
            fallback.setSuccess(false);
            fallback.setMessage("扫码解析失败: " + e.getMessage());
            return Result.success(fallback);
        }
    }

    /** 扫码端完成交互拼图：永久解除该条违规的禁入（写入库表，跨会话有效） */
    @PostMapping("/violation-interactive-ack")
    public Result<Map<String, Object>> acknowledgeViolationInteractive(
            @RequestBody Map<String, Object> body
    ) {
        try {
            if (body == null) {
                return Result.error("缺少请求体");
            }
            Object idRaw = body.get("violationId");
            long violationId;
            if (idRaw instanceof Number) {
                violationId = ((Number) idRaw).longValue();
            } else if (idRaw != null) {
                violationId = Long.parseLong(String.valueOf(idRaw).trim());
            } else {
                return Result.error("缺少 violationId");
            }
            String userId = body.get("userId") != null ? String.valueOf(body.get("userId")).trim() : "";
            String answer = body.get("answer") != null ? String.valueOf(body.get("answer")) : "";
            var row = twinStudentViolationService.acknowledgeInteractiveChallenge(violationId, userId, answer);
            Map<String, Object> out = new HashMap<>();
            out.put("violationId", row.getId());
            out.put("interactiveChallengeVerified", row.getInteractiveChallengeVerifiedAt() != null);
            out.put("violationExpired", "EXPIRED".equals(row.getStatus()));
            out.put("enterLocked", twinStudentViolationService.isEnterBlocked(userId));
            return Result.success(out);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            log.warn("[scan] violation-interactive-ack failed: {}", e.getMessage());
            return Result.error("交互确认失败: " + e.getMessage());
        }
    }

    /** 触摸屏端答题处置：按违规反查待办并抽题（不含正确答案，校验在提交时进行） */
    @GetMapping("/violation-quiz-draw")
    public Result<ObligationService.QuizDrawPayload> violationQuizDraw(@RequestParam long violationId) {
        try {
            return Result.success(obligationService.drawQuizForViolation(violationId));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            log.warn("[scan] violation-quiz-draw failed violationId={}: {}", violationId, e.getMessage());
            return Result.error("抽题失败: " + e.getMessage());
        }
    }

    /** 被扫码人员对某条通告选择「下次不再自动弹出」（服务端持久化，仅作用于 targetUserId） */
    @PostMapping("/notice-auto-suppress")
    public Result<Map<String, Object>> suppressNoticeAutoOpen(
            @RequestBody com.example.demo.modules.twin.scan.dto.ScanNoticeAutoSuppressRequest body
    ) {
        try {
            if (body == null) {
                return Result.error("缺少请求体");
            }
            String targetUserId = body.getTargetUserId() != null ? body.getTargetUserId().trim() : "";
            String noticeKind = body.getNoticeKind() != null ? body.getNoticeKind().trim() : "";
            Long recordId = body.getRecordId();
            if (recordId == null || recordId <= 0) {
                return Result.error("缺少有效的 recordId");
            }
            scanNoticeAutoSuppressService.suppressForScannedUser(targetUserId, noticeKind, recordId);
            Map<String, Object> out = new HashMap<>();
            out.put("targetUserId", targetUserId);
            out.put("noticeKind", noticeKind);
            out.put("recordId", recordId);
            out.put("autoOpenSuppressed", true);
            return Result.success(out);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            log.warn("[scan] notice-auto-suppress failed: {}", e.getMessage());
            return Result.error("保存失败: " + e.getMessage());
        }
    }

    @PostMapping("/execute")
    public Result<ScanExecuteResponseDTO> executeScan(
            @RequestBody Map<String, Object> payload,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestHeader(value = "X-Scan-Operator-Role", required = false) String operatorRoleHint
    ) {
        User operator = authContextService.resolveUserFromBearer(authorization);
        Object kindRaw = payload.get("clientKind");
        TwinScanExecuteService.ClientKind clientKind =
                TwinScanExecuteService.ClientKind.resolve(kindRaw == null ? null : String.valueOf(kindRaw));
        return Result.success(twinScanExecuteService.execute(payload, operator, operatorRoleHint, clientKind));
    }

    @Autowired
    private AroService aroService;

    @Autowired
    private UserAroBindingMapper userAroBindingMapper;

    // 查询人员状态
    @GetMapping("/user-status")
    public Result<?> getUserStatus(@RequestParam String userId) {
        Map<String, Object> data = aroService.getUserDetailAndDisciplinary(resolveAroUserId(userId));
        return Result.success(data);
    }

    /** 教职工（STAFF_ 前缀）转成 aro_user_id（ARO 接口只认 19 位数字）；学生/无绑定则原样返回。 */
    private String resolveAroUserId(String userId) {
        if (userId == null || userId.isBlank()) return userId;
        String uid = userId.trim();
        if (!uid.startsWith("STAFF_")) return uid;
        try {
            UserAroBinding binding = userAroBindingMapper.selectByUserId(uid);
            if (binding != null && binding.getAroUserId() != null && !binding.getAroUserId().isBlank()) {
                return binding.getAroUserId();
            }
        } catch (Exception e) {
            log.warn("[scan] staff_id→aro 转换失败 id={} err={}", uid, e.getMessage());
        }
        return uid;
    }

    // 修改人员状态
    @PostMapping("/user-status/update")
    public Result<?> updateUserStatus(@RequestBody Map<String, Object> payload) {
        String userId = (String) payload.get("userId");
        Boolean valid = (Boolean) payload.get("valid");
        boolean success = aroService.updateUserState(userId, valid);
        if (success) {
            return Result.success();
        } else {
            return Result.error("官方系统拒绝修改状态");
        }
    }

    /**
     * 扫码终端：查询人员在大华发卡库中的绑卡状态（供学生快捷绑卡二次确认展示）。
     */
    @GetMapping("/card-mapping")
    public Result<Map<String, Object>> getCardMappingForScan(@RequestParam("userId") String userId) {
        String uid = userId != null ? userId.trim() : "";
        if (uid.isEmpty()) {
            return Result.error("缺少 userId");
        }
        TwinCardMapping mapping = twinCardMappingService.getByAroUserId(uid);
        Map<String, Object> resp = new HashMap<>();
        if (mapping == null || mapping.getCardNo() == null || mapping.getCardNo().isBlank()) {
            resp.put("bound", false);
            return Result.success(resp);
        }
        resp.put("bound", true);
        resp.put("cardNo", mapping.getCardNo());
        resp.put("dahuaSeq", mapping.getDahuaSeq());
        resp.put("dahuaPersonCode", mapping.getDahuaPersonCode());
        resp.put("cardStatus", mapping.getCardStatus() != null ? mapping.getCardStatus() : "NORMAL");
        resp.put("freezeExemptFlag", mapping.getFreezeExemptFlag() != null ? mapping.getFreezeExemptFlag() : 0);
        resp.put("userName", mapping.getUserName());
        resp.put("aroUserId", mapping.getAroUserId());
        return Result.success(resp);
    }

    /**
     * 学生扫码快捷绑卡：固定部门 #26、门组 #58/#59；通道仅当「离开时冻结」开启时按门禁规则预填。
     */
    @PostMapping("/student-dahua-bind")
    public Result<?> studentDahuaBind(@RequestBody Map<String, Object> body) {
        String userId = body.get("userId") != null ? String.valueOf(body.get("userId")).trim() : "";
        String cardNo = body.get("cardNo") != null ? String.valueOf(body.get("cardNo")).trim() : "";
        String userName = body.get("userName") != null ? String.valueOf(body.get("userName")).trim() : "";
        if (userId.isEmpty() || cardNo.isEmpty()) {
            return Result.error("缺少人员或卡号");
        }
        if (!cardNo.matches("^[0-9A-Za-z]{8}$")) {
            return Result.error("卡号须为 8 位字母或数字");
        }
        TwinCardMapping existing = twinCardMappingService.getByAroUserId(userId);
        if (existing != null && existing.getCardNo() != null && !existing.getCardNo().isBlank()) {
            return Result.error("该人员已绑卡，请勿重复绑定");
        }
        DahuaIssueCardRequest req = new DahuaIssueCardRequest();
        req.setAroUserId(userId);
        req.setCardNo(cardNo);
        req.setUserName(userName.isEmpty() ? userId : userName);
        req.setDepartmentId(STUDENT_DAHUA_BIND_DEPT_ID);
        req.setDoorGroupIds(new java.util.ArrayList<>(STUDENT_DAHUA_BIND_DOOR_GROUP_IDS));
        java.util.List<String> channels = new java.util.ArrayList<>();
        if (twinAccessRuleScanConfigService.isExitFreezeEnabled()) {
            DahuaIssueAccessPrefillVO prefill = dahuaIssueAccessRulePrefillService.build(userId);
            if (prefill.getDefaultChannelResourceCodes() != null) {
                channels.addAll(prefill.getDefaultChannelResourceCodes());
            }
        }
        req.setChannelResourceCodes(channels);
        try {
            return Result.success(dahuaIssueCardOrchestratorService.issue(req));
        } catch (DahuaIssueException e) {
            return Result.success(e.getResponse());
        } catch (Exception e) {
            return Result.error("绑卡失败: " + e.getMessage());
        }
    }

    /**
     * 📊 房卡与人员实时监控：支持传 roomId 查看单间，或不传查看全校。
     */
    @GetMapping("/room/card-status")
    public com.example.demo.common.dto.Result<?> getRoomCardStatus(
            @RequestParam(value = "roomId", required = false) String roomId) {
        try {
            // 直接调用咱们刚刚写在 Mapper 里的神级 SQL
            BusinessTimeWindow.Window day = businessTimeWindow.todayWindow();
            java.util.List<java.util.Map<String, Object>> statusList = dashboardMapper.getRoomCardStatusList(
                    roomId, day.startInclusive(), day.endExclusive());

            // 如果查的是单个房间，直接返回那个对象；如果是全校，返回数组
            if (roomId != null && !roomId.isEmpty()) {
                if (!statusList.isEmpty()) {
                    return com.example.demo.common.dto.Result.success(statusList.get(0));
                } else {
                    return com.example.demo.common.dto.Result.success(null); // 该房间没数据
                }
            } else {
                return com.example.demo.common.dto.Result.success(statusList);
            }
        } catch (Exception e) {
            log.error("获取房卡监控失败: {}", e.getMessage());
            return com.example.demo.common.dto.Result.error("监控算法异常");
        }
    }

    /**
     * 兼容旧版小程序调用：确认离开（旧路径）
     * 说明：新路径在 /api/v1/twin/audit/manual-exit。
     */
    @PostMapping("/clean-exit")
    public Result<?> cleanExit(@RequestBody Map<String, Object> payload) {
        String userId = payload.get("userId") != null ? String.valueOf(payload.get("userId")).trim() : "";
        String roomId = payload.get("roomId") != null ? String.valueOf(payload.get("roomId")).trim() : "";
        String roomName = payload.get("roomName") != null ? String.valueOf(payload.get("roomName")).trim() : "";

        if (userId.isEmpty()) {
            return Result.error("缺少 userId");
        }

        String officialRoomId = resolveOfficialRoomIdFromAro(userId, roomId, roomName);
        if (officialRoomId == null || officialRoomId.isBlank()) {
            return Result.error("未能定位官方房间ID，请刷新后重试");
        }

        com.example.demo.modules.twin.card.entity.TwinCardMapping mapping = twinCardMappingService.getByAroUserId(userId);
        String dahuaSeq = mapping != null ? mapping.getDahuaSeq() : null;
        String physicalCardNo = mapping != null ? mapping.getCardNo() : null;

        // 对齐 web 扫码离开：ARO 登记 + 预同步 + 经验值计算（全部在 executeAccessAction 核心层完成）
        boolean ok = twinScanService.executeAccessAction(userId, officialRoomId, 2, false, false, dahuaSeq, false, TwinAccessLogCorrelationService.SOURCE_WEB_SCAN);
        if (!ok) {
            return Result.error("离开登记失败，官方系统拒绝操作");
        }
        // 对齐 web 扫码离开：规则命中后执行大华权限回收（可配置延迟）
        int defer = webScanExitDahuaLinkageService.resolveDeferSeconds();
        AccessRuleDispatchResult dispatchResult = webScanExitDahuaLinkageService.revokeAndFreezeAfterExit(
                userId, officialRoomId, physicalCardNo, defer);
        // 文档约束：所有离开成功入口必须清理联动状态，避免后续定时任务重复签退
        dahuaSwingRuleEngineService.clearActivationStatesForUser(userId);

        Map<String, Object> resp = new HashMap<>();
        resp.put("success", true);
        String msg = defer > 0
                ? ("已确认其离开；大华回收与卡冻结将在 " + defer + " 秒后执行")
                : "已确认其离开";
        resp.put("message", msg);
        resp.put("officialRoomId", officialRoomId);
        resp.put("dispatchResult", dispatchResult != null ? dispatchResult.name() : null);
        resp.put("dahuaHint", AccessRuleDispatchHintHelper.humanHint(dispatchResult, 2));
        return Result.success(resp);
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

    private void applyDispatchHint(ScanExecuteResponseDTO result,
                                   AccessRuleDispatchResult dispatchResult,
                                   String roomId,
                                   String userId,
                                   int accessType) {
        if (dispatchResult == null) {
            return;
        }
        String detail = "dispatch=" + dispatchResult +
                ", action=" + (accessType == 1 ? "ENTER" : "EXIT") +
                ", roomId=" + (roomId == null ? "" : roomId) +
                ", userId=" + (userId == null ? "" : userId);
        switch (dispatchResult) {
            case NO_MAPPING, NO_PERSON_CODE -> {
                result.setUnboundForDahuaRule(true);
                result.setDahuaHint(AccessRuleDispatchHintHelper.humanHint(dispatchResult, accessType));
            }
            case BATCH_FAILED, DELETE_FAILED, BATCH_OK, DELETE_OK, NO_RULE, MATCHED_NO_PRIVILEGE,
                    SCAN_LINKAGE_ENTER_DISABLED, SCAN_LINKAGE_EXIT_DISABLED ->
                    result.setDahuaHint(AccessRuleDispatchHintHelper.humanHint(dispatchResult, accessType));
            default -> {
                // no-op
            }
        }
        if (debugToggleService.isAccessRuleDahuaDebugEnabled()) {
            result.setAccessRuleDebug(detail);
        }
    }


}