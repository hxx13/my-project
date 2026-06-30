package com.example.demo.modules.accessfusion.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.accessfusion.entity.AccessAuditSourceConfig;
import com.example.demo.modules.accessfusion.model.AccessAuditFilterParams;
import com.example.demo.modules.accessfusion.service.AccessAuditSourceService;
import com.example.demo.modules.accessfusion.service.AccessSwingRecordEnrichService;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 门禁审计一级库：与 /api/admin/twin/dahua 同鉴权，供管理端 adminHttp 调用。
 */
@RestController
@RequestMapping("/api/admin/twin/access-audit")
@Tag(name = "门禁审计数据源", description = "门禁记录库/一级库预览；拉取时自动写入 access_raw_event")
public class AdminAccessAuditController {

    private final AccessAuditSourceService auditSourceService;
    private final AccessSwingRecordEnrichService swingRecordEnrichService;
    private final AuthContextService authContextService;

    public AdminAccessAuditController(
            AccessAuditSourceService auditSourceService,
            AccessSwingRecordEnrichService swingRecordEnrichService,
            AuthContextService authContextService) {
        this.auditSourceService = auditSourceService;
        this.swingRecordEnrichService = swingRecordEnrichService;
        this.authContextService = authContextService;
    }

    @GetMapping("/configs")
    @Operation(summary = "筛选配置列表")
    public Result<?> listConfigs(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        return Result.success(auditSourceService.listConfigs());
    }

