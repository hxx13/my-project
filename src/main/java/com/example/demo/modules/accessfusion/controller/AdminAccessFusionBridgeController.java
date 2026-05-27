package com.example.demo.modules.accessfusion.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.accessfusion.entity.AccessCleanPackage;
import com.example.demo.modules.accessfusion.service.AccessSwingCleanWorkspaceService.CleanMergeResult;
import com.example.demo.modules.accessfusion.entity.AccessDoorRule;
import com.example.demo.modules.accessfusion.mapper.AccessCleanBatchMapper;
import com.example.demo.modules.accessfusion.mapper.AccessCleanedEventMapper;
import com.example.demo.modules.accessfusion.service.*;
import com.example.demo.modules.analytics.service.AnalyticsFilterParams;
import com.example.demo.modules.auth.entity.User;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 与 {@link AccessFusionController} 能力相同，路径挂在 /api/admin/twin 供 adminHttp 调用。
 */
@RestController
@RequestMapping("/api/admin/twin/access-fusion")
@CrossOrigin("*")
public class AdminAccessFusionBridgeController {

    private final AccessDoorRuleService doorRuleService;
    private final AccessEventCleanService cleanService;
    private final AccessRawEventIngestService rawIngestService;
    private final AccessFusionCompareService compareService;
    private final AccessFusionReviewService reviewService;
    private final AccessCleanBatchMapper batchMapper;
    private final AccessCleanedEventMapper cleanedEventMapper;
    private final AccessSwingCleanWorkspaceService workspaceService;
    private final AccessCleanChannelScopeService channelScopeService;
    private final AccessCleanTaskSettingsService taskSettingsService;
    private final AccessCleanRuleProfileService ruleProfileService;
    private final AccessCleanLibraryQueryFacade libraryQueryFacade;
    private final AccessCleanExecutionLogService executionLogService;
    private final AccessCleanIngestService cleanIngestService;
    private final AccessCleanLibraryPurgeService libraryPurgeService;
    private final AuthContextService authContextService;

    public AdminAccessFusionBridgeController(
            AccessDoorRuleService doorRuleService,
            AccessEventCleanService cleanService,
            AccessRawEventIngestService rawIngestService,
            AccessFusionCompareService compareService,
            AccessFusionReviewService reviewService,
            AccessCleanBatchMapper batchMapper,
            AccessCleanedEventMapper cleanedEventMapper,
            AccessSwingCleanWorkspaceService workspaceService,
            AccessCleanChannelScopeService channelScopeService,
            AccessCleanTaskSettingsService taskSettingsService,
            AccessCleanRuleProfileService ruleProfileService,
            AccessCleanLibraryQueryFacade libraryQueryFacade,
            AccessCleanExecutionLogService executionLogService,
            AccessCleanIngestService cleanIngestService,
            AccessCleanLibraryPurgeService libraryPurgeService,
            AuthContextService authContextService) {
        this.doorRuleService = doorRuleService;
        this.cleanService = cleanService;
        this.rawIngestService = rawIngestService;
        this.compareService = compareService;
        this.reviewService = reviewService;
        this.batchMapper = batchMapper;
        this.cleanedEventMapper = cleanedEventMapper;
        this.workspaceService = workspaceService;
        this.channelScopeService = channelScopeService;
        this.taskSettingsService = taskSettingsService;
        this.ruleProfileService = ruleProfileService;
        this.libraryQueryFacade = libraryQueryFacade;
        this.executionLogService = executionLogService;
        this.cleanIngestService = cleanIngestService;
        this.libraryPurgeService = libraryPurgeService;
        this.authContextService = authContextService;
    }

    @GetMapping("/rule-profiles")
    public Result<?> listRuleProfiles(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(ruleProfileService.listAll());
    }

    @PostMapping("/rule-profiles")
    public Result<?> createRuleProfile(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody com.example.demo.modules.accessfusion.entity.AccessCleanRuleProfile body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(ruleProfileService.create(body));
    }

    @PutMapping("/rule-profiles/{id}")
    public Result<?> updateRuleProfile(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id,
            @RequestBody com.example.demo.modules.accessfusion.entity.AccessCleanRuleProfile body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        body.setId(id);
        return Result.success(ruleProfileService.update(body));
    }

