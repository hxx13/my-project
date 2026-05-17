package com.example.demo.modules.twin.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.accessrule.service.AccessRuleDispatchHintHelper;
import com.example.demo.modules.accessrule.service.AccessRuleDispatchResult;
import com.example.demo.modules.accessrule.service.AccessRuleDispatchService;
import com.example.demo.modules.twin.dto.ScanAnalyzeResponseDTO;
import com.example.demo.modules.twin.dto.ScanExecuteResponseDTO;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.twin.service.TwinScanAppService;
import com.example.demo.modules.twin.service.TwinCardMappingService;
import com.example.demo.modules.twin.service.DahuaSwingRuleEngineService;
import com.example.demo.modules.twin.service.RpgEngineService;
import com.example.demo.modules.twin.service.TwinScanService;
import com.example.demo.modules.twin.service.TwinAutomationLogService;
import com.example.demo.modules.twin.service.DahuaSwingRuleConfigService;
import com.example.demo.modules.twin.service.TwinStudentViolationService;
import com.example.demo.modules.twin.service.TwinStudentViolationNoticeConfigService;
import com.example.demo.modules.twin.service.WebScanExitDahuaLinkageService;
import com.example.demo.modules.twin.service.TwinAccessRuleScanConfigService;
import com.example.demo.modules.twin.service.DahuaIssueAccessRulePrefillService;
import com.example.demo.modules.twin.service.DahuaIssueCardOrchestratorService;
import com.example.demo.modules.twin.dto.DahuaIssueAccessPrefillVO;
import com.example.demo.modules.twin.dto.DahuaIssueCardRequest;
import com.example.demo.modules.twin.service.DahuaIssueException;
import com.example.demo.modules.twin.entity.TwinCardMapping;
import com.example.demo.modules.twin.support.ScanPopupEntryWindowEvaluator;
import com.example.demo.modules.twin.mapper.TwinDashboardMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/twin/scan")
@CrossOrigin("*")
public class TwinScanController {
    private static final Logger log = LoggerFactory.getLogger(TwinScanController.class);

    // 💥 换回我们的核动力引擎！决不能直接裸调 AroService！
    @Autowired
    private TwinScanService twinScanService;

    @Autowired
    private TwinDashboardMapper dashboardMapper;

    @Autowired
    private TwinScanAppService twinScanAppService;

    @Autowired
    private TwinCardMappingService twinCardMappingService; // 🚨 注入我们的极速缓存字典

    @Autowired
    private RpgEngineService rpgEngineService;

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
    private TwinStudentViolationService twinStudentViolationService;

    @Autowired
    private TwinStudentViolationNoticeConfigService unboundNoticeConfigService;

    @Autowired
    private DahuaIssueCardOrchestratorService dahuaIssueCardOrchestratorService;

    @Autowired
    private DahuaIssueAccessRulePrefillService dahuaIssueAccessRulePrefillService;

    @Autowired
    private AuthContextService authContextService;

    private static final long STUDENT_DAHUA_BIND_DEPT_ID = 26L;
    private static final java.util.List<Long> STUDENT_DAHUA_BIND_DOOR_GROUP_IDS = java.util.List.of(58L, 59L);

    @Value("${app.access-rule-dahua-debug:false}")
    private boolean accessRuleDahuaDebug;