    @PostMapping("/configs")
    public Result<?> saveConfig(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody AccessAuditSourceConfig body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            long id = auditSourceService.saveConfig(body);
            return Result.success(Map.of("id", id));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/configs/{id}")
    public Result<?> deleteConfig(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        auditSourceService.deleteConfig(id);
        return Result.success(null);
    }

    @GetMapping("/preview/swing")
    @Operation(summary = "预览门禁记录库（阶段0）")
    public Result<?> previewSwing(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(required = false) Long configId,
            @RequestParam(required = false) Long taskId,
            @RequestParam(required = false) String channelCode,
            @RequestParam(required = false) String channelName,
            @RequestParam(required = false) String personCode,
            @RequestParam(required = false) String personName,
            @RequestParam(required = false) String cardNumber,
            @RequestParam(required = false) String departmentName,
            @RequestParam(required = false) Integer openType,
            @RequestParam(required = false) Integer enterOrExit,
            @RequestParam(required = false) Integer openResult,
            @RequestParam(required = false) String audienceType,
            @RequestParam(required = false) Integer mappingHit,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime,
            @RequestParam(defaultValue = "false") boolean requireMapping,
            @RequestParam(defaultValue = "false") boolean openSuccessOnly,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "100") int pageSize) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        AccessAuditFilterParams filter =
                resolveFilter(
                        configId,
                        taskId,
                        channelCode,
                        channelName,
                        personCode,
                        personName,
                        cardNumber,
                        departmentName,
                        openType,
                        enterOrExit,
                        openResult,
                        audienceType,
                        mappingHit,
                        startTime,
                        endTime,
                        requireMapping,
                        openSuccessOnly);
        return Result.success(auditSourceService.previewSwing(filter, page, pageSize));
    }

    @GetMapping("/preview/raw")
    @Operation(summary = "预览审计一级库 access_raw_event")
    public Result<?> previewRaw(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(required = false) Long configId,
            @RequestParam(required = false) Long taskId,
            @RequestParam(required = false) String channelCode,
            @RequestParam(required = false) String personCode,
            @RequestParam(required = false) String personName,
            @RequestParam(required = false) Integer openType,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime,
            @RequestParam(defaultValue = "false") boolean requireMapping,
            @RequestParam(defaultValue = "true") boolean openSuccessOnly,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "100") int pageSize) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        AccessAuditFilterParams filter =
                resolveFilter(
                        configId,
                        taskId,
                        channelCode,
                        null,
                        personCode,
                        personName,
                        null,
                        null,
                        openType,
                        null,
                        null,
                        null,
                        null,
                        startTime,
                        endTime,
                        requireMapping,
                        openSuccessOnly);
        return Result.success(auditSourceService.previewRaw(filter, page, pageSize));
    }

    @PostMapping("/records/enrich")
    @Operation(summary = "按筛选补全历史门禁记录字段（部门/进出/受众，upsert 覆盖）")
    public Result<?> enrichRecords(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(required = false) Long taskId,
            @RequestParam(required = false) String channelCode,
            @RequestParam(required = false) String channelName,
            @RequestParam(required = false) String personCode,
            @RequestParam(required = false) String personName,
            @RequestParam(required = false) String cardNumber,
            @RequestParam(required = false) String departmentName,
            @RequestParam(required = false) Integer openType,
            @RequestParam(required = false) Integer enterOrExit,
            @RequestParam(required = false) Integer openResult,
            @RequestParam(required = false) String audienceType,
            @RequestParam(required = false) Integer mappingHit,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime,
            @RequestParam(defaultValue = "false") boolean requireMapping,
            @RequestParam(defaultValue = "false") boolean openSuccessOnly) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        return Result.success(
                swingRecordEnrichService.enrichByFilter(
                        resolveFilter(
                                null,
                                taskId,
                                channelCode,
                                channelName,
                                personCode,
                                personName,
                                cardNumber,
                                departmentName,
                                openType,
                                enterOrExit,
                                openResult,
                                audienceType,
                                mappingHit,
                                startTime,
                                endTime,
                                requireMapping,
                                openSuccessOnly)));
    }

    @PostMapping("/records/recalculate-audience")
    @Operation(summary = "按筛选重算门禁记录库受众（部门ID/映射名含「学生」→学生，其余→工作人员）")
    public Result<?> recalculateAudience(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(required = false) Long taskId,
            @RequestParam(required = false) String channelCode,
            @RequestParam(required = false) String channelName,
            @RequestParam(required = false) String personCode,
            @RequestParam(required = false) String personName,
            @RequestParam(required = false) String cardNumber,
            @RequestParam(required = false) String departmentName,
            @RequestParam(required = false) Integer openType,
            @RequestParam(required = false) Integer enterOrExit,
            @RequestParam(required = false) Integer openResult,
            @RequestParam(required = false) String audienceType,
            @RequestParam(required = false) Integer mappingHit,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime,
            @RequestParam(defaultValue = "false") boolean requireMapping,
            @RequestParam(defaultValue = "false") boolean openSuccessOnly) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        return Result.success(
                swingRecordEnrichService.recalculateAudienceByFilter(
                        resolveFilter(
                                null,
                                taskId,
                                channelCode,
                                channelName,
                                personCode,
                                personName,
                                cardNumber,
                                departmentName,
                                openType,
                                enterOrExit,
                                openResult,
                                audienceType,
                                mappingHit,
                                startTime,
                                endTime,
                                requireMapping,
                                openSuccessOnly)));
    }

    @GetMapping("/quality-summary")
    @Operation(summary = "门禁记录库质量摘要（缺进出等）")
    public Result<?> qualitySummary(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(required = false) Long taskId,
            @RequestParam(required = false) String channelCode,
            @RequestParam(required = false) String channelName,
            @RequestParam(required = false) String personCode,
            @RequestParam(required = false) String personName,
            @RequestParam(required = false) String cardNumber,
            @RequestParam(required = false) String departmentName,
            @RequestParam(required = false) Integer openType,
            @RequestParam(required = false) Integer enterOrExit,
            @RequestParam(required = false) Integer openResult,
            @RequestParam(required = false) String audienceType,
            @RequestParam(required = false) Integer mappingHit,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime,
            @RequestParam(defaultValue = "false") boolean requireMapping,
            @RequestParam(defaultValue = "false") boolean openSuccessOnly) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        return Result.success(
                swingRecordEnrichService.qualitySummary(
                        resolveFilter(
                                null,
                                taskId,
                                channelCode,
                                channelName,
                                personCode,
                                personName,
                                cardNumber,
                                departmentName,
                                openType,
                                enterOrExit,
                                openResult,
                                audienceType,
                                mappingHit,
                                startTime,
                                endTime,
                                requireMapping,
                                openSuccessOnly)));
    }

    @PostMapping("/configs/{id}/sync")
    @Operation(summary = "（兼容）按配置将门禁库筛选结果补写至一级库；日常拉取已自动写入，一般无需调用")
    public Result<?> sync(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id,
            @RequestParam String startTime,
            @RequestParam String endTime) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            return Result.success(auditSourceService.syncToRawLibrary(id, startTime, endTime));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    private AccessAuditFilterParams resolveFilter(
            Long configId,
            Long taskId,
            String channelCode,
            String channelName,
            String personCode,
            String personName,
            String cardNumber,
            String departmentName,
            Integer openType,
            Integer enterOrExit,
            Integer openResult,
            String audienceType,
            Integer mappingHit,
            String startTime,
            String endTime,
            boolean requireMapping,
            boolean openSuccessOnly) {
        if (configId != null) {
            AccessAuditSourceConfig cfg = auditSourceService.getConfig(configId);
            if (cfg != null) {
                return AccessAuditFilterParams.fromConfig(cfg, startTime, endTime);
            }
        }
        return new AccessAuditFilterParams(
                taskId,
                channelCode,
                personCode,
                personName,
                openType,
                enterOrExit,
                startTime,
                endTime,
                requireMapping,
                openSuccessOnly,
                channelName,
                cardNumber,
                departmentName,
                openResult,
                audienceType,
                mappingHit);
    }

    private Result<?> requireAdmin(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.error("未登录或令牌无效");
        }
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.MEMBER;
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }
}
