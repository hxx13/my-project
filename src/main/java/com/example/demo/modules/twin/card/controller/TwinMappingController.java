package com.example.demo.modules.twin.card.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.notification.push.dispatch.PushService;
import com.example.demo.modules.twin.scan.dto.DahuaIssueCardRequest;
import com.example.demo.modules.twin.card.entity.TwinCardMapping;
import com.example.demo.modules.twin.scan.service.DahuaIssueException;
import com.example.demo.modules.twin.scan.service.DahuaIssueCardOrchestratorService;
import com.example.demo.modules.twin.common.service.JobExecutionRegistry;
import com.example.demo.modules.twin.common.service.JobSchedulerService;
import com.example.demo.modules.twin.card.service.TwinCardMappingService;
import com.example.demo.modules.twin.card.support.ExemptChangeContext;
import com.example.demo.modules.twin.common.entity.TwinAutomationLog;
import com.example.demo.modules.twin.common.service.TwinAutomationLogService;
import com.example.demo.modules.twin.scan.service.DahuaIssueAccessRulePrefillService;
import com.example.demo.modules.twin.scan.service.TwinAccessRuleScanConfigService;
import com.example.demo.modules.twin.card.service.TwinFreezeConfigService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/twin/mappings")
@Tag(name = "房卡映射", description = "物理卡与人员映射管理")
public class TwinMappingController {

    private static final Logger log = LoggerFactory.getLogger(TwinMappingController.class);

    private final TwinCardMappingService mappingService;
    private final TwinFreezeConfigService freezeConfigService;
    private final TwinAccessRuleScanConfigService accessRuleScanConfigService;
    private final DahuaIssueAccessRulePrefillService dahuaIssueAccessRulePrefillService;
    private final AuthContextService authContextService;
    private final DahuaIssueCardOrchestratorService dahuaIssueCardOrchestratorService;
    private final JobSchedulerService jobSchedulerService;
    private final TwinAutomationLogService automationLogService;
    private final PushService pushService;
    private final UserDisplayNameService displayNameService;

    public TwinMappingController(
            TwinCardMappingService mappingService,
            TwinFreezeConfigService freezeConfigService,
            TwinAccessRuleScanConfigService accessRuleScanConfigService,
            DahuaIssueAccessRulePrefillService dahuaIssueAccessRulePrefillService,
            AuthContextService authContextService,
            DahuaIssueCardOrchestratorService dahuaIssueCardOrchestratorService,
            JobSchedulerService jobSchedulerService,
            TwinAutomationLogService automationLogService,
            PushService pushService,
            UserDisplayNameService displayNameService) {
        this.mappingService = mappingService;
        this.freezeConfigService = freezeConfigService;
        this.accessRuleScanConfigService = accessRuleScanConfigService;
        this.dahuaIssueAccessRulePrefillService = dahuaIssueAccessRulePrefillService;
        this.authContextService = authContextService;
        this.dahuaIssueCardOrchestratorService = dahuaIssueCardOrchestratorService;
        this.jobSchedulerService = jobSchedulerService;
        this.automationLogService = automationLogService;
        this.pushService = pushService;
        this.displayNameService = displayNameService;
    }

