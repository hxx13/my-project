package com.example.demo.modules.twin.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.dto.DahuaIssueCardRequest;
import com.example.demo.modules.twin.entity.TwinCardMapping;
import com.example.demo.modules.twin.service.DahuaIssueException;
import com.example.demo.modules.twin.service.DahuaIssueCardOrchestratorService;
import com.example.demo.modules.twin.service.JobExecutionRegistry;
import com.example.demo.modules.twin.service.JobSchedulerService;
import com.example.demo.modules.twin.service.TwinCardMappingService;
import com.example.demo.modules.twin.service.DahuaIssueAccessRulePrefillService;
import com.example.demo.modules.twin.service.TwinAccessRuleScanConfigService;
import com.example.demo.modules.twin.service.TwinFreezeConfigService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/twin/mappings")
@CrossOrigin("*")
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

    public TwinMappingController(
            TwinCardMappingService mappingService,
            TwinFreezeConfigService freezeConfigService,
            TwinAccessRuleScanConfigService accessRuleScanConfigService,
            DahuaIssueAccessRulePrefillService dahuaIssueAccessRulePrefillService,
            AuthContextService authContextService,
            DahuaIssueCardOrchestratorService dahuaIssueCardOrchestratorService,
            JobSchedulerService jobSchedulerService) {
        this.mappingService = mappingService;
        this.freezeConfigService = freezeConfigService;
        this.accessRuleScanConfigService = accessRuleScanConfigService;
        this.dahuaIssueAccessRulePrefillService = dahuaIssueAccessRulePrefillService;
        this.authContextService = authContextService;
        this.dahuaIssueCardOrchestratorService = dahuaIssueCardOrchestratorService;
        this.jobSchedulerService = jobSchedulerService;
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
    @Operation(summary = "读取扫码时是否执行门禁规则（大华下发/回收）全局开关")
    public Result<?> getAccessRuleScanLinkageConfig(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireSenior(authorization);
        if (denied != null) {
            return denied;
        }
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
        Map<String, Object> saved = accessRuleScanConfigService.saveConfig(
                enterDispatch, exitDispatch, enterUnfreeze, exitFreeze, user.getId());
        log.info("[twin] access-rule-scan-linkage-config updated by userId={} enterDispatch={} exitDispatch={} enterUnfreeze={} exitFreeze={}",
                user.getId(), enterDispatch, exitDispatch, enterUnfreeze, exitFreeze);
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
            String timezone = body.get("timezone") != null ? String.valueOf(body.get("timezone")) : null;
            Map<String, Object> saved = freezeConfigService.saveConfig(
                    enabled,
                    freezeTime,
                    secondFreezeTime,
                    secondFreezeAutoSignoutEnabled,
                    timezone,
                    user.getId());
            String syncedFirstFreezeTime = saved.get("freezeTime") == null ? (freezeTime == null ? "18:00" : freezeTime) : String.valueOf(saved.get("freezeTime"));
            String syncedSecondFreezeTime = saved.get("secondFreezeTime") == null ? "" : String.valueOf(saved.get("secondFreezeTime"));
            // 联动：第一次/第二次冻结与豁免回收任务统一由冻结配置同步。
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
        Result<?> denied = requireSenior(user);
        if (denied != null) {
            return denied;
        }
        try {
            String cardNo = payload.get("cardNo").toString();
            Integer flag = Integer.parseInt(payload.get("flag").toString());
            mappingService.updateExemptFlag(cardNo, flag);
            log.info("[twin] exempt cardNo={} flag={} by userId={}", cardNo, flag, user.getId());
            return Result.success("特权更新成功！");
        } catch (Exception e) {
            return Result.error("特权更新失败: " + e.getMessage());
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
            mappingService.deleteMapping(cardNo);
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
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.STUDENT;
        if (role.getLevel() < RoleEnum.SENIOR.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }
}