    @Value("${app.business-timezone:Asia/Shanghai}")
    private String businessTimeZone;


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
            return Result.success(twinScanAppService.analyzeScan(rawInput, operator, operatorRoleHint));
        } catch (Exception e) {
            ScanAnalyzeResponseDTO fallback = new ScanAnalyzeResponseDTO();
            fallback.setSuccess(false);
            fallback.setMessage("扫码解析失败: " + e.getMessage());
            return Result.success(fallback);
        }
    }

    @PostMapping("/execute")
    public Result<ScanExecuteResponseDTO> executeScan(
            @RequestBody Map<String, Object> payload,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestHeader(value = "X-Scan-Operator-Role", required = false) String operatorRoleHint
    ) {
        ScanExecuteResponseDTO result = new ScanExecuteResponseDTO();
        User operator = authContextService.resolveUserFromBearer(authorization);
        try {
            String userId = (String) payload.get("userId");
            String roomId = (String) payload.get("roomId");
            String roomName = payload.get("roomName") != null ? String.valueOf(payload.get("roomName")) : "";
            int accessType = "ENTER".equals(payload.get("action")) ? 1 : 2;

            // 提取各种特殊标志
            boolean isSharedCard = Boolean.TRUE.equals(payload.get("isSharedCard"));
            boolean isKeepCard = Boolean.TRUE.equals(payload.get("isKeepCard"));

            Object borrowedObj = payload.get("isBorrowedCard");
            boolean isBorrowedCard = borrowedObj != null && Boolean.parseBoolean(borrowedObj.toString());

            String userName = payload.containsKey("userName") ? (String) payload.get("userName") : "未知人员";

            String dahuaSeq = null;
            String physicalCardNo = null;
            com.example.demo.modules.twin.entity.TwinCardMapping mapping = twinCardMappingService.getByAroUserId(userId);
            if (mapping != null) {
                dahuaSeq = mapping.getDahuaSeq();
                physicalCardNo = mapping.getCardNo();
            }

            String roomLabel = (roomName != null && !roomName.isBlank()) ? roomName : "（房间名未传）";
            log.info("[scan-exec] 1/4 🎯 执行打卡 userId={} 物理卡号={} 房间={} 动作={} 领借卡={}",
                    userId,
                    physicalCardNo != null ? physicalCardNo : "无",
                    roomLabel,
                    accessType == 1 ? "进入" : "离开",
                    isBorrowedCard ? "是" : "否");

            Map<String, Object> swingCfg = dahuaSwingRuleConfigService.getConfig();
            ZoneId winZone;
            try {
                winZone = ZoneId.of(businessTimeZone != null ? businessTimeZone : "Asia/Shanghai");
            } catch (Exception e) {
                winZone = ZoneId.systemDefault();
            }
            if (!ScanPopupEntryWindowEvaluator.isExecuteAllowedNow(swingCfg, winZone)) {
                result.setSuccess(false);
                result.setMessage("当前不在允许使用扫码打卡的时段内，请稍后再试");
                return Result.success(result);
            }

            if (accessType == 1 && twinStudentViolationService.isEnterBlocked(userId)) {
                result.setSuccess(false);
                result.setMessage("违规处理中：已被禁止进入或进入次数已达上限，请联系管理员在「学生违规管理」中解除。");
                return Result.success(result);
            }

            if (accessType == 1 && unboundNoticeConfigService.isUnboundEnterForbidden(mapping != null, operator, operatorRoleHint)) {
                result.setSuccess(false);
                result.setMessage("未绑定校园卡：当前策略禁止扫码进入，请先完成绑卡或在「学生违规管理」中调整未绑卡提示设置。");
                return Result.success(result);
            }

            // =================================================================
            // 💥 第一关：先让 ARO 官方系统确认并落库！
            // =================================================================
            boolean aroSuccess = twinScanService.executeAccessAction(userId, roomId, accessType, isSharedCard, isKeepCard, dahuaSeq, isBorrowedCard);
            boolean healedNoLeaveConflict = (accessType == 2 && aroService.isNoLeaveRoomError());

            if (!aroSuccess) {
                result.setSuccess(false);
                String aroMsg = aroService.getLastAroErrorMessage();
                result.setMessage((aroMsg == null || aroMsg.isBlank()) ? "打卡被官方系统拒绝，请检查人员权限！" : aroMsg);
                return Result.success(result);
            }

            log.info("[scan-exec] 2/4 ✅ 官方 ARO 已确认登记 userId={}", userId);

            // 关键同步规则：
            // 任何“离开(accessType=2)”在 ARO 官方登记成功后，都必须清理大华联动状态，
            // 避免 twin_dahua_activation_state 残留导致定时器重复探测/重复签退。
            if (accessType == 2) {
                dahuaSwingRuleEngineService.clearActivationStatesForUser(userId);
            }

            // ENTER：取消尚未执行的「离开延迟冻结」，避免换房进入解冻后被旧计时器再次冻结
            if (accessType == 1) {
                webScanExitDahuaLinkageService.cancelPendingDeferredExitForUser(userId);
            }

            // ENTER：按全局开关解冻；关闭时仍执行 ARO/待激活，但若开启下放则大华可能因「冻结人员不能授权」失败
            if (accessType == 1 && physicalCardNo != null && twinAccessRuleScanConfigService.isEnterUnfreezeEnabled()) {
                try {
                    twinCardMappingService.updateCardStatus(physicalCardNo, "NORMAL");
                } catch (Exception e) {
                    log.error("[scan-exec] pre-unfreeze failed userId={} cardNo={} err={}", userId, physicalCardNo, e.getMessage(), e);
                    result.setSuccess(false);
                    result.setMessage("官方系统登记成功，但大华预解冻失败，无法下发门禁权限，请联系管理员！");
                    return Result.success(result);
                }
            } else if (accessType == 1 && physicalCardNo != null) {
                log.info("[scan-exec] skip-pre-unfreeze enter_unfreeze_disabled userId={} cardNo={}", userId, physicalCardNo);
            }

            String effectiveRoomId = roomId;
            if (accessType == 2 && (effectiveRoomId == null || effectiveRoomId.isBlank())) {
                effectiveRoomId = resolveOfficialRoomIdFromAro(userId, roomId, roomName);
            }
            // 长期保管卡豁免必须先于门禁派发/待激活计时：否则先起算待激活再写豁免，会出现「库里有待激活行但人已是豁免」的短暂不一致
            if (isKeepCard && physicalCardNo != null) {
                log.info("[scan-exec] 联动豁免 已开启 userId={} 姓名={} 原因=长期保管卡", userId, userName);
                twinCardMappingService.updateExemptFlagByUserId(userId, 1);
            }

            int deferSec = 0;
            AccessRuleDispatchResult dispatchResult = null;
            try {
                if (accessType == 1) {
                    dispatchResult = accessRuleDispatchService.tryApplyAccessForScanEnter(effectiveRoomId, userId);
                    // 待激活倒计时：与 enter_dispatch 是否 batch 无关；仅对已大华发卡落库（twin_card_mapping 完整）且未豁免者起算（见 DahuaSwingRuleEngineService）
                    if (!twinCardMappingService.isLinkageRuleExempt(userId)) {
                        dahuaSwingRuleEngineService.startPendingActivationAfterAccessRuleGrant(userId);
                    }
                } else if (accessType == 2) {
                    deferSec = webScanExitDahuaLinkageService.resolveDeferSeconds();
                    dispatchResult = webScanExitDahuaLinkageService.revokeAndFreezeAfterExit(
                            userId, effectiveRoomId, physicalCardNo, isKeepCard, deferSec);
                }
                applyDispatchHint(result, dispatchResult, effectiveRoomId, userId, accessType);
                if (accessType == 1
                        && physicalCardNo != null
                        && !twinAccessRuleScanConfigService.isEnterUnfreezeEnabled()
                        && twinAccessRuleScanConfigService.isEnterDispatchEnabled()) {
                    String unfreezeHint = "全局已关闭进入解冻：物理卡仍为冻结态，大华权限下发可能失败。";
                    String merged = result.getDahuaHint();
                    result.setDahuaHint(merged != null && !merged.isBlank() ? merged + " " + unfreezeHint : unfreezeHint);
                }
                if (accessType == 2 && deferSec > 0) {
                    result.setDeferredDahuaSeconds(deferSec);
                    String deferHint = webScanExitDahuaLinkageService.buildDeferredExitHint(deferSec, isKeepCard);
                    if (deferHint != null && !deferHint.isBlank()) {
                        String merged = result.getDahuaHint();
                        if (merged != null && !merged.isBlank()) {
                            result.setDahuaHint(merged + " " + deferHint);
                        } else {
                            result.setDahuaHint(deferHint);
                        }
                    }
                }
            } catch (Exception linkageEx) {
                if (accessType == 2) {
                    log.error("[scan-exec] exit-dahua-linkage failed userId={} err={}", userId, linkageEx.getMessage(), linkageEx);
                    result.setSuccess(false);
                    String detail = linkageEx.getMessage() != null ? linkageEx.getMessage() : linkageEx.getClass().getSimpleName();
                    result.setMessage("官方系统离开登记成功，但大华联动（权限回收/冻结）失败，请联系管理员。详情：" + detail);
                    return Result.success(result);
                }
                throw linkageEx;
            }
            log.info("[scan-exec] 3/4 🔐 门禁联动已处理 userId={} 房间={} exitDeferSec={}", userId, roomLabel, deferSec);

            // =================================================================
            // 🎯 第三关：使用 RPG 引擎返回本次操作真实经验增量
            // =================================================================
            int expAdded = Math.max(0, rpgEngineService.predictActionReward(userId, accessType));
            result.setExpAdded(expAdded);

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
                    log.error("[scan-exec] hardware-sync failed userId={} cardNo={} err={}", userId, physicalCardNo, e.getMessage(), e);
                    result.setSuccess(false);
                    result.setMessage("官方系统登记成功，但大华物理门禁响应失败，请联系管理员手动开门！");
                    return Result.success(result);
                }
            } else {
                result.setSuccess(true);
                if (healedNoLeaveConflict) {
                    result.setMessage("ARO 显示当前已无待离开房间，系统已完成状态自愈同步。");
                } else {
                    String exitExtra = "";
                    if (accessType == 2 && deferSec <= 0 && dispatchResult == AccessRuleDispatchResult.SCAN_LINKAGE_EXIT_DISABLED) {
                        exitExtra = "（已跳过门禁权限回收：全局开关关闭）";
                    }
                    String base = accessType == 1
                            ? "纯数字打卡成功！(未绑定大华物理卡)"
                            : (accessType == 2 && deferSec > 0
                            ? "离开登记成功！大华门禁回收与物理卡冻结将在 " + deferSec + " 秒后执行。"
                            : "离开登记成功！(未绑定大华物理卡)" + exitExtra);
                    result.setMessage(base + " 本次经验 +" + expAdded);
                }
            }

            log.info("[scan-exec] 4/4 ✅ 打卡请求收尾 userId={} 物理卡号={}", userId, physicalCardNo != null ? physicalCardNo : "无");

            if (result.isSuccess() && accessType == 1 && userId != null && !userId.isBlank()) {
                try {
                    twinStudentViolationService.recordSuccessfulEnter(userId);
                } catch (Exception ve) {
                    log.warn("[scan-exec] 违规进入计数失败 userId={} err={}", userId, ve.getMessage());
                }
            }

            if (result.isSuccess() && userId != null && !userId.isBlank()) {
                com.example.demo.modules.twin.entity.TwinCardMapping traceMapping = twinCardMappingService.getByAroUserId(userId);
                if (traceMapping != null) {
                    String actLabel = accessType == 1 ? "进入" : "离开";
                    String tr = accessType == 1 ? "SCAN_EXECUTE_ENTER" : "SCAN_EXECUTE_EXIT";
                    String rid = (effectiveRoomId != null && !effectiveRoomId.isBlank()) ? effectiveRoomId : null;
                    twinAutomationLogService.write(
                            TwinAutomationLogService.TYPE_ACCESS_TRACE,
                            "LINKAGE_STEP",
                            "MANUAL",
                            tr,
                            userId,
                            rid,
                            true,
                            "Web/终端扫码登记成功：动作=" + actLabel + "，房间=" + roomLabel + "，人员=" + userName,
                            "twin-scan-execute"
                    );
                }
            }

        } catch (Exception e) {
            log.error("[scan-exec] ❌ 异常 {} err={}", e.getClass().getSimpleName(), e.getMessage(), e);
            result.setSuccess(false);
            result.setMessage("系统执行异常: " + e.getMessage());
        }
        return Result.success(result);
    }

    @Autowired
    private AroService aroService;

    // 查询人员状态
    @GetMapping("/user-status")
    public Result<?> getUserStatus(@RequestParam String userId) {
        Map<String, Object> data = aroService.getUserDetailAndDisciplinary(userId);
        return Result.success(data);
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
            java.util.List<java.util.Map<String, Object>> statusList = dashboardMapper.getRoomCardStatusList(roomId);

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
            System.err.println("❌ 获取房卡监控失败: " + e.getMessage());
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

        com.example.demo.modules.twin.entity.TwinCardMapping mapping = twinCardMappingService.getByAroUserId(userId);
        String dahuaSeq = mapping != null ? mapping.getDahuaSeq() : null;
        String physicalCardNo = mapping != null ? mapping.getCardNo() : null;

        // 对齐 web 扫码离开：ARO 登记 + 流水异步同步
        boolean ok = twinScanService.executeAccessAction(userId, officialRoomId, 2, false, false, dahuaSeq, false);
        if (!ok) {
            return Result.error("离开登记失败，官方系统拒绝操作");
        }
        // 对齐 web 扫码离开：规则命中后执行大华权限回收（可配置延迟）
        int defer = webScanExitDahuaLinkageService.resolveDeferSeconds();
        AccessRuleDispatchResult dispatchResult = webScanExitDahuaLinkageService.revokeAndFreezeAfterExit(
                userId, officialRoomId, physicalCardNo, false, defer);
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
        if (accessRuleDahuaDebug) {
            result.setAccessRuleDebug(detail);
        }
    }


}