    @GetMapping
    @Operation(summary = "分页查询映射列表")
    public Result<?> getMappings(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "100") int pageSize) {
        Result<?> denied = requireSenior(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            List<TwinCardMapping> allData = mappingService.getAllWithUserInfo();
            int total = allData.size();
            int fromIndex = (page - 1) * pageSize;
            int toIndex = Math.min(fromIndex + pageSize, total);
            List<TwinCardMapping> pageList = (fromIndex <= total) ? allData.subList(fromIndex, toIndex) : allData.subList(0, 0);
            Map<String, Object> responseData = new HashMap<>();
            responseData.put("list", pageList);
            responseData.put("total", total);
            return Result.success(responseData);
        } catch (Exception e) {
            return Result.error("获取映射矩阵失败: " + e.getMessage());
        }
    }

    @GetMapping("/search")
    @Operation(summary = "搜索映射记录")
    public Result<?> searchMappings(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam("keyword") String keyword) {
        Result<?> denied = requireSenior(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            String cleanKeyword = keyword.trim().toLowerCase();
            List<TwinCardMapping> allData = mappingService.getAllWithUserInfo();
            List<TwinCardMapping> filteredList = allData.stream().filter(m ->
                    (m.getCardNo() != null && m.getCardNo().toLowerCase().contains(cleanKeyword)) ||
                            (m.getDahuaSeq() != null && m.getDahuaSeq().toLowerCase().contains(cleanKeyword)) ||
                            (m.getAroUserId() != null && m.getAroUserId().toLowerCase().contains(cleanKeyword)) ||
                            (m.getUserName() != null && m.getUserName().toLowerCase().contains(cleanKeyword))
            ).collect(Collectors.toList());
            return Result.success(filteredList);
        } catch (Exception e) {
            return Result.error("搜索失败: " + e.getMessage());
        }
    }

    @GetMapping("/user/{userId}")
    @Operation(summary = "按人员ID查询卡映射")
    public Result<?> getMappingByUser(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("userId") String userId) {
        Result<?> denied = requireSenior(authorization);
        if (denied != null) {
            return denied;
        }
        TwinCardMapping m = mappingService.getByAroUserId(userId);
        return Result.success(m);
    }

    @GetMapping("/freeze-config")
    @Operation(summary = "读取全局自动冻结时间配置")
    public Result<?> getFreezeConfig(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireSenior(authorization);
        if (denied != null) {
            return denied;
        }
        return Result.success(freezeConfigService.getConfigMap());
    }

    @GetMapping("/access-rule-scan-linkage-config")
    @Operation(summary = "读取扫码时是否执行门禁规则（大华下发/回收）全局开关（所有已登录用户可读）")
    public Result<?> getAccessRuleScanLinkageConfig() {
        return Result.success(accessRuleScanConfigService.getConfigMap());
    }

    @PutMapping("/access-rule-scan-linkage-config")
    @Operation(summary = "保存扫码门禁规则联动开关（下发/回收/解冻/冻结）")
    public Result<?> putAccessRuleScanLinkageConfig(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = requireSenior(user);
        if (denied != null) {
            return denied;
        }
        boolean enterDispatch = parseBoolBody(body, "enterDispatchEnabled", true);
        boolean exitDispatch = parseBoolBody(body, "exitDispatchEnabled", true);
        boolean enterUnfreeze = parseBoolBody(body, "enterUnfreezeEnabled", true);
        boolean exitFreeze = parseBoolBody(body, "exitFreezeEnabled", true);
        boolean swipeExitSkipConfirm = parseBoolBody(body, "swipeExitSkipConfirm", false);
        Map<String, Object> saved = accessRuleScanConfigService.saveConfig(
                enterDispatch, exitDispatch, enterUnfreeze, exitFreeze, swipeExitSkipConfirm, user.getId());
        log.info("[twin] access-rule-scan-linkage-config updated by userId={} enterDispatch={} exitDispatch={} enterUnfreeze={} exitFreeze={} swipeExitSkipConfirm={}",
                user.getId(), enterDispatch, exitDispatch, enterUnfreeze, exitFreeze, swipeExitSkipConfirm);
        return Result.success(saved);
    }

    private static boolean parseBoolBody(Map<String, Object> body, String key, boolean defaultValue) {
        if (!body.containsKey(key)) {
            return defaultValue;
        }
        Object v = body.get(key);
        return v instanceof Boolean ? (Boolean) v : Boolean.parseBoolean(String.valueOf(v));
    }

    @GetMapping("/dahua-issue/access-prefill")
    @Operation(summary = "大华发卡：按 ARO 可进房间匹配门禁规则，预填通道/门组")
    public Result<?> dahuaIssueAccessPrefill(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam("aroUserId") String aroUserId) {
        Result<?> denied = requireSenior(authorization);
        if (denied != null) {
            return denied;
        }
        if (aroUserId == null || aroUserId.isBlank()) {
            return Result.error("缺少 aroUserId");
        }
        return Result.success(dahuaIssueAccessRulePrefillService.build(aroUserId.trim()));
    }

    @PutMapping("/freeze-config")
    @Operation(summary = "保存全局自动冻结时间配置")
    public Result<?> putFreezeConfig(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = requireSenior(user);
        if (denied != null) {
            return denied;
        }
        try {
            boolean enabled = true;
            if (body.containsKey("enabled")) {
                Object ev = body.get("enabled");
                if (ev instanceof Boolean) {
                    enabled = (Boolean) ev;
                } else {
                    enabled = Boolean.parseBoolean(String.valueOf(ev));
                }
            }
            String freezeTime = body.get("freezeTime") != null ? String.valueOf(body.get("freezeTime")) : null;
            String secondFreezeTime = body.get("secondFreezeTime") != null ? String.valueOf(body.get("secondFreezeTime")) : null;
            boolean secondFreezeAutoSignoutEnabled = false;
            if (body.containsKey("secondFreezeAutoSignoutEnabled")) {
                Object sv = body.get("secondFreezeAutoSignoutEnabled");
                if (sv instanceof Boolean) {
                    secondFreezeAutoSignoutEnabled = (Boolean) sv;
                } else {
                    secondFreezeAutoSignoutEnabled = Boolean.parseBoolean(String.valueOf(sv));
                }
            }
            boolean dailyExemptRevokeAutoSignoutEnabled = false;
            if (body.containsKey("dailyExemptRevokeAutoSignoutEnabled")) {
                Object dv = body.get("dailyExemptRevokeAutoSignoutEnabled");
                if (dv instanceof Boolean) {
                    dailyExemptRevokeAutoSignoutEnabled = (Boolean) dv;
                } else {
                    dailyExemptRevokeAutoSignoutEnabled = Boolean.parseBoolean(String.valueOf(dv));
                }
            }
            String timezone = body.get("timezone") != null ? String.valueOf(body.get("timezone")) : null;
            Map<String, Object> saved = freezeConfigService.saveConfig(
                    enabled,
                    freezeTime,
                    secondFreezeTime,
                    secondFreezeAutoSignoutEnabled,
                    dailyExemptRevokeAutoSignoutEnabled,
                    timezone,
                    user.getId());
            String syncedFirstFreezeTime = saved.get("freezeTime") == null ? (freezeTime == null ? "18:00" : freezeTime) : String.valueOf(saved.get("freezeTime"));
            String syncedSecondFreezeTime = saved.get("secondFreezeTime") == null ? "" : String.valueOf(saved.get("secondFreezeTime"));
            // 联动：仅第一次/第二次冻结跑批；每日豁免回收在「定时管理」独立配置。
            jobSchedulerService.syncFreezeJobs(enabled, syncedFirstFreezeTime, syncedSecondFreezeTime, user.getId());
            log.info("[twin] freeze-config updated by userId={} payload={}", user.getId(), body);
            return Result.success(saved);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("保存失败: " + e.getMessage());
        }
    }

    @PostMapping("/exempt")
    @Operation(summary = "设置豁免标记")
    public Result<?> updateExemptFlag(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> payload) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = requireAdmin(user);
        if (denied != null) {
            return denied;
        }
        try {
            String cardNo = payload.get("cardNo").toString();
            Integer flag = Integer.parseInt(payload.get("flag").toString());
            Integer durationMinutes = null;
            if (payload.get("durationMinutes") != null) {
                durationMinutes = Integer.parseInt(payload.get("durationMinutes").toString());
            }
            String extendUntilTime = payload.get("extendUntilTime") != null
                    ? payload.get("extendUntilTime").toString().trim()
                    : null;
            if (extendUntilTime != null && extendUntilTime.isEmpty()) {
                extendUntilTime = null;
            }
            String mode = payload.get("mode") != null ? payload.get("mode").toString() : "TIME";
            Integer maxCount = null;
            if (payload.get("maxCount") != null) {
                maxCount = Integer.parseInt(payload.get("maxCount").toString());
            }
            String roomIds = payload.get("roomIds") != null ? payload.get("roomIds").toString() : null;
            // 可选客户端标识（记账用，不校验业务含义）：剔除中英文逗号/换行等分隔符并限长 32，防伪造 detail 字段段落
            String client = payload.get("client") != null ? payload.get("client").toString() : null;
            if (client != null) {
                client = client.replaceAll("[，,\\r\\n]", "").trim();
                if (client.length() > 32) {
                    client = client.substring(0, 32);
                }
                if (client.isEmpty()) {
                    client = null;
                }
            }

            if (flag == 1) {
                boolean hasUntil = extendUntilTime != null && !extendUntilTime.isBlank();
                if ((mode.equals("TIME") || mode.equals("BOTH")) && durationMinutes == null && !hasUntil) {
                    return Result.error("时长限制模式须选择延长至时点（extendUntilTime）");
                }
                if ((mode.equals("COUNT") || mode.equals("BOTH")) && maxCount == null) {
                    return Result.error("次数限制模式须指定次数（maxCount）");
                }
            }
            Map<String, Object> updated = mappingService.updateExemptFlag(
                    cardNo, flag, durationMinutes, mode, maxCount, roomIds, extendUntilTime,
                    ExemptChangeContext.manualAdmin(user.getId(), client));
            log.info("[twin] exempt cardNo={} flag={} mode={} maxCount={} by userId={}",
                    cardNo, flag, mode, maxCount, user.getId());
            // 授予豁免时异步推送通知给学生（不阻塞API响应）
            if (flag == 1 && updated != null) {
                String subjectUserId = (String) updated.get("aroUserId");
                if (subjectUserId != null && !subjectUserId.isBlank()) {
                    String roomDisplay = extractRoomNames(roomIds);
                    String optionDesc = describeExemptMode(mode, durationMinutes, maxCount, extendUntilTime);
                    String operatorName = displayNameService.resolveDisplayName(user.getId());
                    java.util.concurrent.CompletableFuture.runAsync(() -> {
                        try {
                            pushService.send("SCAN_DELAY_MANUAL",
                                    Map.of("roomName", roomDisplay,
                                           "optionLabel", optionDesc,
                                           "operatorName", operatorName),
                                    Set.of(subjectUserId.trim()));
                            log.info("[Push] SCAN_DELAY_MANUAL sent via exempt controller: userId={}", subjectUserId);
                        } catch (Exception e) {
                            log.warn("[Push] SCAN_DELAY_MANUAL failed in exempt controller: {}", e.getMessage());
                        }
                    });
                }
            }
            return Result.success(updated);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("特权更新失败: " + e.getMessage());
        }
    }

    @GetMapping("/exempt-history")
    @Operation(summary = "按人反查豁免轨迹（EXEMPT_GRANTED/EXEMPT_REVOKED 产生与消失全记录）")
    public Result<?> getExemptHistory(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(value = "cardNo", required = false) String cardNo,
            @RequestParam(value = "limit", defaultValue = "50") int limit) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = requireAdmin(user);
        if (denied != null) {
            return denied;
        }
        if (cardNo == null || cardNo.isBlank()) {
            return Result.error("cardNo 不能为空");
        }
        try {
            String card = cardNo.trim();
            // 卡号 → 映射 → aroUserId；映射不存在（如已解绑）时仅按 target_id=cardNo 查，历史记账仍可命中
            TwinCardMapping mapping = mappingService.getByCardNo(card);
            String aroUserId = mapping != null ? mapping.getAroUserId() : null;
            List<TwinAutomationLog> list = automationLogService.listExemptHistory(aroUserId, card, limit);
            return Result.success(list);
        } catch (Exception e) {
            return Result.error("豁免轨迹查询失败: " + e.getMessage());
        }
    }

    @PostMapping("/status")
    @Operation(summary = "更新卡片状态")
    public Result<?> updateCardStatus(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> payload) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = requireSenior(user);
        if (denied != null) {
            return denied;
        }
        try {
            String cardNo = payload.get("cardNo").toString();
            String status = payload.get("status").toString();
            mappingService.updateCardStatus(cardNo, status);
            log.info("[twin] card status cardNo={} status={} by userId={}", cardNo, status, user.getId());
            return Result.success("卡片状态已变更为: " + status);
        } catch (Exception e) {
            return Result.error("状态变更失败: " + e.getMessage());
        }
    }

    @PostMapping("/add")
    @Operation(summary = "新增映射")
    public Result<?> addMapping(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody TwinCardMapping mapping) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = requireSenior(user);
        if (denied != null) {
            return denied;
        }
        try {
            if (mappingService.getByCardNo(mapping.getCardNo()) != null) {
                return Result.error("该物理卡号已被绑定，请勿重复录入！");
            }
            mappingService.addMapping(mapping);
            log.info("[twin] mapping add cardNo={} aroUserId={} by userId={}", mapping.getCardNo(), mapping.getAroUserId(), user.getId());
            return Result.success("新卡片映射录入成功！");
        } catch (Exception e) {
            return Result.error("录入失败: " + e.getMessage());
        }
    }

    @DeleteMapping("/{cardNo}")
    @Operation(summary = "删除映射")
    public Result<?> deleteMapping(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable String cardNo) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = requireSenior(user);
        if (denied != null) {
            return denied;
        }
        try {
            // 解绑随行收回豁免的记账来源：操作人为当前登录用户
            mappingService.deleteMapping(cardNo, ExemptChangeContext.mappingDeleted(user.getId()));
            log.info("[twin] mapping delete cardNo={} by userId={}", cardNo, user.getId());
            return Result.success("映射解绑成功！");
        } catch (Exception e) {
            return Result.error("解绑失败: " + e.getMessage());
        }
    }

    @PostMapping("/dahua-issue")
    @Operation(summary = "大华发卡编排")
    public Result<?> dahuaIssue(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody DahuaIssueCardRequest request) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = requireSenior(user);
        if (denied != null) {
            return denied;
        }
        try {
            return Result.success(dahuaIssueCardOrchestratorService.issue(request));
        } catch (DahuaIssueException e) {
            return Result.success(e.getResponse());
        } catch (Exception e) {
            return Result.error("大华发卡失败: " + e.getMessage());
        }
    }

    @PostMapping("/dahua-issue/add-card")
    @Operation(summary = "为已有大华人员追加一张新卡（不创建人员）")
    public Result<?> dahuaIssueAddCard(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = requireSenior(user);
        if (denied != null) {
            return denied;
        }
        try {
            String personIdStr = String.valueOf(body.get("personId"));
            String personCode = String.valueOf(body.get("personCode"));
            String cardNo = String.valueOf(body.get("cardNo"));
            String aroUserId = body.get("aroUserId") != null ? String.valueOf(body.get("aroUserId")) : null;
            Long personId = Long.parseLong(personIdStr.trim());
            log.info("[twin] add-card personId={} cardNo={} by userId={}", personId, cardNo, user.getId());
            return Result.success(dahuaIssueCardOrchestratorService.addCardToExistingPerson(
                    personId, personCode, cardNo, aroUserId));
        } catch (DahuaIssueException e) {
            return Result.success(e.getResponse());
        } catch (NumberFormatException e) {
            return Result.error("personId 格式错误，须为数字");
        } catch (Exception e) {
            log.error("[twin] add-card 失败: {}", e.getMessage(), e);
            return Result.error("追加卡片失败: " + e.getMessage());
        }
    }

    @DeleteMapping("/{cardNo}/dahua-card")
    @Operation(summary = "删除大华侧卡片并清除本地映射（不删人员）")
    public Result<?> deleteDahuaCard(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable String cardNo) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = requireSenior(user);
        if (denied != null) {
            return denied;
        }
        try {
            log.info("[twin] delete-dahua-card cardNo={} by userId={}", cardNo, user.getId());
            Map<String, Object> result = dahuaIssueCardOrchestratorService.deleteCardFromDahua(cardNo);
            if (Boolean.TRUE.equals(result.get("success"))) {
                return Result.success(result.get("message"));
            }
            return Result.error(String.valueOf(result.get("message")));
        } catch (Exception e) {
            log.error("[twin] delete-dahua-card 失败 cardNo={}: {}", cardNo, e.getMessage(), e);
            return Result.error("删除大华卡片失败: " + e.getMessage());
        }
    }

    @PostMapping("/debug/run-reaper")
    @Operation(summary = "手动执行冻结跑批")
    public Result<?> runReaperTask(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = requireSenior(user);
        if (denied != null) {
            return denied;
        }
        try {
            jobSchedulerService.runManual(JobExecutionRegistry.JOB_RUN_REAPER, user.getId());
            Map<String, Integer> stats = Map.of("accepted", 1);
            log.info("[twin] run-reaper by userId={} stats={}", user.getId(), stats);
            return Result.success(stats);
        } catch (Exception e) {
            return Result.error("跑批任务执行失败: " + e.getMessage());
        }
    }

    private Result<?> requireSenior(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        return requireSenior(user);
    }

    private Result<?> requireSenior(User user) {
        if (user == null) {
            return Result.error("未登录或令牌无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.MEMBER;
        if (role.getLevel() < RoleEnum.SENIOR.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }

    /** 豁免权下放：管理员及以上 */
    private Result<?> requireAdmin(User user) {
        if (user == null) {
            return Result.error("未登录或令牌无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.MEMBER;
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }

    /** 从 JSON roomIds 提取人类可读的房间名，如 [{"roomId":"...","roomName":"302A"}] → "302A" */
    private static String extractRoomNames(String roomIds) {
        if (roomIds == null || roomIds.isBlank()) return "指定房间";
        // 尝试解析 JSON 数组提取 roomName
        try {
            com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
            var list = om.readValue(roomIds, java.util.List.class);
            if (list.isEmpty()) return "指定房间";
            StringBuilder sb = new StringBuilder();
            for (var item : list) {
                if (item instanceof java.util.Map<?, ?> m) {
                    Object name = m.get("roomName");
                    if (name != null && !name.toString().isBlank()) {
                        if (!sb.isEmpty()) sb.append("、");
                        sb.append(name);
                    }
                }
            }
            return sb.isEmpty() ? "指定房间" : sb.toString();
        } catch (Exception e) {
            // 非 JSON → 原样返回（如逗号分隔的纯 roomId 列表）
            return roomIds.replaceAll("[\\[\\]\"]", "").trim();
        }
    }

    private static String describeExemptMode(String mode, Integer durationMinutes, Integer maxCount, String extendUntilTime) {
        if ("COUNT".equals(mode)) {
            return "次数限制 · 可用 " + (maxCount != null ? maxCount : "?") + " 次";
        } else if ("TIME".equals(mode)) {
            String until = extendUntilTime != null && !extendUntilTime.isBlank()
                    ? "至 " + extendUntilTime
                    : (durationMinutes != null && durationMinutes > 0
                        ? durationMinutes + " 分钟"
                        : "已授权");
            return "时长限制 · " + until;
        } else if ("BOTH".equals(mode)) {
            String until = extendUntilTime != null && !extendUntilTime.isBlank()
                    ? "至 " + extendUntilTime
                    : (durationMinutes != null && durationMinutes > 0
                        ? durationMinutes + " 分钟"
                        : "已授权");
            return "时长+次数限制 · " + until + " · 可用 " + (maxCount != null ? maxCount : "?") + " 次";
        }
        return "已授权";
    }
}
