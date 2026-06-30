package com.example.demo.modules.accessfusion.service;

import com.example.demo.modules.accessfusion.entity.AccessCleanPackage;
import com.example.demo.modules.accessfusion.entity.AccessCleanPackageItem;
import com.example.demo.modules.accessfusion.entity.AccessRawEvent;
import com.example.demo.modules.accessfusion.entity.AccessSwingCleanRun;
import com.example.demo.modules.accessfusion.mapper.AccessCleanPackageItemMapper;
import com.example.demo.modules.accessfusion.mapper.AccessCleanPackageMapper;
import com.example.demo.modules.accessfusion.mapper.AccessSwingCleanRunMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.demo.modules.accessfusion.model.InferredAccessEvent;
import com.example.demo.modules.accessfusion.support.AccessCleanDaySplitSupport;
import com.example.demo.modules.accessfusion.support.SwingDirectionFilterSupport;
import com.example.demo.modules.twin.dahua.entity.DahuaSwingRecord;
import com.example.demo.modules.twin.dahua.mapper.DahuaSwingMapper;
import com.example.demo.modules.twin.dahua.support.DahuaSwingDepartmentSupport;
import com.example.demo.modules.twin.dahua.support.DahuaSwingEnterExitSupport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class AccessSwingCleanWorkspaceService {

    public record CleanMergeResult(AccessCleanPackage packageRow, AccessSwingCleanRun run) {}

    private static final Logger log = LoggerFactory.getLogger(AccessSwingCleanWorkspaceService.class);
    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    /** 清洗仅消费审计批量拉取写入的记录，排除 REALTIME 窗口轮询 */
    private static final String PULL_TASK_TYPE_STATS = "STATS";
    public static final String SCOPE_SELECTED_TASK = "SELECTED_TASK";
    public static final String SCOPE_ALL_LINKED = "ALL_LINKED";
    /** 试算预览单次最多加载条数（防超时/过大 JSON）；定时/手动合并可走更高上限 */
    private static final int PREVIEW_CAP = 10_000;
    private static final int MERGE_BATCH_LIMIT = 50_000;
    private static final int BATCH_UPSERT = 400;

    private final DahuaSwingMapper dahuaSwingMapper;
    private final AccessDirectionInferenceEngine inferenceEngine;
    private final AccessFusionRoomResolver roomResolver;
    private final AccessCleanPackageMapper packageMapper;
    private final AccessCleanPackageItemMapper packageItemMapper;
    private final AccessSwingCleanRunMapper cleanRunMapper;
    private final AccessCleanChannelScopeService channelScopeService;
    private final AccessCleanTaskSettingsService taskSettingsService;
    private final AccessDoorRuleService doorRuleService;
    private final DahuaSwingDepartmentSupport departmentSupport;
    private final ObjectMapper objectMapper;

    public AccessSwingCleanWorkspaceService(
            DahuaSwingMapper dahuaSwingMapper,
            AccessDirectionInferenceEngine inferenceEngine,
            AccessFusionRoomResolver roomResolver,
            AccessCleanPackageMapper packageMapper,
            AccessCleanPackageItemMapper packageItemMapper,
            AccessSwingCleanRunMapper cleanRunMapper,
            AccessCleanChannelScopeService channelScopeService,
            AccessCleanTaskSettingsService taskSettingsService,
            AccessDoorRuleService doorRuleService,
            DahuaSwingDepartmentSupport departmentSupport,
            ObjectMapper objectMapper) {
        this.dahuaSwingMapper = dahuaSwingMapper;
        this.inferenceEngine = inferenceEngine;
        this.roomResolver = roomResolver;
        this.packageMapper = packageMapper;
        this.packageItemMapper = packageItemMapper;
        this.cleanRunMapper = cleanRunMapper;
        this.channelScopeService = channelScopeService;
        this.taskSettingsService = taskSettingsService;
        this.doorRuleService = doorRuleService;
        this.departmentSupport = departmentSupport;
        this.objectMapper = objectMapper;
    }

    private boolean channelAutoCleanPackageEnabled(List<Long> taskIds) {
        if (taskIds == null || taskIds.isEmpty()) {
            return false;
        }
        for (Long tid : taskIds) {
            if (tid != null && tid > 0 && taskSettingsService.isAutoCleanPackageEnabled(tid)) {
                return true;
            }
        }
        return false;
    }

    public List<Map<String, Object>> listGlobalEnabledChannels() {
        return channelScopeService.listGlobalEnabledChannels();
    }

    /** 全部通道清洗总库汇总（用于管理端「全部通道」视图） */
    public Map<String, Object> globalLibrarySummary() {
        Map<String, Object> sum = packageItemMapper.summarizeGlobalLibrary();
        if (sum == null) {
            sum = new LinkedHashMap<>();
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("totalScanned", intVal(sum.get("totalScanned")));
        out.put("includedCount", intVal(sum.get("includedCount")));
        out.put("excludedCount", intVal(sum.get("excludedCount")));
        out.put("channelCount", intVal(sum.get("channelCount")));
        return out;
    }

    /**
     * 试算仅预览，不写库。默认仅当前审计任务 + STATS 来源 + 契约时间窗。
     */
    public Map<String, Object> previewWorkspace(
            long statsTaskId,
            String scopeMode,
            String channelCode,
            String startTime,
            String endTime,
            boolean requireMapping,
            boolean openSuccessOnly,
            boolean incrementalOnly,
            String swingDirectionFilter,
            Map<String, Map<String, String>> manualByRecordId) {
        CleanQueryContext query =
                buildQueryContext(
                        statsTaskId,
                        scopeMode,
                        channelCode,
                        startTime,
                        endTime,
                        incrementalOnly,
                        swingDirectionFilter);
        List<DahuaSwingRecord> swings =
                loadSwingsForChannel(
                        query.taskIds(),
                        query.channelCode(),
                        query.queryEffectiveStart(),
                        query.queryEffectiveEnd(),
                        query.incrementalAfterTime(),
                        query.directionFilter(),
                        false,
                        PREVIEW_CAP + 1);
        boolean truncated = swings.size() > PREVIEW_CAP;
        if (truncated) {
            swings = swings.subList(0, PREVIEW_CAP);
        }
        int debounce = debounceSecondsForChannel(query.taskIds());
        List<Map<String, Object>> rows =
                buildPreviewRows(
                        query.taskIds(),
                        query.channelCode(),
                        swings,
                        requireMapping,
                        openSuccessOnly,
                        manualByRecordId,
                        debounce);
        Map<String, Object> out = previewSummary(rows, query, truncated);
        out.put("swingDirectionFilter", query.directionFilter());
        out.put("swingDirectionFilterLabel", SwingDirectionFilterSupport.label(query.directionFilter()));
        out.put("incrementalOnly", query.incrementalMode());
        out.put("incrementalAfterTime", query.incrementalAfterTime());
        if (query.incrementalMode() && swings.isEmpty()) {
            out.put("hint", "游标之后暂无新刷卡，无需重复清洗；可关闭「仅增量」查看历史或等待下次拉取。");
        }
        return out;
    }

    /**
     * 手动合并写入清洗总库（按通道账本 upsert，每次产生一条运行日志）。
     */
    @Transactional(rollbackFor = Exception.class)
    public CleanMergeResult mergePackage(
            long statsTaskId,
            String scopeMode,
            String channelCode,
            String startTime,
            String endTime,
            boolean publish,
            boolean requireMapping,
            boolean openSuccessOnly,
            boolean incrementalOnly,
            String swingDirectionFilter,
            List<Map<String, String>> manualItems) {
        return executeMerge(
                statsTaskId,
                scopeMode,
                channelCode,
                startTime,
                endTime,
                publish,
                requireMapping,
                openSuccessOnly,
                incrementalOnly,
                swingDirectionFilter,
                manualItems,
                "MANUAL",
                null,
                null);
    }

    @Transactional(rollbackFor = Exception.class)
    public CleanMergeResult rerunCleanRun(
            long runId,
            boolean publish,
            boolean requireMapping,
            boolean openSuccessOnly,
            boolean incrementalOnly,
            List<Map<String, String>> manualItems) {
        AccessSwingCleanRun old = cleanRunMapper.selectById(runId);
        if (old == null) {
            throw new IllegalArgumentException("清洗运行记录不存在");
        }
        Map<String, Object> snap = parseConfigSnapshot(old.getConfigSnapshotJson());
        long statsTaskId = longVal(snap.get("statsTaskId"));
        if (statsTaskId <= 0 && StringUtils.hasText(old.getStatsTaskIdsJson())) {
            try {
                List<Long> ids =
                        objectMapper.readValue(
                                old.getStatsTaskIdsJson(), new TypeReference<List<Long>>() {});
                if (ids != null && !ids.isEmpty()) {
                    statsTaskId = ids.get(0);
                }
            } catch (Exception ignored) {
                /* 兼容旧批次无 statsTaskId 字段 */
            }
        }
        String scopeMode = str(snap.get("scopeMode"));
        if (!StringUtils.hasText(scopeMode)) {
            scopeMode = SCOPE_SELECTED_TASK;
        }
        String startTime = str(snap.get("dataWindowStart"));
        if (!StringUtils.hasText(startTime)) {
            startTime = str(snap.get("startTime"));
        }
        String endTime = str(snap.get("dataWindowEnd"));
        if (!StringUtils.hasText(endTime)) {
            endTime = str(snap.get("endTime"));
        }
        String afterFromSnap = str(snap.get("incrementalAfterTime"));
        String directionFromSnap = str(snap.get("swingDirectionFilter"));
        packageItemMapper.deleteByLastRunId(runId);
        CleanMergeResult result =
                executeMerge(
                        statsTaskId,
                        scopeMode,
                        old.getChannelCode(),
                        startTime,
                        endTime,
                        publish,
                        requireMapping,
                        openSuccessOnly,
                        false,
                        directionFromSnap,
                        manualItems != null && !manualItems.isEmpty()
                                ? manualItems
                                : manualItemsFromSnapshot(snap),
                        "RERUN",
                        runId,
                        afterFromSnap);
        cleanRunMapper.markSuperseded(runId, result.run().getId());
        return result;
    }

    public List<AccessSwingCleanRun> listCleanRuns(String channelCode, int limit) {
        if (!StringUtils.hasText(channelCode)) {
            return List.of();
        }
        return cleanRunMapper.selectByChannel(channelCode.trim(), Math.min(Math.max(limit, 1), 100));
    }

    /** 删除运行日志及其 last_run_id 指向本批次的总库行（不影响其他批次写入的行） */
    @Transactional(rollbackFor = Exception.class)
    public void deleteCleanRun(long runId) {
        AccessSwingCleanRun run = cleanRunMapper.selectById(runId);
        if (run == null) {
            throw new IllegalArgumentException("清洗运行记录不存在");
        }
        packageItemMapper.deleteByLastRunId(runId);
        cleanRunMapper.deleteById(runId);
    }

    public AccessSwingCleanRun getCleanRun(long runId) {
        AccessSwingCleanRun run = cleanRunMapper.selectById(runId);
        if (run == null) {
            throw new IllegalArgumentException("清洗运行记录不存在");
        }
        return run;
    }

    /** 运行日志详情：结构化配置摘要 + 分页明细（供管理端可视化，非原始 JSON） */
    public Map<String, Object> getCleanRunView(long runId, String disposition, int page, int pageSize) {
        AccessSwingCleanRun run = getCleanRun(runId);
        return buildItemPageView(
                run,
                disposition,
                page,
                pageSize,
                packageItemMapper.selectByLastRunId(
                        runId, blankToNull(disposition), pageOffset(page, pageSize), safePageSize(pageSize)),
                packageItemMapper.countByLastRunId(runId, blankToNull(disposition)),
                packageItemMapper.summarizeByLastRunId(runId));
    }

    /** 通道清洗总库明细分页 */
    public Map<String, Object> getLibraryItems(
            String channelCode, String disposition, int page, int pageSize) {
        String ch = requireEnabledChannel(channelCode);
        AccessCleanPackage pkg = packageMapper.selectPrimaryByChannelCode(ch);
        if (pkg == null) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("package", null);
            empty.put("channelCode", ch);
            empty.put("items", List.of());
            empty.put("total", 0);
            empty.put("page", page);
            empty.put("pageSize", safePageSize(pageSize));
            empty.put("counts", Map.of("totalScanned", 0, "includedCount", 0, "excludedCount", 0));
            return empty;
        }
        int offset = pageOffset(page, pageSize);
        int size = safePageSize(pageSize);
        List<AccessCleanPackageItem> items =
                packageItemMapper.selectByPackage(pkg.getId(), blankToNull(disposition), offset, size);
        int total = packageItemMapper.countByPackage(pkg.getId(), blankToNull(disposition));
        Map<String, Object> sum = packageItemMapper.summarizePackage(pkg.getId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("package", pkg);
        out.put("channelCode", ch);
        out.put("items", items.stream().map(this::itemToViewRow).toList());
        out.put("total", total);
        out.put("page", page);
        out.put("pageSize", size);
        out.put("counts", packageCounts(sum));
        return out;
    }

    private Map<String, Object> buildItemPageView(
            AccessSwingCleanRun run,
            String disposition,
            int page,
            int pageSize,
            List<AccessCleanPackageItem> items,
            int total,
            Map<String, Object> runSum) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("run", run);
        out.put("configSummary", buildConfigSummary(run.getConfigSnapshotJson()));
        out.put("items", items.stream().map(this::itemToViewRow).toList());
        out.put("total", total);
        out.put("page", page);
        out.put("pageSize", safePageSize(pageSize));
        out.put("counts", packageCounts(runSum));
        return out;
    }

    private Map<String, Object> itemToViewRow(AccessCleanPackageItem it) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("recordId", it.getRecordId());
        row.put("swingRowId", it.getSwingRowId());
        row.put("swingTime", it.getSwingTime());
        row.put("channelCode", it.getChannelCode());
        row.put("channelName", it.getChannelName());
        row.put("personCode", it.getPersonCode());
        row.put("personName", it.getPersonName());
        row.put("mappingUserId", it.getMappingUserId());
        row.put("departmentId", it.getDepartmentId());
        row.put("departmentName", it.getDepartmentName());
        row.put("audienceType", it.getAudienceType());
        row.put("disposition", it.getDisposition());
        row.put("autoReason", it.getAutoReason());
        row.put("manualOverride", it.getManualOverride());
        row.put("manualVerdict", it.getManualVerdict());
        row.put("direction", it.getDirection());
        row.put("directionOverride", it.getDirectionOverride());
        if (StringUtils.hasText(it.getDirection())) {
            row.put(
                    "enterOrExitLabel",
                    "ENTER".equals(it.getDirection())
                            ? "进入"
                            : "EXIT".equals(it.getDirection()) ? "离开" : it.getDirection());
        }
        row.put("lastRunId", it.getLastRunId());
        boolean unmapped = !StringUtils.hasText(it.getMappingUserId());
        boolean needsReview =
                "REJECTED".equals(it.getManualVerdict()) || unmapped;
        row.put("needsReview", needsReview);
        return row;
    }

    private Map<String, Object> buildConfigSummary(String json) {
        Map<String, Object> snap = parseConfigSnapshot(json);
        Map<String, Object> out = new LinkedHashMap<>();
        boolean requireMapping = bool(snap.get("requireMapping"));
        boolean openSuccessOnly = snap.get("openSuccessOnly") == null || bool(snap.get("openSuccessOnly"));
        boolean incrementalOnly = snap.get("incrementalOnly") == null || bool(snap.get("incrementalOnly"));
        out.put("requireMapping", requireMapping);
        out.put("requireMappingLabel", requireMapping ? "仅已映射用户" : "不限制映射");
        out.put("openSuccessOnly", openSuccessOnly);
        out.put("openSuccessOnlyLabel", openSuccessOnly ? "仅开门成功" : "含失败刷卡");
        out.put("incrementalOnly", incrementalOnly);
        out.put("incrementalOnlyLabel", incrementalOnly ? "仅增量（游标后）" : "按时间范围全量");
        out.put("statsTaskId", longVal(snap.get("statsTaskId")));
        out.put("scopeMode", str(snap.get("scopeMode")));
        out.put("dataWindowStart", str(snap.get("dataWindowStart")));
        out.put("dataWindowEnd", str(snap.get("dataWindowEnd")));
        out.put("queryEffectiveStart", str(snap.get("queryEffectiveStart")));
        out.put("queryEffectiveEnd", str(snap.get("queryEffectiveEnd")));
        out.put("startTime", str(snap.get("startTime")));
        out.put("endTime", str(snap.get("endTime")));
        out.put("incrementalAfterTime", str(snap.get("incrementalAfterTime")));
        Object debounce = snap.get("debounceSeconds");
        if (debounce != null) {
            out.put("debounceSeconds", debounce);
            out.put("debounceLabel", "去抖 " + debounce + " 秒");
        }
        String directionFilter = SwingDirectionFilterSupport.normalize(str(snap.get("swingDirectionFilter")));
        out.put("swingDirectionFilter", directionFilter);
        out.put("swingDirectionFilterLabel", SwingDirectionFilterSupport.label(directionFilter));
        return out;
    }

    private static Map<String, Object> packageCounts(Map<String, Object> sum) {
        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("totalScanned", intVal(sum != null ? sum.get("totalScanned") : 0));
        counts.put("includedCount", intVal(sum != null ? sum.get("includedCount") : 0));
        counts.put("excludedCount", intVal(sum != null ? sum.get("excludedCount") : 0));
        return counts;
    }

    private static int pageOffset(int page, int pageSize) {
        return (Math.max(page, 1) - 1) * safePageSize(pageSize);
    }

    private static int safePageSize(int pageSize) {
        return Math.min(Math.max(pageSize, 1), 500);
    }

    private static String blankToNull(String disposition) {
        return StringUtils.hasText(disposition) ? disposition.trim() : null;
    }

    private CleanMergeResult executeMerge(
            long statsTaskId,
            String scopeMode,
            String channelCode,
            String startTime,
            String endTime,
            boolean publish,
            boolean requireMapping,
            boolean openSuccessOnly,
            boolean incrementalOnly,
            String swingDirectionFilter,
            List<Map<String, String>> manualItems,
            String triggerType,
            Long supersedesRunId,
            String forcedAfterSwingTime) {
        CleanQueryContext query;
        if ("RERUN".equals(triggerType)) {
            query =
                    buildRerunQueryContext(
                            statsTaskId,
                            scopeMode,
                            channelCode,
                            startTime,
                            endTime,
                            swingDirectionFilter,
                            forcedAfterSwingTime);
        } else {
            query =
                    buildQueryContext(
                            statsTaskId,
                            scopeMode,
                            channelCode,
                            startTime,
                            endTime,
                            incrementalOnly,
                            swingDirectionFilter);
        }
        Map<String, Map<String, String>> manualMap = toManualMap(manualItems);
        List<DahuaSwingRecord> swings =
                loadSwingsForChannel(
                        query.taskIds(),
                        query.channelCode(),
                        query.queryEffectiveStart(),
                        query.queryEffectiveEnd(),
                        query.incrementalAfterTime(),
                        query.directionFilter(),
                        true,
                        MERGE_BATCH_LIMIT);
        if (query.incrementalMode() && swings.isEmpty()) {
            throw new IllegalArgumentException("游标之后暂无新刷卡可合并");
        }
        int debounce = debounceSecondsForChannel(query.taskIds());
        List<Map<String, Object>> preview =
                buildPreviewRows(
                        query.taskIds(),
                        query.channelCode(),
                        swings,
                        requireMapping,
                        openSuccessOnly,
                        manualMap,
                        debounce);
        MergeContext ctx =
                new MergeContext(
                        query,
                        requireMapping,
                        openSuccessOnly,
                        incrementalOnly,
                        debounce,
                        manualItems,
                        supersedesRunId,
                        swings.size() >= MERGE_BATCH_LIMIT);
        return persistMerge(
                query.channelCode(), publish, preview, "SCHEDULED".equals(triggerType), triggerType, ctx);
    }

    public List<AccessCleanPackage> listPackages(String channelCode) {
        if (!StringUtils.hasText(channelCode)) {
            return List.of();
        }
        AccessCleanPackage living = packageMapper.selectPrimaryByChannelCode(channelCode.trim());
        return living == null ? List.of() : List.of(living);
    }

    public Map<String, Object> getLivingPackage(String channelCode, long statsTaskId) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (!StringUtils.hasText(channelCode)) {
            out.put("package", null);
            out.put("manualItems", List.of());
            return out;
        }
        String ch = channelCode.trim();
        AccessCleanPackage pkg = packageMapper.selectPrimaryByChannelCode(ch);
        if (pkg == null) {
            out.put("package", null);
            out.put("manualItems", List.of());
            return out;
        }
        out.put("package", pkg);
        out.put("manualItems", manualItemsFromPackage(pkg.getId()));
        boolean allLinked = statsTaskId <= 0;
        List<Long> taskIds = resolveTaskIds(statsTaskId, ch, allLinked);
        int debounce = debounceSecondsForChannel(taskIds);
        String afterTime = incrementalAfterTime(pkg, debounce);
        String directionFilter =
                statsTaskId > 0
                        ? taskSettingsService.resolveDirectionFilterForTask(statsTaskId, null)
                        : taskSettingsService.resolveDirectionFilter(taskIds, null);
        int pending = countPendingSwings(taskIds, ch, null, null, afterTime, directionFilter);
        out.put("incrementalAfterTime", afterTime);
        out.put("pendingIncrementalCount", pending);
        out.put("swingDirectionFilter", directionFilter);
        return out;
    }

    /**
     * 定时任务：对「已开启自动清洗打包」的任务所覆盖通道，仅合并游标后的新刷卡并落库（保留人工纠正标签）。
     * 历史回溯类任务默认关闭自动打包，避免大量历史数据每次定时重算。
     */
    public Map<String, Object> autoPublishAllEnabledChannels() {
        List<Map<String, Object>> channels = channelScopeService.listGlobalEnabledChannels();
        int ok = 0;
        int skip = 0;
        int skipNoAuto = 0;
        int fail = 0;
        int totalPending = 0;
        List<String> errors = new ArrayList<>();
        List<Map<String, Object>> channelStats = new ArrayList<>();
        for (Map<String, Object> chRow : channels) {
            String channelCode = str(chRow.get("channelCode"));
            if (!StringUtils.hasText(channelCode)) {
                continue;
            }
            try {
                List<Long> taskIds = channelScopeService.enabledTaskIdsForChannel(channelCode);
                if (taskIds.isEmpty()) {
                    skip++;
                    continue;
                }
                AccessCleanPackage existing = packageMapper.selectPrimaryByChannelCode(channelCode);
                int debounce = debounceSecondsForChannel(taskIds);
                String afterTime = incrementalAfterTime(existing, debounce);
                String directionFilter = taskSettingsService.resolveDirectionFilter(taskIds, null);
                int pending = countPendingSwings(taskIds, channelCode, null, null, afterTime, directionFilter);

                Map<String, Object> statRow = new LinkedHashMap<>();
                statRow.put("channelCode", channelCode);
                statRow.put("channelName", chRow.get("channelName"));
                statRow.put("pendingCount", pending);
                statRow.put("incrementalAfterTime", afterTime);
                statRow.put("autoCleanEnabled", channelAutoCleanPackageEnabled(taskIds));

                if (!channelAutoCleanPackageEnabled(taskIds)) {
                    skipNoAuto++;
                    statRow.put("action", "SKIP_NO_AUTO");
                    channelStats.add(statRow);
                    if (pending > 0) {
                        totalPending += pending;
                    }
                    continue;
                }

                if (pending == 0 && existing != null) {
                    skip++;
                    statRow.put("action", "SKIP_EMPTY");
                    channelStats.add(statRow);
                    continue;
                }

                List<Map<String, String>> manual =
                        existing != null ? manualItemsFromPackage(existing.getId()) : List.of();
                CleanQueryContext query =
                        new CleanQueryContext(
                                taskIds,
                                0L,
                                SCOPE_ALL_LINKED,
                                channelCode,
                                null,
                                null,
                                afterTime,
                                null,
                                afterTime,
                                true,
                                directionFilter);
                List<DahuaSwingRecord> swings =
                        loadSwingsForChannel(
                                query.taskIds(),
                                query.channelCode(),
                                query.queryEffectiveStart(),
                                query.queryEffectiveEnd(),
                                query.incrementalAfterTime(),
                                query.directionFilter(),
                                true,
                                MERGE_BATCH_LIMIT);
                List<Map<String, Object>> preview =
                        buildPreviewRows(
                                query.taskIds(),
                                query.channelCode(),
                                swings,
                                false,
                                true,
                                toManualMap(manual),
                                debounce);
                boolean truncated = swings.size() >= MERGE_BATCH_LIMIT;
                if (truncated) {
                    log.warn(
                            "[clean-truncate] autoPublishAll: MERGE_BATCH_LIMIT ({}) reached for channel={}. "
                                    + "{} records loaded, more may exist.",
                            MERGE_BATCH_LIMIT, channelCode, swings.size());
                }
                MergeContext ctx = new MergeContext(query, false, true, true, debounce, manual, null, truncated);
                persistMerge(channelCode, true, preview, true, "SCHEDULED", ctx);
                ok++;
                statRow.put("action", "MERGED");
                statRow.put("mergedRows", preview.size());
                channelStats.add(statRow);
                totalPending += pending;
            } catch (Exception e) {
                fail++;
                errors.add(channelCode + ": " + e.getMessage());
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("channels", channels.size());
        out.put("ok", ok);
        out.put("skip", skip);
        out.put("skipNoAuto", skipNoAuto);
        out.put("fail", fail);
        out.put("totalPending", totalPending);
        out.put("channelStats", channelStats);
        out.put("errors", errors);
        return out;
    }

    /** 仅统计待合并条数，不写库 */
    public Map<String, Object> scanIncrementalPendingAllChannels() {
        List<Map<String, Object>> channels = channelScopeService.listGlobalEnabledChannels();
        int withPending = 0;
        int totalPending = 0;
        List<Map<String, Object>> channelStats = new ArrayList<>();
        for (Map<String, Object> chRow : channels) {
            String channelCode = str(chRow.get("channelCode"));
            if (!StringUtils.hasText(channelCode)) {
                continue;
            }
            List<Long> taskIds = channelScopeService.enabledTaskIdsForChannel(channelCode);
            if (taskIds.isEmpty()) {
                continue;
            }
            AccessCleanPackage existing = packageMapper.selectPrimaryByChannelCode(channelCode);
            int debounce = debounceSecondsForChannel(taskIds);
            String afterTime = incrementalAfterTime(existing, debounce);
            String directionFilter = taskSettingsService.resolveDirectionFilter(taskIds, null);
            int pending = countPendingSwings(taskIds, channelCode, null, null, afterTime, directionFilter);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("channelCode", channelCode);
            row.put("pendingCount", pending);
            row.put("autoCleanEnabled", channelAutoCleanPackageEnabled(taskIds));
            channelStats.add(row);
            if (pending > 0) {
                withPending++;
                totalPending += pending;
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("withPending", withPending);
        out.put("totalPending", totalPending);
        out.put("channelStats", channelStats);
        return out;
    }

    /** @deprecated 兼容旧定时入口 */
    public Map<String, Object> autoPublishAllEnabledTasks() {
        return autoPublishAllEnabledChannels();
    }

    /**
     * 强制回源清洗：对所有已启用通道在指定时间窗内执行全量（非增量）合并。
     * 用于强制重算、定时安全网等需要回到门禁原表重新清洗的场景。
     * @param startTime  时间窗起始 (yyyy-MM-dd HH:mm:ss)
     * @param endTime    时间窗结束 (yyyy-MM-dd HH:mm:ss)
     * @param triggerType 触发类型标签（FORCE_RECALC / PIPELINE_SAFETY_NET）
     */
    public Map<String, Object> forceMergeAllChannelsForWindow(
            String startTime, String endTime, String triggerType) {
        List<Map<String, Object>> channels = channelScopeService.listGlobalEnabledChannels();
        int ok = 0;
        int fail = 0;
        int skipped = 0;
        int totalIncluded = 0;
        List<String> errors = new ArrayList<>();
        List<Map<String, Object>> channelResults = new ArrayList<>();
        for (Map<String, Object> chRow : channels) {
            String channelCode = str(chRow.get("channelCode"));
            if (!StringUtils.hasText(channelCode)) {
                continue;
            }
            try {
                List<Long> taskIds = channelScopeService.enabledTaskIdsForChannel(channelCode);
                if (taskIds.isEmpty()) {
                    skipped++;
                    continue;
                }
                List<AccessCleanDaySplitSupport.DayWindow> days =
                        AccessCleanDaySplitSupport.split(startTime, endTime);
                int chIncluded = 0;
                int chDays = 0;
                for (AccessCleanDaySplitSupport.DayWindow day : days) {
                    try {
                        CleanMergeResult merged = mergePackage(
                                0L,
                                SCOPE_ALL_LINKED,
                                channelCode,
                                day.windowStart(),
                                day.windowEnd(),
                                true,
                                false,
                                true,
                                false,
                                SwingDirectionFilterSupport.ALL,
                                List.of());
                        int included = merged.run() != null
                                ? intVal(merged.run().getIncludedCount()) : 0;
                        chIncluded += included;
                        chDays++;
                    } catch (Exception dayEx) {
                        errors.add(channelCode + " day=" + day.coverageDay()
                                + ": " + dayEx.getMessage());
                    }
                }
                totalIncluded += chIncluded;
                ok++;
                Map<String, Object> cr = new LinkedHashMap<>();
                cr.put("channelCode", channelCode);
                cr.put("days", chDays);
                cr.put("included", chIncluded);
                channelResults.add(cr);
            } catch (Exception e) {
                fail++;
                errors.add(channelCode + ": " + e.getMessage());
                log.warn("[force-merge] channel={} failed: {}", channelCode, e.getMessage());
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("triggerType", triggerType);
        out.put("channels", channels.size());
        out.put("ok", ok);
        out.put("fail", fail);
        out.put("skipped", skipped);
        out.put("totalIncluded", totalIncluded);
        out.put("channelResults", channelResults);
        out.put("errors", errors);
        log.info("[force-merge] {}: {} ok, {} fail, {} skipped, {} total included",
                triggerType, ok, fail, skipped, totalIncluded);
        return out;
    }

    /**
     * 检测清洗缺口：对比门禁原表与清洗库，找出 raw 有记录但 clean 缺失或差距过大的通道。
     * @param startDate 日期起 (yyyy-MM-dd)
     * @param endDate   日期止 (yyyy-MM-dd)
     * @param minGapThreshold 最小缺口阈值，低于此值不报告
     */
    public List<Map<String, Object>> detectCleaningGaps(
            String startDate, String endDate, int minGapThreshold) {
        List<Map<String, Object>> channels = channelScopeService.listGlobalEnabledChannels();
        List<Map<String, Object>> gaps = new ArrayList<>();
        String queryStart = startDate + " 00:00:00";
        String queryEnd = endDate + " 23:59:59";
        for (Map<String, Object> chRow : channels) {
            String channelCode = str(chRow.get("channelCode"));
            if (!StringUtils.hasText(channelCode)) {
                continue;
            }
            List<Long> taskIds = channelScopeService.enabledTaskIdsForChannel(channelCode);
            if (taskIds.isEmpty()) {
                continue;
            }
            int rawCount = dahuaSwingMapper.countRecordsForChannelTasks(
                    taskIds, channelCode, queryStart, queryEnd,
                    null, null, PULL_TASK_TYPE_STATS);
            int cleanCount = packageItemMapper.countIncludedBetween(
                    channelCode, queryStart, queryEnd);
            int gap = rawCount - cleanCount;
            if (gap >= minGapThreshold) {
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("channelCode", channelCode);
                entry.put("channelName", chRow.get("channelName"));
                entry.put("rawCount", rawCount);
                entry.put("cleanCount", cleanCount);
                entry.put("gap", gap);
                entry.put("taskCount", taskIds.size());
                gaps.add(entry);
                log.warn(
                        "[clean-gap] channel={} has {} raw records but only {} cleaned "
                                + "(gap={}) in [{}, {}]",
                        channelCode, rawCount, cleanCount, gap, startDate, endDate);
            }
        }
        return gaps;
    }

    public Map<String, Object> getPackageDetail(long packageId, String disposition, int page, int pageSize) {
        int safeSize = Math.min(Math.max(pageSize, 1), 500);
        int offset = (Math.max(page, 1) - 1) * safeSize;
        AccessCleanPackage pkg = packageMapper.selectById(packageId);
        if (pkg == null) {
            throw new IllegalArgumentException("数据包不存在");
        }
        List<AccessCleanPackageItem> items =
                packageItemMapper.selectByPackage(packageId, disposition, offset, safeSize);
        int total = packageItemMapper.countByPackage(packageId, disposition);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("package", pkg);
        out.put("items", items.stream().map(this::itemToViewRow).toList());
        out.put("total", total);
        out.put("page", page);
        out.put("pageSize", safeSize);
        return out;
    }

    private record MergeContext(
            CleanQueryContext query,
            boolean requireMapping,
            boolean openSuccessOnly,
            boolean incrementalOnly,
            int debounceSeconds,
            List<Map<String, String>> manualItems,
            Long supersedesRunId,
            boolean truncated) {}

    private CleanMergeResult persistMerge(
            String channelCode,
            boolean publish,
            List<Map<String, Object>> preview,
            boolean scheduledIncremental,
            String triggerType,
            MergeContext ctx) {
        AccessCleanPackage pkg = packageMapper.selectPrimaryByChannelCode(channelCode);
        boolean isNew = pkg == null;
        String ledgerLabel = channelCode + " 清洗总库";
        if (isNew) {
            pkg = new AccessCleanPackage();
            pkg.setStatsTaskId(ctx.query().primaryStatsTaskId() > 0 ? ctx.query().primaryStatsTaskId() : 0L);
            pkg.setChannelCode(channelCode);
            pkg.setPackageName(ledgerLabel);
            pkg.setStatus(publish ? "PUBLISHED" : "DRAFT");
            pkg.setPublishedAt(publish ? LocalDateTime.now() : null);
            pkg.setTotalScanned(0);
            pkg.setIncludedCount(0);
            pkg.setExcludedCount(0);
            pkg.setReviewCount(0);
            packageMapper.insert(pkg);
        } else {
            if (!StringUtils.hasText(pkg.getPackageName())) {
                pkg.setPackageName(ledgerLabel);
            }
            if (ctx.query().primaryStatsTaskId() > 0) {
                pkg.setStatsTaskId(ctx.query().primaryStatsTaskId());
            }
            if (publish) {
                pkg.setStatus("PUBLISHED");
                pkg.setPublishedAt(LocalDateTime.now());
            }
        }

        AccessSwingCleanRun run = new AccessSwingCleanRun();
        run.setChannelCode(channelCode);
        run.setPackageId(pkg.getId());
        run.setTriggerType(triggerType);
        run.setStatsTaskIdsJson(taskIdsToJson(ctx.query().taskIds()));
        run.setConfigSnapshotJson(buildConfigSnapshot(ctx));
        run.setIncrementalAfterTime(parseTime(ctx.query().incrementalAfterTime()));
        run.setStatus("RUNNING");
        run.setTotalScanned(0);
        run.setIncludedCount(0);
        run.setExcludedCount(0);
        run.setReviewCount(0);
        run.setStartedAt(LocalDateTime.now());
        cleanRunMapper.insert(run);

        List<AccessCleanPackageItem> items = previewToItems(pkg.getId(), run.getId(), preview);
        for (int i = 0; i < items.size(); i += BATCH_UPSERT) {
            // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
            packageItemMapper.upsertBatch(items.subList(i, Math.min(i + BATCH_UPSERT, items.size())));
        }

        LocalDateTime maxSwing = preview.stream()
                .map(r -> parseTime(String.valueOf(r.get("swingTime"))))
                .filter(t -> t != null)
                .max(LocalDateTime::compareTo)
                .orElse(pkg.getLastMergedSwingTime());
        LocalDateTime minSwing = preview.stream()
                .map(r -> parseTime(String.valueOf(r.get("swingTime"))))
                .filter(t -> t != null)
                .min(LocalDateTime::compareTo)
                .orElse(null);
        if (maxSwing != null) {
            if (pkg.getLastMergedSwingTime() == null || maxSwing.isAfter(pkg.getLastMergedSwingTime())) {
                pkg.setLastMergedSwingTime(maxSwing);
            }
        }

        RunCounts counts = countPreview(preview);
        run.setStatus("DONE");
        run.setTotalScanned(counts.total());
        run.setIncludedCount(counts.included());
        run.setExcludedCount(counts.excluded());
        run.setReviewCount(counts.review());
        LocalDateTime contractStart = parseTime(ctx.query().queryEffectiveStart());
        LocalDateTime contractEnd = parseTime(ctx.query().queryEffectiveEnd());
        run.setWindowStart(contractStart != null ? contractStart : minSwing);
        run.setWindowEnd(contractEnd != null ? contractEnd : maxSwing);
        run.setFinishedAt(LocalDateTime.now());
        cleanRunMapper.updateDone(run);

        Map<String, Object> sum = packageItemMapper.summarizePackage(pkg.getId());
        pkg.setTotalScanned(intVal(sum.get("totalScanned")));
        pkg.setIncludedCount(intVal(sum.get("includedCount")));
        pkg.setExcludedCount(intVal(sum.get("excludedCount")));
        pkg.setReviewCount(intVal(sum.get("reviewCount")));
        pkg.setWindowStart(toLocalDateTime(sum.get("windowStart")));
        pkg.setWindowEnd(toLocalDateTime(sum.get("windowEnd")));
        pkg.setChannelCode(channelCode);
        if (scheduledIncremental && !publish && pkg.getStatus() == null) {
            pkg.setStatus("DRAFT");
        }
        packageMapper.update(pkg);
        return new CleanMergeResult(pkg, run);
    }

    private record RunCounts(int total, int included, int excluded, int review) {}

    private static RunCounts countPreview(List<Map<String, Object>> preview) {
        int included = 0;
        int excluded = 0;
        int review = 0;
        for (Map<String, Object> r : preview) {
            if ("INCLUDED".equals(r.get("disposition"))) {
                included++;
            } else {
                excluded++;
            }
            if (Boolean.TRUE.equals(r.get("needsReview"))) {
                review++;
            }
        }
        return new RunCounts(preview.size(), included, excluded, review);
    }

    private List<AccessCleanPackageItem> previewToItems(
            long packageId, long runId, List<Map<String, Object>> preview) {
        List<AccessCleanPackageItem> items = new ArrayList<>();
        for (Map<String, Object> row : preview) {
            AccessCleanPackageItem it = new AccessCleanPackageItem();
            it.setPackageId(packageId);
            it.setLastRunId(runId);
            it.setSwingRowId(row.get("swingRowId") != null ? ((Number) row.get("swingRowId")).longValue() : null);
            it.setRecordId(String.valueOf(row.get("recordId")));
            it.setSwingTime(parseTime(String.valueOf(row.get("swingTime"))));
            it.setChannelCode(String.valueOf(row.get("channelCode")));
            it.setChannelName((String) row.get("channelName"));
            it.setPersonCode((String) row.get("personCode"));
            it.setPersonName((String) row.get("personName"));
            it.setMappingUserId((String) row.get("mappingUserId"));
            it.setDepartmentId((String) row.get("departmentId"));
            it.setDepartmentName((String) row.get("departmentName"));
            String audience = (String) row.get("audienceType");
            it.setAudienceType(
                    StringUtils.hasText(audience)
                            ? audience.trim()
                            : departmentSupport.classifyAudience(
                                    (String) row.get("departmentId"), (String) row.get("departmentName")));
            it.setDisposition(String.valueOf(row.get("disposition")));
            it.setAutoReason((String) row.get("autoReason"));
            it.setManualOverride((String) row.get("manualOverride"));
            it.setManualVerdict((String) row.get("manualVerdict"));
            it.setDirection((String) row.get("direction"));
            it.setDirectionOverride((String) row.get("directionOverride"));
            items.add(it);
        }
        return items;
    }

    /** 清洗输入契约：任务范围、数据窗、实际 SQL 窗、进出筛选 */
    private record CleanQueryContext(
            List<Long> taskIds,
            long primaryStatsTaskId,
            String scopeMode,
            String channelCode,
            String dataWindowStart,
            String dataWindowEnd,
            String queryEffectiveStart,
            String queryEffectiveEnd,
            String incrementalAfterTime,
            boolean incrementalMode,
            String directionFilter) {}

    private CleanQueryContext buildQueryContext(
            long statsTaskId,
            String scopeMode,
            String channelCode,
            String userStart,
            String userEnd,
            boolean incrementalOnly,
            String swingDirectionFilter) {
        String mode = normalizeScopeMode(scopeMode);
        boolean allLinked = SCOPE_ALL_LINKED.equals(mode);
        String ch = requireEnabledChannel(channelCode);
        if (!allLinked) {
            if (statsTaskId <= 0) {
                throw new IllegalArgumentException("请先选择审计拉取任务");
            }
            if (!channelScopeService.isChannelInTaskScope(statsTaskId, ch)) {
                throw new IllegalArgumentException("该通道未在当前统计任务的通道漏斗中启用");
            }
        }
        List<Long> taskIds = resolveTaskIds(statsTaskId, ch, allLinked);
        if (taskIds.isEmpty()) {
            throw new IllegalArgumentException("未找到可用的审计任务数据源");
        }
        String directionFilter =
                allLinked
                        ? taskSettingsService.resolveDirectionFilter(taskIds, swingDirectionFilter)
                        : taskSettingsService.resolveDirectionFilterForTask(statsTaskId, swingDirectionFilter);
        String dataStart = normalizeDateTimeParam(userStart);
        String dataEnd = normalizeDateTimeParam(userEnd);
        AccessCleanPackage existing = packageMapper.selectPrimaryByChannelCode(ch);
        int debounce = debounceSecondsForChannel(taskIds);
        String afterCursor = incrementalOnly ? incrementalAfterTime(existing, debounce) : null;
        boolean incrementalMode = incrementalOnly && StringUtils.hasText(afterCursor);
        String effectiveStart = dataStart;
        if (incrementalMode) {
            effectiveStart = maxDateTime(dataStart, afterCursor);
        }
        long primaryTaskId = allLinked ? (taskIds.size() == 1 ? taskIds.get(0) : 0L) : statsTaskId;
        return new CleanQueryContext(
                taskIds,
                primaryTaskId,
                mode,
                ch,
                dataStart,
                dataEnd,
                effectiveStart,
                dataEnd,
                afterCursor,
                incrementalMode,
                directionFilter);
    }

    private CleanQueryContext buildRerunQueryContext(
            long statsTaskId,
            String scopeMode,
            String channelCode,
            String dataStart,
            String dataEnd,
            String swingDirectionFilter,
            String forcedAfterSwingTime) {
        String mode = normalizeScopeMode(scopeMode);
        boolean allLinked = SCOPE_ALL_LINKED.equals(mode);
        String ch = requireEnabledChannel(channelCode);
        List<Long> taskIds = resolveTaskIds(statsTaskId, ch, allLinked);
        String directionFilter =
                statsTaskId > 0 && !allLinked
                        ? taskSettingsService.resolveDirectionFilterForTask(statsTaskId, swingDirectionFilter)
                        : taskSettingsService.resolveDirectionFilter(taskIds, swingDirectionFilter);
        String ds = normalizeDateTimeParam(dataStart);
        String de = normalizeDateTimeParam(dataEnd);
        String after = normalizeDateTimeParam(forcedAfterSwingTime);
        boolean incrementalMode = StringUtils.hasText(after);
        String effectiveStart = incrementalMode ? maxDateTime(ds, after) : ds;
        long primaryTaskId = statsTaskId > 0 ? statsTaskId : (taskIds.size() == 1 ? taskIds.get(0) : 0L);
        return new CleanQueryContext(
                taskIds,
                primaryTaskId,
                mode,
                ch,
                ds,
                de,
                effectiveStart,
                de,
                after,
                incrementalMode,
                directionFilter);
    }

    private List<Long> resolveTaskIds(long statsTaskId, String channelCode, boolean allLinked) {
        if (allLinked) {
            return channelScopeService.enabledTaskIdsForChannel(channelCode);
        }
        if (statsTaskId <= 0) {
            return List.of();
        }
        return List.of(statsTaskId);
    }

    private static String normalizeScopeMode(String scopeMode) {
        if (SCOPE_ALL_LINKED.equalsIgnoreCase(String.valueOf(scopeMode).trim())) {
            return SCOPE_ALL_LINKED;
        }
        return SCOPE_SELECTED_TASK;
    }

    private static String normalizeDateTimeParam(String raw) {
        return StringUtils.hasText(raw) ? raw.trim() : null;
    }

    private static String maxDateTime(String a, String b) {
        if (!StringUtils.hasText(a)) {
            return b;
        }
        if (!StringUtils.hasText(b)) {
            return a;
        }
        LocalDateTime ta = parseTime(a);
        LocalDateTime tb = parseTime(b);
        if (ta == null) {
            return b;
        }
        if (tb == null) {
            return a;
        }
        return !ta.isBefore(tb) ? a : b;
    }

    private static boolean matchesDirectionFilter(DahuaSwingRecord record, String swingDirectionFilter) {
        String normalized = SwingDirectionFilterSupport.normalize(swingDirectionFilter);
        if (SwingDirectionFilterSupport.ALL.equals(normalized)) {
            return true;
        }
        DahuaSwingEnterExitSupport.applyResolved(record);
        Integer enterOrExit = record.getEnterOrExit();
        Integer expected = SwingDirectionFilterSupport.toEnterOrExit(normalized);
        return expected != null && expected.equals(enterOrExit);
    }

    private int countPendingSwings(
            List<Long> taskIds,
            String channelCode,
            String start,
            String end,
            String afterSwingTime,
            String swingDirectionFilter) {
        if (taskIds == null || taskIds.isEmpty() || !StringUtils.hasText(channelCode)) {
            return 0;
        }
        return dahuaSwingMapper.countRecordsForChannelTasks(
                taskIds,
                channelCode.trim(),
                start,
                end,
                afterSwingTime,
                null,
                PULL_TASK_TYPE_STATS);
    }

    private static String incrementalAfterTime(AccessCleanPackage existing, int debounceSeconds) {
        if (existing == null || existing.getLastMergedSwingTime() == null) {
            return null;
        }
        LocalDateTime cursor = existing.getLastMergedSwingTime().minusSeconds(Math.max(debounceSeconds, 0));
        return cursor.format(DT);
    }

    private String requireEnabledChannel(String channelCode) {
        if (!StringUtils.hasText(channelCode)) {
            throw new IllegalArgumentException("请选择通道");
        }
        String ch = channelCode.trim();
        if (!channelScopeService.isChannelGloballyEnabled(ch)) {
            throw new IllegalArgumentException("该通道未在任何统计任务的通道漏斗中启用");
        }
        return ch;
    }

    private int debounceSecondsForChannel(List<Long> taskIds) {
        int max = 45;
        for (Long tid : taskIds) {
            if (tid != null && tid > 0) {
                max = Math.max(max, taskSettingsService.debounceSecondsForTask(tid));
            }
        }
        return max;
    }

    private List<DahuaSwingRecord> loadSwingsForChannel(
            List<Long> taskIds,
            String channelCode,
            String start,
            String end,
            String afterSwingTime,
            String swingDirectionFilter,
            boolean sortAsc,
            int limit) {
        if (taskIds == null || taskIds.isEmpty() || !StringUtils.hasText(channelCode)) {
            return List.of();
        }
        List<DahuaSwingRecord> loaded =
                dahuaSwingMapper.listRecordsForChannelTasks(
                        taskIds,
                        channelCode.trim(),
                        start,
                        end,
                        afterSwingTime,
                        null,
                        PULL_TASK_TYPE_STATS,
                        sortAsc,
                        limit,
                        0);
        if (loaded.size() >= limit && limit > 0) {
            log.warn(
                    "[clean-truncate] Swing records truncated at limit={}: channel={} window=[{}, {}] taskIds={}",
                    limit, channelCode, start, end, taskIds);
        }
        if (SwingDirectionFilterSupport.ALL.equals(SwingDirectionFilterSupport.normalize(swingDirectionFilter))) {
            return loaded;
        }
        List<DahuaSwingRecord> filtered = new ArrayList<>();
        for (DahuaSwingRecord s : loaded) {
            if (matchesDirectionFilter(s, swingDirectionFilter)) {
                filtered.add(s);
            }
        }
        return filtered;
    }

    private Map<String, Object> previewSummary(
            List<Map<String, Object>> rows, CleanQueryContext query, boolean truncated) {
        int included = 0;
        int excluded = 0;
        int review = 0;
        int missingEnterOrExit = 0;
        for (Map<String, Object> r : rows) {
            if ("INCLUDED".equals(r.get("disposition"))) {
                included++;
            } else {
                excluded++;
            }
            if (Boolean.TRUE.equals(r.get("needsReview"))) {
                review++;
            }
            if (r.get("enterOrExit") == null) {
                missingEnterOrExit++;
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("rows", rows);
        out.put("total", rows.size());
        out.put("includedCount", included);
        out.put("excludedCount", excluded);
        out.put("reviewCount", review);
        out.put("missingEnterOrExitCount", missingEnterOrExit);
        out.put("truncated", truncated);
        out.put("previewCap", PREVIEW_CAP);
        out.put("channelCode", query.channelCode());
        out.put("sourceTaskCount", query.taskIds().size());
        out.put("statsTaskId", query.primaryStatsTaskId());
        out.put("scopeMode", query.scopeMode());
        out.put("dataWindowStart", query.dataWindowStart());
        out.put("dataWindowEnd", query.dataWindowEnd());
        out.put("queryEffectiveStart", query.queryEffectiveStart());
        out.put("queryEffectiveEnd", query.queryEffectiveEnd());
        out.put("pullTaskType", PULL_TASK_TYPE_STATS);
        out.put("previewOnly", true);
        return out;
    }

    private List<Map<String, String>> manualItemsFromPackage(long packageId) {
        List<AccessCleanPackageItem> items = packageItemMapper.selectAllByPackage(packageId);
        List<Map<String, String>> manual = new ArrayList<>();
        for (AccessCleanPackageItem it : items) {
            if (!StringUtils.hasText(it.getManualOverride())
                    && !StringUtils.hasText(it.getManualVerdict())
                    && !StringUtils.hasText(it.getDirectionOverride())) {
                continue;
            }
            Map<String, String> m = new LinkedHashMap<>();
            m.put("recordId", it.getRecordId());
            if (StringUtils.hasText(it.getManualOverride())) {
                m.put("manualOverride", it.getManualOverride());
            }
            if (StringUtils.hasText(it.getManualVerdict())) {
                m.put("manualVerdict", it.getManualVerdict());
            }
            if (StringUtils.hasText(it.getDirectionOverride())) {
                m.put("directionOverride", it.getDirectionOverride());
            }
            manual.add(m);
        }
        return manual;
    }

    private List<Map<String, Object>> buildPreviewRows(
            List<Long> taskIds,
            String channelCode,
            List<DahuaSwingRecord> swings,
            boolean requireMapping,
            boolean openSuccessOnly,
            Map<String, Map<String, String>> manualByRecordId,
            int debounceSeconds) {
        String channelName =
                swings.isEmpty() ? channelCode : swings.get(0).getChannelName();
        doorRuleService.ensureDahuaRuleForChannel(channelCode, channelName, taskIds);
        Map<String, com.example.demo.modules.accessfusion.entity.AccessDoorRule> rulesByChannel =
                doorRuleService.rulesByChannelForTasks(channelCode, taskIds);
        List<AccessRawEvent> rawCandidates = new ArrayList<>();
        for (DahuaSwingRecord s : swings) {
            if (s.getRecordId() == null || s.getRecordId().isBlank()) {
                continue;
            }
            DahuaSwingEnterExitSupport.applyResolved(s);
            String preReason = preFilterReason(s, requireMapping, openSuccessOnly);
            if (preReason != null) {
                continue;
            }
            AccessRawEvent raw = AccessRawEventIngestService.swingToRaw(s, "STATS_PULL");
            if (raw.getSwingTime() != null) {
                rawCandidates.add(raw);
            }
        }

        Set<String> debounceDropped =
                AccessPersonDebounce.droppedRecordIds(rawCandidates, debounceSeconds);

        List<InferredAccessEvent> inferred =
                inferenceEngine.infer(rawCandidates, rulesByChannel, roomResolver, debounceSeconds);
        Map<String, InferredAccessEvent> inferredByRecordId = new HashMap<>();
        for (InferredAccessEvent ev : inferred) {
            if (ev.raw != null && ev.raw.getRecordId() != null) {
                inferredByRecordId.put(ev.raw.getRecordId(), ev);
            }
        }
        Set<String> includedIds = new LinkedHashSet<>(inferredByRecordId.keySet());

        List<Map<String, Object>> rows = new ArrayList<>();
        for (DahuaSwingRecord s : swings) {
            if (s.getRecordId() == null || s.getRecordId().isBlank()) {
                continue;
            }
            Map<String, String> manual = manualByRecordId.get(s.getRecordId());
            String manualOverride = manual != null ? manual.get("manualOverride") : null;
            String manualVerdict = manual != null ? manual.get("manualVerdict") : null;
            String directionOverride = manual != null ? manual.get("directionOverride") : null;

            String autoReason = preFilterReason(s, requireMapping, openSuccessOnly);
            boolean autoIncluded = autoReason == null && includedIds.contains(s.getRecordId());
            if (autoReason == null && !autoIncluded) {
                if (debounceDropped.contains(s.getRecordId())) {
                    autoReason = "同人同通道去抖";
                } else {
                    autoReason = "规则去重或未命中推断";
                }
            }

            String disposition;
            if ("FORCE_INCLUDE".equals(manualOverride)) {
                disposition = "INCLUDED";
            } else if ("FORCE_EXCLUDE".equals(manualOverride)) {
                disposition = "EXCLUDED";
            } else if (autoIncluded) {
                disposition = "INCLUDED";
            } else {
                disposition = "EXCLUDED";
            }

            InferredAccessEvent inf = inferredByRecordId.get(s.getRecordId());
            String direction = SwingDirectionFilterSupport.directionFromEnterOrExit(s.getEnterOrExit());
            if (direction == null && inf != null) {
                direction = inf.direction;
            }
            boolean unmappedPerson = s.getMappingHit() == null || s.getMappingHit() != 1;
            boolean needsReview =
                    (inf != null && inf.needsReview)
                            || "REJECTED".equals(manualVerdict)
                            || unmappedPerson;

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("swingRowId", s.getId());
            row.put("recordId", s.getRecordId());
            row.put("swingTime", s.getSwingTime());
            row.put("channelCode", s.getChannelCode());
            row.put("channelName", s.getChannelName());
            row.put("personCode", s.getPersonCode());
            row.put("personName", s.getPersonName());
            row.put("mappingUserId", s.getMappingUserId());
            var dept = departmentSupport.resolveForClassification(s);
            row.put("departmentId", dept.id());
            row.put("departmentName", dept.name());
            String audience = departmentSupport.classifyAudienceForRecord(s);
            row.put("audienceType", audience);
            row.put("mappingHit", s.getMappingHit());
            row.put("openType", s.getOpenType());
            row.put("openResult", s.getOpenResult());
            row.put("enterOrExit", s.getEnterOrExit());
            row.put("enterOrExitLabel", SwingDirectionFilterSupport.labelFromEnterOrExit(s.getEnterOrExit()));
            row.put("disposition", disposition);
            row.put("autoReason", autoReason);
            row.put("manualOverride", manualOverride);
            row.put("manualVerdict", manualVerdict);
            row.put("direction", direction);
            row.put("directionOverride", directionOverride);
            row.put("needsReview", needsReview);
            rows.add(row);
        }
        return rows;
    }

    private static String preFilterReason(DahuaSwingRecord s, boolean requireMapping, boolean openSuccessOnly) {
        if (requireMapping && (s.getMappingHit() == null || s.getMappingHit() != 1)) {
            return "未映射用户";
        }
        if (openSuccessOnly && s.getOpenResult() != null && s.getOpenResult() != 1) {
            return "非开门成功";
        }
        return null;
    }

    private static Map<String, Map<String, String>> toManualMap(List<Map<String, String>> items) {
        if (items == null || items.isEmpty()) {
            return Map.of();
        }
        return items.stream()
                .filter(m -> m.get("recordId") != null && !m.get("recordId").isBlank())
                .collect(Collectors.toMap(m -> m.get("recordId"), m -> m, (a, b) -> b));
    }

    private static LocalDateTime parseTime(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        try {
            return LocalDateTime.parse(text.trim().replace("T", " ").substring(0, 19), DT);
        } catch (Exception e) {
            return null;
        }
    }

    private static LocalDateTime toLocalDateTime(Object v) {
        if (v == null) return null;
        if (v instanceof LocalDateTime ldt) return ldt;
        if (v instanceof java.sql.Timestamp ts) return ts.toLocalDateTime();
        return parseTime(String.valueOf(v));
    }

    private static int intVal(Object v) {
        if (v == null) return 0;
        if (v instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(v));
        } catch (Exception e) {
            return 0;
        }
    }

    private static long longVal(Object v) {
        if (v == null) return 0L;
        if (v instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(String.valueOf(v));
        } catch (Exception e) {
            return 0L;
        }
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static boolean bool(Object o) {
        if (o == null) return false;
        if (o instanceof Boolean b) return b;
        return "true".equalsIgnoreCase(String.valueOf(o)) || "1".equals(String.valueOf(o));
    }

    private String taskIdsToJson(List<Long> taskIds) {
        try {
            return objectMapper.writeValueAsString(taskIds != null ? taskIds : List.of());
        } catch (Exception e) {
            return "[]";
        }
    }

    private String buildConfigSnapshot(MergeContext ctx) {
        CleanQueryContext q = ctx.query();
        Map<String, Object> snap = new LinkedHashMap<>();
        snap.put("statsTaskId", q.primaryStatsTaskId());
        snap.put("scopeMode", q.scopeMode());
        snap.put("dataWindowStart", q.dataWindowStart());
        snap.put("dataWindowEnd", q.dataWindowEnd());
        snap.put("queryEffectiveStart", q.queryEffectiveStart());
        snap.put("queryEffectiveEnd", q.queryEffectiveEnd());
        snap.put("pullTaskType", PULL_TASK_TYPE_STATS);
        snap.put("startTime", q.dataWindowStart());
        snap.put("endTime", q.dataWindowEnd());
        snap.put("requireMapping", ctx.requireMapping());
        snap.put("openSuccessOnly", ctx.openSuccessOnly());
        snap.put("incrementalOnly", ctx.incrementalOnly());
        snap.put("swingDirectionFilter", q.directionFilter());
        snap.put("incrementalAfterTime", q.incrementalAfterTime());
        snap.put("debounceSeconds", ctx.debounceSeconds());
        snap.put("manualItems", ctx.manualItems() != null ? ctx.manualItems() : List.of());
        if (ctx.supersedesRunId() != null) {
            snap.put("supersedesRunId", ctx.supersedesRunId());
        }
        if (ctx.truncated()) {
            snap.put("truncated", true);
            snap.put("batchLimit", MERGE_BATCH_LIMIT);
        }
        try {
            return objectMapper.writeValueAsString(snap);
        } catch (Exception e) {
            return "{}";
        }
    }

    private Map<String, Object> parseConfigSnapshot(String json) {
        if (!StringUtils.hasText(json)) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            return Map.of();
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, String>> manualItemsFromSnapshot(Map<String, Object> snap) {
        Object raw = snap.get("manualItems");
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        List<Map<String, String>> out = new ArrayList<>();
        for (Object o : list) {
            if (o instanceof Map<?, ?> m) {
                Map<String, String> row = new LinkedHashMap<>();
                m.forEach((k, v) -> row.put(String.valueOf(k), v == null ? null : String.valueOf(v)));
                out.add(row);
            }
        }
        return out;
    }
}