    @DeleteMapping("/rule-profiles/{id}")
    public Result<?> deleteRuleProfile(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        ruleProfileService.delete(id);
        return Result.success(null);
    }

    @GetMapping("/library/query")
    public Result<?> queryLibrary(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(required = false) List<String> channelCodes,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime,
            @RequestParam(required = false) String disposition,
            @RequestParam(required = false) String audienceType,
            @RequestParam(required = false) Integer actionType,
            @RequestParam(required = false) String personName,
            @RequestParam(required = false) Long lastRunId,
            @RequestParam(required = false) Long statsPullTaskId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int pageSize) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        int offset = Math.max(0, (page - 1) * pageSize);
        return Result.success(
                libraryQueryFacade.queryLibraryPage(
                        new AccessCleanLibraryQueryFacade.LibraryQuery(
                                channelCodes,
                                startTime,
                                endTime,
                                disposition,
                                audienceType,
                                actionType,
                                personName,
                                lastRunId,
                                statsPullTaskId,
                                offset,
                                pageSize)));
    }

    @PatchMapping("/library/items/{id}")
    public Result<?> patchLibraryItem(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id,
            @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(
                libraryQueryFacade.patchItem(
                        id,
                        str(body.get("disposition")),
                        str(body.get("directionOverride")),
                        str(body.get("manualVerdict")),
                        str(body.get("audienceType"))));
    }

    @GetMapping("/execution-logs")
    public Result<?> listExecutionLogs(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(required = false) Long statsPullTaskId,
            @RequestParam(required = false) Long cleanRuleProfileId,
            @RequestParam(required = false) String executionDate,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "30") int pageSize) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(
                executionLogService.list(statsPullTaskId, cleanRuleProfileId, executionDate, status, page, pageSize));
    }

    @GetMapping("/execution-logs/{id}/detail")
    public Result<?> executionLogDetail(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(executionLogService.detail(id));
    }

    @PutMapping("/execution-logs/{id}")
    public Result<?> updateExecutionLog(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id,
            @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(executionLogService.updateMeta(id, str(body.get("noteText")), str(body.get("status"))));
    }

    @DeleteMapping("/execution-logs/{id}")
    public Result<?> deleteExecutionLog(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        executionLogService.delete(id);
        return Result.success(null);
    }

    @PostMapping("/library/purge")
    public Result<?> purgeLibrary(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        @SuppressWarnings("unchecked")
        List<String> channelCodes =
                body.get("channelCodes") instanceof List<?> list
                        ? list.stream().map(String::valueOf).toList()
                        : null;
        return Result.success(
                libraryPurgeService.purge(
                        str(body.get("confirmToken")),
                        channelCodes,
                        bool(body.get("deleteExecutionLogs"))));
    }

    @PostMapping("/workspace/execute-clean")
    public Result<?> executeClean(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        @SuppressWarnings("unchecked")
        List<Map<String, String>> manualItems =
                body.get("manualItems") instanceof List<?> list
                        ? (List<Map<String, String>>) list
                        : List.of();
        long taskId = longVal(body.get("statsTaskId"));
        long profileId = longVal(body.get("cleanRuleProfileId"));
        String startTime = str(body.get("startTime"));
        String endTime = str(body.get("endTime"));
        String channelCode = str(body.get("channelCode"));
        boolean splitByDay = !body.containsKey("splitByDay") || bool(body.get("splitByDay"));

        if (!manualItems.isEmpty()) {
            com.example.demo.modules.accessfusion.entity.AccessCleanRuleProfile profile = null;
            if (profileId > 0) {
                profile = ruleProfileService.get(profileId);
            } else if (taskId > 0) {
                profile = ruleProfileService.resolveForStatsTask(taskId);
                profileId = profile.getId() != null ? profile.getId() : 0L;
            }
            boolean requireMapping =
                    body.containsKey("requireMapping")
                            ? bool(body.get("requireMapping"))
                            : ruleProfileService.requireMapping(profile);
            boolean openSuccessOnly =
                    body.containsKey("openSuccessOnly")
                            ? bool(body.get("openSuccessOnly"))
                            : ruleProfileService.openSuccessOnly(profile);
            String direction =
                    StringUtils.hasText(str(body.get("swingDirectionFilter")))
                            ? str(body.get("swingDirectionFilter"))
                            : ruleProfileService.directionFilter(profile, null);
            CleanMergeResult merged =
                    workspaceService.mergePackage(
                            taskId,
                            str(body.get("scopeMode")),
                            channelCode,
                            startTime,
                            endTime,
                            true,
                            requireMapping,
                            openSuccessOnly,
                            false,
                            direction,
                            manualItems);
            var log =
                    executionLogService.recordAfterMerge(
                            taskId > 0 ? taskId : null,
                            profileId > 0 ? profileId : null,
                            channelCode,
                            startTime,
                            endTime,
                            merged);
            return Result.success(Map.of("package", merged.packageRow(), "run", merged.run(), "executionLog", log));
        }

        if (splitByDay && taskId > 0 && StringUtils.hasText(startTime) && StringUtils.hasText(endTime)) {
            List<String> channels = resolveCleanChannels(channelCode, taskId);
            Map<String, Object> batch =
                    cleanIngestService.ingestWindow(
                            taskId, channels, startTime, endTime, profileId > 0 ? profileId : null, "MANUAL");
            return Result.success(batch);
        }

        com.example.demo.modules.accessfusion.entity.AccessCleanRuleProfile profile = null;
        if (profileId > 0) {
            profile = ruleProfileService.get(profileId);
        } else if (taskId > 0) {
            profile = ruleProfileService.resolveForStatsTask(taskId);
            profileId = profile.getId() != null ? profile.getId() : 0L;
        }
        boolean requireMapping =
                body.containsKey("requireMapping")
                        ? bool(body.get("requireMapping"))
                        : ruleProfileService.requireMapping(profile);
        boolean openSuccessOnly =
                body.containsKey("openSuccessOnly")
                        ? bool(body.get("openSuccessOnly"))
                        : ruleProfileService.openSuccessOnly(profile);
        String direction =
                StringUtils.hasText(str(body.get("swingDirectionFilter")))
                        ? str(body.get("swingDirectionFilter"))
                        : ruleProfileService.directionFilter(profile, null);
        CleanMergeResult merged =
                workspaceService.mergePackage(
                        taskId,
                        str(body.get("scopeMode")),
                        channelCode,
                        startTime,
                        endTime,
                        true,
                        requireMapping,
                        openSuccessOnly,
                        false,
                        direction,
                        manualItems);
        var log =
                executionLogService.recordAfterMerge(
                        taskId > 0 ? taskId : null,
                        profileId > 0 ? profileId : null,
                        channelCode,
                        startTime,
                        endTime,
                        merged);
        return Result.success(Map.of("package", merged.packageRow(), "run", merged.run(), "executionLog", log));
    }

    @GetMapping("/door-rules")
    public Result<?> listRules(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int pageSize,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long statsTaskId) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(doorRuleService.list(keyword, statsTaskId, page, pageSize));
    }

    @GetMapping("/workspace/enabled-channels")
    public Result<?> listEnabledChannels(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(workspaceService.listGlobalEnabledChannels());
    }

    @GetMapping("/workspace/library-global-summary")
    public Result<?> globalLibrarySummary(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(workspaceService.globalLibrarySummary());
    }

    @PostMapping("/workspace/preview")
    public Result<?> previewWorkspace(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        @SuppressWarnings("unchecked")
        Map<String, Map<String, String>> manual =
                body.get("manualByRecordId") instanceof Map<?, ?> m
                        ? (Map<String, Map<String, String>>) body.get("manualByRecordId")
                        : Map.of();
        boolean incrementalOnly = bool(body.get("incrementalOnly"));
        return Result.success(
                workspaceService.previewWorkspace(
                        longVal(body.get("statsTaskId")),
                        str(body.get("scopeMode")),
                        str(body.get("channelCode")),
                        str(body.get("startTime")),
                        str(body.get("endTime")),
                        bool(body.get("requireMapping")),
                        bool(body.get("openSuccessOnly")),
                        incrementalOnly,
                        str(body.get("swingDirectionFilter")),
                        manual));
    }

    @PostMapping("/workspace/packages")
    public Result<?> savePackage(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        @SuppressWarnings("unchecked")
        List<Map<String, String>> manualItems =
                body.get("manualItems") instanceof List<?> list
                        ? (List<Map<String, String>>) body.get("manualItems")
                        : List.of();
        boolean incrementalOnly = bool(body.get("incrementalOnly"));
        CleanMergeResult merged =
                workspaceService.mergePackage(
                        longVal(body.get("statsTaskId")),
                        str(body.get("scopeMode")),
                        str(body.get("channelCode")),
                        str(body.get("startTime")),
                        str(body.get("endTime")),
                        bool(body.get("publish")),
                        bool(body.get("requireMapping")),
                        bool(body.get("openSuccessOnly")),
                        incrementalOnly,
                        str(body.get("swingDirectionFilter")),
                        manualItems);
        return Result.success(Map.of("package", merged.packageRow(), "run", merged.run()));
    }

    @GetMapping("/workspace/clean-runs")
    public Result<?> listCleanRuns(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam String channelCode,
            @RequestParam(defaultValue = "30") int limit) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(workspaceService.listCleanRuns(channelCode, limit));
    }

    @GetMapping("/workspace/clean-runs/{id}")
    public Result<?> getCleanRun(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id,
            @RequestParam(required = false) String disposition,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "100") int pageSize) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(workspaceService.getCleanRunView(id, disposition, page, pageSize));
    }

    @GetMapping("/workspace/library/items")
    public Result<?> libraryItems(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam String channelCode,
            @RequestParam(required = false) String disposition,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "100") int pageSize) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(workspaceService.getLibraryItems(channelCode, disposition, page, pageSize));
    }

    @DeleteMapping("/workspace/clean-runs/{id}")
    public Result<?> deleteCleanRun(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        workspaceService.deleteCleanRun(id);
        return Result.success(null);
    }

    @PostMapping("/workspace/clean-runs/{id}/rerun")
    public Result<?> rerunCleanRun(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id,
            @RequestBody(required = false) Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        Map<String, Object> req = body != null ? body : Map.of();
        @SuppressWarnings("unchecked")
        List<Map<String, String>> manualItems =
                req.get("manualItems") instanceof List<?> list ? (List<Map<String, String>>) req.get("manualItems") : List.of();
        boolean incrementalOnly = req.get("incrementalOnly") == null || bool(req.get("incrementalOnly"));
        CleanMergeResult merged =
                workspaceService.rerunCleanRun(
                        id,
                        bool(req.get("publish")),
                        bool(req.get("requireMapping")),
                        bool(req.get("openSuccessOnly")),
                        incrementalOnly,
                        manualItems);
        return Result.success(Map.of("package", merged.packageRow(), "run", merged.run()));
    }

    @GetMapping("/workspace/packages")
    public Result<?> listPackages(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam String channelCode) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(workspaceService.listPackages(channelCode));
    }

    @GetMapping("/workspace/packages/living")
    public Result<?> livingPackage(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam String channelCode,
            @RequestParam(required = false) Long statsTaskId) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(
                workspaceService.getLivingPackage(channelCode, statsTaskId != null ? statsTaskId : 0L));
    }

    @GetMapping("/workspace/channel-scope")
    public Result<?> listChannelScope(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam long statsTaskId) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(channelScopeService.list(statsTaskId));
    }

    @GetMapping("/workspace/channel-scope/suggestions")
    public Result<?> suggestChannelScope(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam long statsTaskId,
            @RequestParam(defaultValue = "80") int limit) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(channelScopeService.suggestFromTaskRecords(statsTaskId, limit));
    }

    @GetMapping("/workspace/task-settings")
    public Result<?> getTaskSettings(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam long statsTaskId) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(taskSettingsService.getOrDefault(statsTaskId));
    }

    @PutMapping("/workspace/task-settings")
    public Result<?> saveTaskSettings(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        long taskId = longVal(body.get("statsTaskId"));
        int sec = body.get("debounceSeconds") instanceof Number n ? n.intValue() : 45;
        Integer autoClean =
                body.get("autoCleanPackage") instanceof Number n ? (n.intValue() == 1 ? 1 : 0) : null;
        String directionFilter = str(body.get("swingDirectionFilter"));
        return Result.success(taskSettingsService.save(taskId, sec, autoClean, directionFilter));
    }

    @PutMapping("/workspace/channel-scope")
    public Result<?> replaceChannelScope(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        long taskId = longVal(body.get("statsTaskId"));
        @SuppressWarnings("unchecked")
        List<Map<String, String>> channels =
                body.get("channels") instanceof List<?> list ? (List<Map<String, String>>) body.get("channels") : List.of();
        return Result.success(channelScopeService.replaceScope(taskId, channels));
    }

    @GetMapping("/workspace/packages/{id}")
    public Result<?> packageDetail(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id,
            @RequestParam(required = false) String disposition,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "100") int pageSize) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(workspaceService.getPackageDetail(id, disposition, page, pageSize));
    }

    @PostMapping("/door-rules")
    public Result<?> createRule(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody AccessDoorRule body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(Map.of("id", doorRuleService.create(body)));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PutMapping("/door-rules/{id}")
    public Result<?> updateRule(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id,
            @RequestBody AccessDoorRule body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        doorRuleService.update(id, body);
        return Result.success(Map.of("id", id));
    }

    @DeleteMapping("/door-rules/{id}")
    public Result<?> deleteRule(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        doorRuleService.delete(id);
        return Result.success(null);
    }

    @PostMapping("/raw/backfill")
    public Result<?> backfill(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(Map.of("ingested", rawIngestService.backfillFromSwingTable(startTime, endTime, 500)));
    }

    @PostMapping("/clean/run")
    public Result<?> runClean(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime windowStart,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime windowEnd) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(cleanService.runClean(windowStart, windowEnd, "MANUAL"));
    }

    @GetMapping("/clean/batches")
    public Result<?> listBatches(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(batchMapper.selectRecent(30));
    }

    @GetMapping("/clean/batches/{batchId}/events")
    public Result<?> batchEvents(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long batchId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "100") int pageSize) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        int offset = (Math.max(page, 1) - 1) * Math.min(Math.max(pageSize, 1), 500);
        return Result.success(cleanedEventMapper.selectByBatchId(batchId, offset, Math.min(Math.max(pageSize, 1), 500)));
    }

    @GetMapping("/review-queue")
    public Result<?> reviewQueue(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int pageSize) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(reviewService.listReview(page, pageSize));
    }

    @PostMapping("/review/{id}/confirm")
    public Result<?> confirmReview(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id,
            @RequestParam String direction) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        reviewService.confirmManual(id, direction);
        return Result.success(null);
    }

    @PostMapping("/review/{id}/ai-suggest")
    public Result<?> aiSuggest(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(reviewService.suggestWithAi(id));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/compare/isolation-7d")
    public Result<?> compareIsolation(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(required = false) List<String> campuses,
            @RequestParam(required = false) List<String> floors,
            @RequestParam(required = false) String roomName,
            @RequestParam(defaultValue = "true") boolean excludeBlacklist) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        AnalyticsFilterParams params =
                new AnalyticsFilterParams(campuses, floors, roomName, null, excludeBlacklist, List.of("day"), List.of(), true);
        return Result.success(compareService.compareSevenDays(params));
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static long longVal(Object o) {
        if (o == null) return 0L;
        if (o instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(String.valueOf(o));
        } catch (Exception e) {
            return 0L;
        }
    }

    private List<String> resolveCleanChannels(String singleChannel, long statsTaskId) {
        java.util.LinkedHashSet<String> codes = new java.util.LinkedHashSet<>();
        if (StringUtils.hasText(singleChannel)) {
            codes.add(singleChannel.trim());
        }
        if (statsTaskId > 0) {
            for (com.example.demo.modules.accessfusion.entity.AccessCleanChannelScope row :
                    channelScopeService.list(statsTaskId)) {
                if (row.getEnabled() != null && row.getEnabled() == 0) {
                    continue;
                }
                if (StringUtils.hasText(row.getChannelCode())) {
                    codes.add(row.getChannelCode().trim());
                }
            }
        }
        if (codes.isEmpty()) {
            throw new IllegalArgumentException("按日清洗须指定 channelCode 或配置任务已启用通道漏斗");
        }
        return new java.util.ArrayList<>(codes);
    }

    private static boolean bool(Object o) {
        if (o == null) return false;
        if (o instanceof Boolean b) return b;
        return "true".equalsIgnoreCase(String.valueOf(o)) || "1".equals(String.valueOf(o));
    }

    private Result<?> requireAdmin(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) return Result.error("未登录或令牌无效");
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.STUDENT;
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) return Result.error("无权限访问");
        return null;
    }
}
