package com.example.demo.modules.analytics.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.analytics.dto.AnalyticsAuditLogDto;
import com.example.demo.modules.analytics.dto.AnalyticsSubscriptionRequest;
import com.example.demo.modules.analytics.dto.AnalyticsUserViewDto;
import com.example.demo.modules.analytics.dto.AnalyticsUserViewUpsertRequest;
import com.example.demo.modules.analytics.service.AnalyticsAuditService;
import com.example.demo.modules.analytics.service.AnalyticsLlmInsightService;
import com.example.demo.modules.analytics.service.AnalyticsQuerySnapshotService;
import com.example.demo.modules.analytics.service.AnalyticsReportRegistry;
import com.example.demo.modules.analytics.service.AnalyticsUserViewService;
import com.example.demo.modules.analytics.service.AnalyticsViewShareService;
import com.example.demo.modules.analytics.service.IsolationUsageReportService;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.request.async.DeferredResult;

import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;

@RestController
@RequestMapping("/api/v1/analytics")
@Tag(name = "统计与审计", description = "可扩展统计报表与用户筛选订阅")
public class AnalyticsController {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsController.class);
    /** 与前端 ANALYTICS_LLM_INSIGHT_TIMEOUT_MS 对齐 */
    private static final long LLM_DEFERRED_TIMEOUT_MS = 180_000L;

    private final AuthContextService authContextService;
    private final AnalyticsReportRegistry reportRegistry;
    private final AnalyticsUserViewService userViewService;
    private final IsolationUsageReportService isolationUsageReportService;
    private final AnalyticsAuditService auditService;
    private final AnalyticsQuerySnapshotService querySnapshotService;
    private final AnalyticsLlmInsightService llmInsightService;
    private final AnalyticsViewShareService viewShareService;
    private final Executor heavyCalcExecutor;

    public AnalyticsController(
            AuthContextService authContextService,
            AnalyticsReportRegistry reportRegistry,
            AnalyticsUserViewService userViewService,
            IsolationUsageReportService isolationUsageReportService,
            AnalyticsAuditService auditService,
            AnalyticsQuerySnapshotService querySnapshotService,
            AnalyticsLlmInsightService llmInsightService,
            AnalyticsViewShareService viewShareService,
            @Qualifier("heavyCalcExecutor") Executor heavyCalcExecutor) {
        this.authContextService = authContextService;
        this.reportRegistry = reportRegistry;
        this.userViewService = userViewService;
        this.isolationUsageReportService = isolationUsageReportService;
        this.auditService = auditService;
        this.querySnapshotService = querySnapshotService;
        this.llmInsightService = llmInsightService;
        this.viewShareService = viewShareService;
        this.heavyCalcExecutor = heavyCalcExecutor;
    }

    @GetMapping("/reports")
    @Operation(summary = "报表目录（可扩展）")
    public Result<List<?>> listReports(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) {
            return Result.error(denied.getMessage());
        }
        return Result.success(reportRegistry.listReports());
    }

    @GetMapping("/isolation-usage/query")
    @Operation(summary = "隔离服使用统计（须关联已保存配置；封闭历史周期；命中快照则直接返回）")
    public Result<Map<String, Object>> isolationQuery(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam long viewId,
            @RequestParam String periodKey,
            @RequestParam(required = false) String queryCycle,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime,
            @RequestParam(defaultValue = "false") boolean forceRefresh) {
        User user = resolveUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        Result<?> denied = requireStaff(authorization);
        if (denied != null) {
            return Result.error(denied.getMessage());
        }
        if (!StringUtils.hasText(startTime) || !StringUtils.hasText(endTime)) {
            return Result.error("无效的历史时间范围");
        }
        try {
            return Result.success(querySnapshotService.queryWithSnapshot(
                    user.getId(), viewId, periodKey, queryCycle, startTime, endTime, forceRefresh));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    private static List<String> mergeCampuses(String single, String multi) {
        List<String> out = splitCsv(multi);
        if (out.isEmpty() && single != null && !single.isBlank()) {
            out = List.of(single.trim());
        }
        return out;
    }

    private static List<String> mergeFloors(String single, String multi) {
        List<String> out = splitCsv(multi);
        if (out.isEmpty() && single != null && !single.isBlank()) {
            out = List.of(single.trim());
        }
        return out;
    }

    private static List<String> splitCsv(String csv) {
        if (csv == null || csv.isBlank()) {
            return List.of();
        }
        return java.util.Arrays.stream(csv.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
    }

    @GetMapping("/reports/{reportKey}/share")
    @Operation(summary = "获取当前报表下全部配置的有效分享码")
    public Result<Map<String, Object>> getReportShare(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable String reportKey) {
        User user = resolveUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        Result<?> denied = requireStaff(authorization);
        if (denied != null) {
            return Result.error(denied.getMessage());
        }
        try {
            return Result.success(viewShareService.getActiveShareForReport(user.getId(), reportKey));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/reports/{reportKey}/share")
    @Operation(summary = "生成/重新生成分享码（封箱该报表下全部配置与快照）")
    public Result<Map<String, Object>> createReportShare(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable String reportKey,
            @RequestBody(required = false) Map<String, Object> body) {
        User user = resolveUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        Result<?> denied = requireStaff(authorization);
        if (denied != null) {
            return Result.error(denied.getMessage());
        }
        try {
            Integer expiresDays = body != null && body.get("expiresDays") instanceof Number n ? n.intValue() : null;
            Integer maxImports = body != null && body.get("maxImports") instanceof Number n ? n.intValue() : null;
            String display = resolveUserDisplayName(user);
            return Result.success(
                    viewShareService.createShareForReport(user.getId(), reportKey, display, expiresDays, maxImports));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/views/{viewId}/share")
    @Operation(summary = "获取分享码（等同所属报表全部配置）")
    public Result<Map<String, Object>> getViewShare(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long viewId) {
        User user = resolveUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        Result<?> denied = requireStaff(authorization);
        if (denied != null) {
            return Result.error(denied.getMessage());
        }
        try {
            return Result.success(viewShareService.getActiveShareForView(user.getId(), viewId));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/views/{viewId}/share")
    @Operation(summary = "生成分享码（等同封箱所属报表下全部配置）")
    public Result<Map<String, Object>> createViewShare(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long viewId,
            @RequestBody(required = false) Map<String, Object> body) {
        User user = resolveUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        Result<?> denied = requireStaff(authorization);
        if (denied != null) {
            return Result.error(denied.getMessage());
        }
        try {
            Integer expiresDays = body != null && body.get("expiresDays") instanceof Number n ? n.intValue() : null;
            Integer maxImports = body != null && body.get("maxImports") instanceof Number n ? n.intValue() : null;
            String display = resolveUserDisplayName(user);
            return Result.success(
                    viewShareService.createShare(user.getId(), viewId, display, expiresDays, maxImports));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/share/preview")
    @Operation(summary = "预览分享码内容（不导入）")
    public Result<Map<String, Object>> previewViewShare(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam String code) {
        User user = resolveUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        Result<?> denied = requireStaff(authorization);
        if (denied != null) {
            return Result.error(denied.getMessage());
        }
        try {
            return Result.success(viewShareService.previewShare(code));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/share/import")
    @Operation(summary = "导入分享码（克隆配置与历史内容到当前账号）")
    public Result<Map<String, Object>> importViewShare(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body) {
        User user = resolveUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        Result<?> denied = requireStaff(authorization);
        if (denied != null) {
            return Result.error(denied.getMessage());
        }
        if (body == null || !StringUtils.hasText(String.valueOf(body.get("code")))) {
            return Result.error("请填写分享码");
        }
        try {
            String code = String.valueOf(body.get("code"));
            String targetName = body.get("targetName") != null ? String.valueOf(body.get("targetName")) : null;
            return Result.success(viewShareService.importShare(user.getId(), code, targetName));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/share/{shareId}/revoke")
    @Operation(summary = "撤销分享码")
    public Result<Void> revokeViewShare(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long shareId) {
        User user = resolveUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        Result<?> denied = requireStaff(authorization);
        if (denied != null) {
            return Result.error(denied.getMessage());
        }
        try {
            viewShareService.revokeShare(user.getId(), shareId);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    private static String resolveUserDisplayName(User user) {
        if (user == null) {
            return "";
        }
        String nick = user.getDisplayNickname();
        if (StringUtils.hasText(nick)) {
            return nick.trim();
        }
        String name = user.getUsername();
        return StringUtils.hasText(name) ? name.trim() : user.getId();
    }

    @GetMapping("/llm/insight-prompt")
    @Operation(summary = "获取某统计模块的 AI 解读提问模板（系统默认）")
    public Result<Map<String, Object>> getLlmInsightPrompt(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam String reportKey) {
        User user = resolveUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        Result<?> denied = requireStaff(authorization);
        if (denied != null) {
            return Result.error(denied.getMessage());
        }
        if (!StringUtils.hasText(reportKey)) {
            return Result.error("reportKey 不能为空");
        }
        return Result.success(llmInsightService.getInsightPrompt(reportKey.trim()));
    }

    @GetMapping("/llm/insights")
    @Operation(summary = "获取清算记录的 AI 解读（可选自动生成）")
    public Result<Map<String, Object>> getLlmInsight(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam long auditLogId,
            @RequestParam(defaultValue = "false") boolean autoGenerate) {
        User user = resolveUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        Result<?> denied = requireStaff(authorization);
        if (denied != null) {
            return Result.error(denied.getMessage());
        }
        try {
            if (autoGenerate) {
                return Result.success(llmInsightService.getOrGenerateInsight(user.getId(), auditLogId, false));
            }
            return Result.success(llmInsightService.getInsight(user.getId(), auditLogId));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/llm/insights/generate-batch")
    @Operation(summary = "（勿用 GET）批量生成解读须 POST")
    public Result<Void> generateLlmInsightBatchGetNotAllowed() {
        return Result.error("请使用 POST /api/v1/analytics/llm/insights/generate-batch");
    }

    @PostMapping("/llm/insights/generate-batch")
    @Operation(summary = "为当前视图最近若干条清算记录批量生成 AI 解读")
    public DeferredResult<Result<Map<String, Object>>> generateLlmInsightBatch(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam String reportKey,
            @RequestParam long viewId,
            @RequestParam(defaultValue = "5") int limit,
            @RequestParam(defaultValue = "false") boolean forceRefresh) {
        DeferredResult<Result<Map<String, Object>>> deferred = new DeferredResult<>(LLM_DEFERRED_TIMEOUT_MS);
        User user = resolveUser(authorization);
        if (user == null) {
            deferred.setResult(Result.error("未登录"));
            return deferred;
        }
        Result<?> denied = requireStaff(authorization);
        if (denied != null) {
            deferred.setResult(Result.error(denied.getMessage()));
            return deferred;
        }
        String userId = user.getId();
        heavyCalcExecutor.execute(() -> {
            try {
                deferred.setResult(Result.success(
                        llmInsightService.generateBatchForView(userId, reportKey, viewId, limit, forceRefresh)));
            } catch (IllegalArgumentException | IllegalStateException e) {
                deferred.setResult(Result.error(e.getMessage()));
            } catch (Exception e) {
                log.warn("[analytics-llm] batch generate failed viewId={}: {}", viewId, e.getMessage(), e);
                deferred.setResult(Result.error("批量解读失败，请稍后重试"));
            }
        });
        return deferred;
    }

    @GetMapping("/llm/insights/generate")
    @Operation(summary = "（勿用 GET）生成解读须 POST")
    public Result<Void> generateLlmInsightGetNotAllowed() {
        return Result.error("请使用 POST /api/v1/analytics/llm/insights/generate");
    }

    @PostMapping("/llm/insights/generate")
    @Operation(summary = "基于清算快照生成 AI 解读（测试/会议材料）")
    public DeferredResult<Result<Map<String, Object>>> generateLlmInsight(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam long auditLogId,
            @RequestParam(defaultValue = "false") boolean forceRefresh,
            @RequestParam(required = false) String userPrompt) {
        DeferredResult<Result<Map<String, Object>>> deferred = new DeferredResult<>(LLM_DEFERRED_TIMEOUT_MS);
        User user = resolveUser(authorization);
        if (user == null) {
            deferred.setResult(Result.error("未登录"));
            return deferred;
        }
        Result<?> denied = requireStaff(authorization);
        if (denied != null) {
            deferred.setResult(Result.error(denied.getMessage()));
            return deferred;
        }
        String userId = user.getId();
        heavyCalcExecutor.execute(() -> {
            try {
                deferred.setResult(
                        Result.success(llmInsightService.generateInsight(userId, auditLogId, forceRefresh, userPrompt)));
            } catch (IllegalArgumentException | IllegalStateException e) {
                deferred.setResult(Result.error(e.getMessage()));
            } catch (Exception e) {
                log.warn("[analytics-llm] generate failed auditLogId={}: {}", auditLogId, e.getMessage(), e);
                deferred.setResult(Result.error("解读生成失败，请稍后重试"));
            }
        });
        return deferred;
    }

    @GetMapping("/audit-logs/{id}/detail")
    @Operation(summary = "清算记录详情（快照，不重复聚合）")
    public Result<Map<String, Object>> auditLogDetail(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id) {
        User user = resolveUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        Result<?> denied = requireStaff(authorization);
        if (denied != null) {
            return Result.error(denied.getMessage());
        }
        try {
            return Result.success(auditService.getDetailForUser(user.getId(), id));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/audit-logs")
    @Operation(summary = "订阅视图的周期对比审计日志")
    public Result<List<AnalyticsAuditLogDto>> listAuditLogs(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam String reportKey,
            @RequestParam(required = false) Long viewId,
            @RequestParam(defaultValue = "50") int limit) {
        User user = resolveUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        Result<?> denied = requireStaff(authorization);
        if (denied != null) {
            return Result.error(denied.getMessage());
        }
        try {
            return Result.success(auditService.listForUser(user.getId(), reportKey, viewId, limit));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/views")
    @Operation(summary = "当前用户在某报表下的已保存筛选视图")
    public Result<List<AnalyticsUserViewDto>> listViews(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam String reportKey) {
        User user = resolveUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        try {
            return Result.success(userViewService.listForUser(user.getId(), reportKey));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/views")
    @Operation(summary = "保存筛选视图")
    public Result<AnalyticsUserViewDto> createView(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody AnalyticsUserViewUpsertRequest body) {
        User user = resolveUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        try {
            return Result.success(userViewService.create(user.getId(), body));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PutMapping("/views/{id}")
    @Operation(summary = "更新筛选视图")
    public Result<AnalyticsUserViewDto> updateView(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id,
            @RequestBody AnalyticsUserViewUpsertRequest body) {
        User user = resolveUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        try {
            return Result.success(userViewService.update(user.getId(), id, body));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PutMapping("/views/{id}/subscription")
    @Operation(summary = "开启/关闭订阅（可多选同时订阅）")
    public Result<AnalyticsUserViewDto> toggleSubscription(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id,
            @RequestBody AnalyticsSubscriptionRequest body) {
        User user = resolveUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        boolean subscribed = body != null && Boolean.TRUE.equals(body.getSubscribed());
        try {
            return Result.success(
                    userViewService.setSubscription(
                            user.getId(),
                            id,
                            subscribed,
                            body != null ? body.getBackfillHistory() : null,
                            body != null ? body.getBackfillUntil() : null));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/views/{id}")
    @Operation(summary = "删除筛选视图")
    public Result<Void> deleteView(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id) {
        User user = resolveUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        try {
            userViewService.delete(user.getId(), id);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/views/subscribe")
    @Operation(summary = "订阅：保存筛选并开启自动审计（不影响其他已订阅项）")
    public Result<AnalyticsUserViewDto> subscribeView(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody AnalyticsUserViewUpsertRequest body) {
        User user = resolveUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        try {
            return Result.success(userViewService.subscribe(user.getId(), body));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    private User resolveUser(String authorization) {
        return authContextService.resolveUserFromBearer(authorization);
    }

    private Result<?> requireStaff(String authorization) {
        User user = resolveUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.STUDENT;
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) {
            return Result.error("需要教职工及以上权限");
        }
        return null;
    }
}
