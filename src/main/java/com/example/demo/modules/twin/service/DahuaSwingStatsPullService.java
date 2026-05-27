package com.example.demo.modules.twin.service;

import com.alibaba.fastjson2.JSON;
import com.example.demo.modules.accessfusion.service.AccessCleanChannelScopeService;
import com.example.demo.modules.accessfusion.service.AccessRawEventIngestService;
import com.example.demo.modules.accessfusion.service.AccessStatsPullAutoCleanService;
import com.example.demo.modules.dahua.service.DahuaOpenApiService;
import com.example.demo.modules.twin.entity.DahuaSwingRecord;
import com.example.demo.modules.twin.entity.DahuaSwingStatsPullTask;
import com.example.demo.modules.twin.entity.TwinCardMapping;
import com.example.demo.modules.twin.mapper.DahuaSwingMapper;
import com.example.demo.modules.twin.mapper.DahuaSwingStatsPullMapper;
import com.example.demo.modules.twin.support.DahuaSwingDepartmentSupport;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 统计/审计用门禁批量拉取：数据时间策略（periodMode）+ 大华筛选，不走 twin 即时联动。
 */
@Service
public class DahuaSwingStatsPullService {

    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final int INTERNAL_PAGE_SIZE = 200;
    private static final int DEFAULT_BACKFILL_CHUNK_DAYS = 7;
    /** 自定义一次性拉取允许的最大自然日跨度，避免大华接口 Read timed out */
    private static final int MAX_MANUAL_RANGE_DAYS = 31;
    /** 强制全量回溯单轮最多分段数（与 backfillChunkDays 相乘为覆盖的自然日跨度上限） */
    private static final int MAX_FORCE_BACKFILL_SEGMENTS = 200;

    private final DahuaSwingStatsPullMapper statsPullMapper;
    private final DahuaSwingMapper dahuaSwingMapper;
    private final DahuaOpenApiService dahuaOpenApiService;
    private final TwinCardMappingService twinCardMappingService;
    private final AccessRawEventIngestService accessRawEventIngestService;
    private final DahuaSwingDepartmentSupport departmentSupport;
    private final AccessStatsPullAutoCleanService statsPullAutoCleanService;
    private final AccessCleanChannelScopeService channelScopeService;

    public DahuaSwingStatsPullService(
            DahuaSwingStatsPullMapper statsPullMapper,
            DahuaSwingMapper dahuaSwingMapper,
            DahuaOpenApiService dahuaOpenApiService,
            TwinCardMappingService twinCardMappingService,
            AccessRawEventIngestService accessRawEventIngestService,
            DahuaSwingDepartmentSupport departmentSupport,
            AccessStatsPullAutoCleanService statsPullAutoCleanService,
            AccessCleanChannelScopeService channelScopeService) {
        this.statsPullMapper = statsPullMapper;
        this.dahuaSwingMapper = dahuaSwingMapper;
        this.dahuaOpenApiService = dahuaOpenApiService;
        this.twinCardMappingService = twinCardMappingService;
        this.accessRawEventIngestService = accessRawEventIngestService;
        this.departmentSupport = departmentSupport;
        this.statsPullAutoCleanService = statsPullAutoCleanService;
        this.channelScopeService = channelScopeService;
    }

    public List<DahuaSwingStatsPullTask> listTasks() {
        List<DahuaSwingStatsPullTask> tasks = statsPullMapper.listTasks();
        for (DahuaSwingStatsPullTask task : tasks) {
            enrichTaskListMetrics(task);
        }
        return tasks;
    }

    /** 列表展示：回溯累计条数 + 记录库实际条数（避免 lastSavedCount 仅反映上一小段） */
    private void enrichTaskListMetrics(DahuaSwingStatsPullTask task) {
        if (task == null || task.getId() == null || task.getId() <= 0) {
            return;
        }
        try {
            Map<String, Object> query = parseQuery(task.getQueryJson());
            task.setBackfillTotalSaved(intValue(query.get("backfillTotalSaved"), 0));
        } catch (Exception ignored) {
            task.setBackfillTotalSaved(0);
        }
        try {
            task.setLibraryRecordCount(dahuaSwingMapper.countStatsRecordsByTaskId(task.getId()));
        } catch (Exception ignored) {
            task.setLibraryRecordCount(null);
        }
    }

    public DahuaSwingStatsPullTask getTask(Long id) {
        return statsPullMapper.findById(id);
    }

    @Transactional(rollbackFor = Exception.class)
    public DahuaSwingStatsPullTask createTask(DahuaSwingStatsPullTask task) {
        if (task.getEnabled() == null) {
            task.setEnabled(1);
        }
        normalizePeriodFields(task);
        validateFilterQuery(task.getQueryJson());
        validatePeriodConfig(task);
        statsPullMapper.insert(task);
        if (task.getId() != null && task.getId() > 0) {
            channelScopeService.syncScopeFromTaskQuery(task.getId(), task.getQueryJson());
        }
        return task;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean updateTask(DahuaSwingStatsPullTask task) {
        normalizePeriodFields(task);
        validateFilterQuery(task.getQueryJson());
        validatePeriodConfig(task);
        boolean ok = statsPullMapper.update(task) > 0;
        if (ok && task.getId() != null && task.getId() > 0) {
            channelScopeService.syncScopeFromTaskQuery(task.getId(), task.getQueryJson());
        }
        return ok;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean deleteTask(Long id) {
        return statsPullMapper.delete(id) > 0;
    }

    /**
     * 按数据时间策略执行定时拉取：仅匹配 {@code periodMode} 的已启用任务；回溯永不参与。
     *
     * @param periodMode PREVIOUS_DAY | PREVIOUS_WEEK | SINCE_LAST
     */
    public Map<String, Object> executeScheduledForPeriodMode(String periodMode) {
        String mode =
                periodMode == null || periodMode.isBlank()
                        ? "PREVIOUS_DAY"
                        : periodMode.trim().toUpperCase();
        if ("HISTORICAL_RANGE".equals(mode)) {
            throw new IllegalArgumentException("历史回溯仅支持在审计拉取页手动执行");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("periodMode", mode);
        int ok = 0;
        int fail = 0;
        int skipped = 0;
        int autoCleanOk = 0;
        int autoCleanSkipped = 0;
        int autoCleanFail = 0;
        List<Map<String, Object>> failDetails = new ArrayList<>();
        List<Map<String, Object>> taskResults = new ArrayList<>();
        for (DahuaSwingStatsPullTask task : statsPullMapper.listEnabledTasks()) {
            try {
                if ("HISTORICAL_RANGE".equalsIgnoreCase(periodModeOf(task))) {
                    skipped++;
                    continue;
                }
                if (!mode.equals(periodModeOf(task))) {
                    skipped++;
                    continue;
                }
                if (isHistoricalBackfillComplete(task)) {
                    skipped++;
                    continue;
                }
                Map<String, Object> one = pullOnce(task, null, null);
                ok++;
                Map<String, Object> tr = new LinkedHashMap<>();
                tr.put("taskId", task.getId());
                tr.put("taskName", task.getName());
                tr.put("saved", one.get("saved"));
                tr.put("autoCleanTriggered", one.get("autoCleanTriggered"));
                tr.put("autoCleanSkippedReason", one.get("autoCleanSkippedReason"));
                tr.put("autoCleanError", one.get("autoCleanError"));
                tr.put("cleanIncludedTotal", one.get("cleanIncludedTotal"));
                taskResults.add(tr);
                if (Boolean.TRUE.equals(one.get("autoCleanTriggered"))) {
                    autoCleanOk++;
                } else if (one.get("autoCleanError") != null) {
                    autoCleanFail++;
                } else {
                    autoCleanSkipped++;
                }
            } catch (Exception e) {
                fail++;
                Map<String, Object> detail = new HashMap<>();
                detail.put("taskId", task.getId());
                detail.put("taskName", task.getName());
                detail.put("reason", simplifyError(e));
                failDetails.add(detail);
            }
        }
        out.put("ok", ok);
        out.put("fail", fail);
        out.put("skipped", skipped);
        out.put("failDetails", failDetails);
        out.put("taskResults", taskResults);
        out.put("autoCleanOk", autoCleanOk);
        out.put("autoCleanSkipped", autoCleanSkipped);
        out.put("autoCleanFail", autoCleanFail);
        return out;
    }

    /** @deprecated 请使用 {@link #executeScheduledForPeriodMode(String)}；兼容旧入口，仅执行昨日日批 */
    @Deprecated
    public Map<String, Object> executeAllWithinPlan() {
        return executeScheduledForPeriodMode("PREVIOUS_DAY");
    }

    public Map<String, Object> executeTaskNow(
            Long taskId, String overrideStart, String overrideEnd, boolean forceOverwrite) {
        DahuaSwingStatsPullTask task = statsPullMapper.findById(taskId);
        if (task == null) {
            throw new IllegalArgumentException("统计拉取任务不存在");
        }
        if (forceOverwrite) {
            if (isManualOverride(overrideStart, overrideEnd)) {
                return pullOnce(task, overrideStart, overrideEnd);
            }
            if ("HISTORICAL_RANGE".equalsIgnoreCase(periodModeOf(task))) {
                return executeHistoricalForceOverwrite(task);
            }
        }
        return pullOnce(task, overrideStart, overrideEnd);
    }

    /**
     * 强制按回溯总范围 [historyStart, historyEnd] 分段重拉：不读 backfillCursor / backfillDone，
     * 每段用显式时间窗 upsert 覆盖同 recordId，用于补漏或规则变更后全量重拉。
     */
    private Map<String, Object> executeHistoricalForceOverwrite(DahuaSwingStatsPullTask task) {
        Map<String, Object> query = parseQuery(task.getQueryJson());
        LocalDateTime historyStart = parseDateTime(str(query.get("historyStart")));
        LocalDateTime historyEnd = parseDateTime(str(query.get("historyEnd")));
        if (historyStart == null || historyEnd == null) {
            throw new IllegalArgumentException("历史回溯须配置 historyStart、historyEnd 并保存任务");
        }
        if (!historyStart.isBefore(historyEnd)) {
            throw new IllegalArgumentException("历史回溯结束时间须晚于开始时间");
        }

        query.remove("backfillDone");
        statsPullMapper.updateQueryJson(task.getId(), JSON.toJSONString(query));

        int chunkDays = intValue(query.get("backfillChunkDays"), DEFAULT_BACKFILL_CHUNK_DAYS);
        if (chunkDays < 1) {
            chunkDays = DEFAULT_BACKFILL_CHUNK_DAYS;
        }

        LocalDateTime cursor = historyStart;
        int totalSaved = 0;
        int segments = 0;
        int segmentsNoData = 0;
        int rawReconciledTotal = 0;
        String lastApiStart = null;
        String lastApiEnd = null;

        while (cursor.isBefore(historyEnd) && segments < MAX_FORCE_BACKFILL_SEGMENTS) {
            LocalDateTime chunkEnd = cursor.plusDays(chunkDays);
            if (chunkEnd.isAfter(historyEnd)) {
                chunkEnd = historyEnd;
            }
            Map<String, Object> seg = pullOnce(task, fmt(cursor), fmt(chunkEnd));
            int saved = intValue(seg.get("saved"), 0);
            totalSaved += saved;
            rawReconciledTotal += intValue(seg.get("rawReconciled"), 0);
            if (saved == 0) {
                segmentsNoData++;
            }
            segments++;
            lastApiStart = str(seg.get("apiStartSwingTime"));
            lastApiEnd = str(seg.get("apiEndSwingTime"));
            cursor = chunkEnd;
        }

        if (segments >= MAX_FORCE_BACKFILL_SEGMENTS && cursor.isBefore(historyEnd)) {
            throw new IllegalArgumentException(
                    "强制拉取已达单轮分段上限 "
                            + MAX_FORCE_BACKFILL_SEGMENTS
                            + "，请缩小回溯范围或增大每段天数后重试");
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("saved", totalSaved);
        out.put("rawReconciled", rawReconciledTotal);
        out.put("pulledStartTime", fmt(historyStart));
        out.put("pulledEndTime", fmt(historyEnd));
        out.put("apiStartSwingTime", lastApiStart);
        out.put("apiEndSwingTime", lastApiEnd);
        out.put("periodMode", task.getPeriodMode());
        out.put("effectivePeriodMode", "FORCE_OVERWRITE");
        out.put("usedManualOverride", true);
        out.put("forceOverwrite", true);
        out.put("forceSegments", segments);
        out.put("forceSegmentsNoData", segmentsNoData);
        out.put(
                "forceNote",
                "已按回溯总范围强制分段重拉（不推进游标）；同 recordId 以 upsert 覆盖。若仍缺日请检查大华筛选或通道条件。");
        out.put("backfillComplete", false);
        return out;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> pullOnce(DahuaSwingStatsPullTask task, String overrideStart, String overrideEnd) {
        boolean usedManualOverride = isManualOverride(overrideStart, overrideEnd);
        LocalDateTime runAt = LocalDateTime.now();
        String runAtText = fmt(runAt);
        try {
            Map<String, Object> query = parseQuery(task.getQueryJson());
            if (usedManualOverride) {
                validateManualOverrideRange(overrideStart, overrideEnd);
            }
            LocalDateTime[] window = resolvePeriodWindow(task, query, overrideStart, overrideEnd);
            LocalDateTime start = window[0];
            LocalDateTime end = window[1];
            if (!start.isBefore(end)) {
                throw new IllegalArgumentException("拉取开始时间必须早于结束时间");
            }

            String effectiveMode = usedManualOverride ? "MANUAL" : periodModeOf(task);

            stripNonApiFields(query);
            query.put("pageSize", INTERNAL_PAGE_SIZE);
            query.put("pageNum", 1);
            DahuaOpenApiService.applySwingRecordTimeRange(query, start, end);
            validateRequiredQueryFields(query);

            int page = 1;
            int totalSaved = 0;
            int firstPageRows = 0;
            while (true) {
                query.put("pageNum", page);
                Map<String, Object> resp = dahuaOpenApiService.fetchSwingCardRecordByConditionCombined(query);
                Map<String, Object> data = castMap(resp.get("data"));
                List<Map<String, Object>> rows = castList(data.get("pageData"));
                if (page == 1) {
                    firstPageRows = rows.size();
                }
                if (rows.isEmpty()) {
                    break;
                }
                for (Map<String, Object> row : rows) {
                    DahuaSwingRecord record = toRecord(task.getId(), row);
                    enrichMapping(record);
                    departmentSupport.applyToRecord(record, row);
                    dahuaSwingMapper.upsertRecord(record);
                    accessRawEventIngestService.ingestFromSwing(record, "STATS_PULL");
                    totalSaved++;
                }
                if (rows.size() < INTERNAL_PAGE_SIZE) {
                    break;
                }
                page++;
            }

            statsPullMapper.updateRunState(
                    task.getId(), fmt(start), fmt(end), "SUCCESS", null, runAtText, totalSaved);

            // 幂等补全一级库：与拉取同事务窗内 twin 记录对齐 access_raw_event，供清洗/审计直接使用
            int rawReconciled =
                    accessRawEventIngestService.backfillFromSwingTable(
                            fmt(start), fmt(end), 500, "STATS_PULL");

            // 仅「历史回溯」按策略分段执行时推进 cursor；本段 0 条不推进，避免误跳过整段
            if ("HISTORICAL_RANGE".equalsIgnoreCase(periodModeOf(task)) && !usedManualOverride) {
                Map<String, Object> taskQuery = parseQuery(task.getQueryJson());
                LocalDateTime historyEnd = parseDateTime(str(taskQuery.get("historyEnd")));
                if (totalSaved > 0) {
                    persistBackfillCursor(
                            task.getId(), task.getQueryJson(), fmt(end), historyEnd, totalSaved);
                }
            }

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("saved", totalSaved);
            out.put("rawReconciled", rawReconciled);
            try {
                Map<String, Object> cleanSummary =
                        statsPullAutoCleanService.afterStatsPullSuccess(task, fmt(start), fmt(end));
                out.putAll(cleanSummary);
            } catch (Exception cleanEx) {
                out.put("autoCleanTriggered", false);
                out.put("autoCleanError", simplifyError(cleanEx));
            }
            out.put("pulledStartTime", fmt(start));
            out.put("pulledEndTime", fmt(end));
            out.put("apiStartSwingTime", str(query.get("startSwingTime")));
            out.put("apiEndSwingTime", str(query.get("endSwingTime")));
            out.put("dahuaFirstPageRows", firstPageRows);
            out.put("periodMode", task.getPeriodMode());
            out.put("effectivePeriodMode", effectiveMode);
            out.put("usedManualOverride", usedManualOverride);
            out.put("lastRunAt", runAtText);
            if ("HISTORICAL_RANGE".equalsIgnoreCase(periodModeOf(task))) {
                DahuaSwingStatsPullTask refreshed = statsPullMapper.findById(task.getId());
                Map<String, Object> refreshedQuery =
                        parseQuery(refreshed != null ? refreshed.getQueryJson() : "{}");
                out.put("backfillCursor", str(refreshedQuery.get("backfillCursor")));
                out.put("backfillTotalSaved", intValue(refreshedQuery.get("backfillTotalSaved"), 0));
                if (!usedManualOverride) {
                    out.put("backfillComplete", refreshed != null && isHistoricalBackfillComplete(refreshed));
                    if (totalSaved == 0) {
                        out.put(
                                "backfillHint",
                                buildEmptySegmentHint(query, firstPageRows));
                    }
                } else {
                    out.put("backfillComplete", false);
                    out.put("manualOverrideNote", "自定义拉取不更新历史回溯进度，请用「执行下一段回溯」");
                }
            }
            return out;
        } catch (Exception e) {
            statsPullMapper.updateRunState(task.getId(), null, null, "FAILED", simplifyError(e), runAtText, 0);
            throw e;
        }
    }

    private static boolean isManualOverride(String overrideStart, String overrideEnd) {
        return overrideStart != null
                && !overrideStart.isBlank()
                && overrideEnd != null
                && !overrideEnd.isBlank();
    }

    private static void validateManualOverrideRange(String overrideStart, String overrideEnd) {
        LocalDateTime s = parseDateTime(overrideStart);
        LocalDateTime e = parseDateTime(overrideEnd);
        if (s == null || e == null) {
            throw new IllegalArgumentException("手动时间窗格式无效，需 yyyy-MM-dd HH:mm:ss");
        }
        long days = ChronoUnit.DAYS.between(s.toLocalDate(), e.toLocalDate()) + 1;
        if (days > MAX_MANUAL_RANGE_DAYS) {
            throw new IllegalArgumentException(
                    "自定义时间窗跨度 " + days + " 天超过上限 " + MAX_MANUAL_RANGE_DAYS
                            + " 天，请缩短范围或使用「历史回溯」+「执行下一段」");
        }
    }

    private LocalDateTime[] resolvePeriodWindow(
            DahuaSwingStatsPullTask task,
            Map<String, Object> query,
            String overrideStart,
            String overrideEnd) {
        if (isManualOverride(overrideStart, overrideEnd)) {
            LocalDateTime s = parseDateTime(overrideStart);
            LocalDateTime e = parseDateTime(overrideEnd);
            return new LocalDateTime[] {s, e};
        }

        String mode = periodModeOf(task);
        LocalTime dataFrom = parseTimeOrDefault(str(query.get("dataFromTime")), LocalTime.MIDNIGHT);
        LocalTime dataTo = parseTimeOrDefault(str(query.get("dataToTime")), LocalTime.of(23, 59, 59));

        return switch (mode) {
            case "PREVIOUS_DAY" -> previousCalendarDayWindow(dataFrom, dataTo);
            case "PREVIOUS_WEEK" -> previousCalendarWeekWindow(dataFrom, dataTo);
            case "HISTORICAL_RANGE" -> historicalChunkWindow(query);
            case "SINCE_LAST" -> sinceLastWatermark(task);
            default -> sinceLastWatermark(task);
        };
    }

    private static LocalDateTime[] previousCalendarDayWindow(LocalTime dataFrom, LocalTime dataTo) {
        LocalDate day = LocalDate.now().minusDays(1);
        LocalDateTime start = day.atTime(dataFrom);
        LocalDateTime end = day.atTime(dataTo);
        if (!end.isAfter(start)) {
            end = day.atTime(LocalTime.of(23, 59, 59));
        }
        return new LocalDateTime[] {start, end};
    }

    private static LocalDateTime[] previousCalendarWeekWindow(LocalTime dataFrom, LocalTime dataTo) {
        LocalDate monday =
                LocalDate.now().minusWeeks(1).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate sunday = monday.plusDays(6);
        LocalDateTime start = monday.atTime(dataFrom);
        LocalDateTime end = sunday.atTime(dataTo);
        if (!end.isAfter(start)) {
            end = sunday.atTime(LocalTime.of(23, 59, 59));
        }
        return new LocalDateTime[] {start, end};
    }

    private static LocalDateTime[] historicalChunkWindow(Map<String, Object> query) {
        LocalDateTime historyStart = parseDateTime(str(query.get("historyStart")));
        LocalDateTime historyEnd = parseDateTime(str(query.get("historyEnd")));
        if (historyStart == null || historyEnd == null) {
            throw new IllegalArgumentException("历史回溯模式须配置 historyStart 与 historyEnd，请先保存任务");
        }
        if (!historyStart.isBefore(historyEnd)) {
            throw new IllegalArgumentException("历史回溯结束时间须晚于开始时间");
        }

        String cursorText = str(query.get("backfillCursor"));
        LocalDateTime cursor = cursorText.isBlank() ? historyStart : parseDateTime(cursorText);
        if (cursor == null) {
            cursor = historyStart;
        }
        if (!cursor.isBefore(historyEnd)) {
            throw new IllegalArgumentException("历史回溯已完成，请将数据时间策略切换为「昨日日批」或「水位增量」");
        }

        int chunkDays = intValue(query.get("backfillChunkDays"), DEFAULT_BACKFILL_CHUNK_DAYS);
        if (chunkDays < 1) {
            chunkDays = DEFAULT_BACKFILL_CHUNK_DAYS;
        }
        LocalDateTime chunkEnd = cursor.plusDays(chunkDays);
        if (chunkEnd.isAfter(historyEnd)) {
            chunkEnd = historyEnd;
        }
        return new LocalDateTime[] {cursor, chunkEnd};
    }

    private static LocalDateTime[] sinceLastWatermark(DahuaSwingStatsPullTask task) {
        LocalDateTime end = LocalDateTime.now();
        if (task.getLastPulledEnd() != null && !task.getLastPulledEnd().isBlank()) {
            LocalDateTime start = parseDateTime(task.getLastPulledEnd());
            if (start != null && start.isBefore(end)) {
                return new LocalDateTime[] {start, end};
            }
        }
        return new LocalDateTime[] {end.minusHours(24), end};
    }

    private boolean isHistoricalBackfillComplete(DahuaSwingStatsPullTask task) {
        if (!"HISTORICAL_RANGE".equalsIgnoreCase(periodModeOf(task))) {
            return false;
        }
        Map<String, Object> query = parseQuery(task.getQueryJson());
        Object done = query.get("backfillDone");
        if (Boolean.TRUE.equals(done) || "true".equalsIgnoreCase(String.valueOf(done))) {
            return true;
        }
        LocalDateTime historyEnd = parseDateTime(str(query.get("historyEnd")));
        if (historyEnd == null) {
            return false;
        }
        String cursorText = str(query.get("backfillCursor"));
        if (cursorText.isBlank()) {
            return false;
        }
        LocalDateTime cursor = parseDateTime(cursorText);
        return cursor != null && !cursor.isBefore(historyEnd);
    }

    private void persistBackfillCursor(
            Long taskId,
            String queryJson,
            String cursorEnd,
            LocalDateTime historyEnd,
            int segmentSaved) {
        Map<String, Object> query = parseQuery(queryJson);
        query.put("backfillCursor", cursorEnd);
        int prev = intValue(query.get("backfillTotalSaved"), 0);
        if (segmentSaved > 0) {
            query.put("backfillTotalSaved", prev + segmentSaved);
        }
        LocalDateTime cursor = parseDateTime(cursorEnd);
        if (historyEnd != null && cursor != null && !cursor.isBefore(historyEnd)) {
            query.put("backfillDone", true);
        } else {
            query.remove("backfillDone");
        }
        statsPullMapper.updateQueryJson(taskId, JSON.toJSONString(query));
    }

    private static void normalizePeriodFields(DahuaSwingStatsPullTask task) {
        if (task.getPeriodMode() == null || task.getPeriodMode().isBlank()) {
            task.setPeriodMode("SINCE_LAST");
        }
        task.setPeriodMode(task.getPeriodMode().trim().toUpperCase());
        if (task.getPeriodDays() == null || task.getPeriodDays() < 1) {
            task.setPeriodDays(1);
        }
    }

    private void validatePeriodConfig(DahuaSwingStatsPullTask task) {
        String mode = periodModeOf(task);
        Map<String, Object> query = parseQuery(task.getQueryJson());
        switch (mode) {
            case "HISTORICAL_RANGE" -> {
                if (parseDateTime(str(query.get("historyStart"))) == null
                        || parseDateTime(str(query.get("historyEnd"))) == null) {
                    throw new IllegalArgumentException("历史回溯须填写 historyStart、historyEnd");
                }
            }
            case "PREVIOUS_DAY", "PREVIOUS_WEEK", "SINCE_LAST" -> {
                // optional dataFromTime / dataToTime
            }
            default -> throw new IllegalArgumentException("不支持的 periodMode: " + mode);
        }
    }

    private static String periodModeOf(DahuaSwingStatsPullTask task) {
        if (task.getPeriodMode() == null || task.getPeriodMode().isBlank()) {
            return "SINCE_LAST";
        }
        return task.getPeriodMode().trim().toUpperCase();
    }

    private static String buildEmptySegmentHint(Map<String, Object> apiQuery, int firstPageRows) {
        StringBuilder sb = new StringBuilder();
        sb.append("本段大华 pageData 为空（首页 ").append(firstPageRows).append(" 条），回溯进度未推进。");
        sb.append(" 实际请求刷卡窗：")
                .append(str(apiQuery.get("startSwingTime")))
                .append(" ~ ")
                .append(str(apiQuery.get("endSwingTime")));
        sb.append("（与界面分段上界可能差 1 天：上界 00:00 会换算为前一日 23:59:59）。");
        if (!str(apiQuery.get("deptIds")).isBlank()) {
            sb.append(" 已带部门 deptIds=").append(str(apiQuery.get("deptIds"))).append("，可试「全部部门」。");
        }
        if (apiQuery.get("channelCodes") instanceof List<?> ch && !ch.isEmpty()) {
            sb.append(" 已带 channelCodes ").append(ch.size()).append(" 个，请确认形如 1000449$7$0$0。");
        }
        sb.append(" 若仍无数据，请在大华平台同条件核对是否有刷卡记录。");
        return sb.toString();
    }

    private static void stripNonApiFields(Map<String, Object> query) {
        query.remove("execWeekDays");
        query.remove("execStartTime");
        query.remove("execEndTime");
        query.remove("dataFromTime");
        query.remove("dataToTime");
        query.remove("historyStart");
        query.remove("historyEnd");
        query.remove("backfillChunkDays");
        query.remove("backfillCursor");
        query.remove("backfillDone");
        query.remove("pageSize");
        query.remove("queryWindowMinutes");
        query.remove("futureOffsetMinutes");
    }

    private void validateFilterQuery(String queryJson) {
        if (queryJson == null || queryJson.isBlank()) {
            throw new IllegalArgumentException("queryJson 不能为空");
        }
        Map<String, Object> query = parseQuery(queryJson);
        boolean any =
                !str(query.get("personName")).isBlank()
                        || !str(query.get("personCode")).isBlank()
                        || !str(query.get("deptIds")).isBlank()
                        || !str(query.get("cardNumber")).isBlank()
                        || query.get("openType") != null
                        || query.get("enterOrExit") != null
                        || query.get("openResult") != null
                        || (query.get("channelCodes") instanceof List<?> l && !l.isEmpty());
        if (!any) {
            throw new IllegalArgumentException("至少配置一个筛选条件（通道/部门/人员/卡号/开门类型等）");
        }
    }

    private void validateRequiredQueryFields(Map<String, Object> query) {
        if (str(query.get("startSwingTime")).isBlank() || str(query.get("endSwingTime")).isBlank()) {
            throw new IllegalArgumentException("拉取时间窗不能为空");
        }
    }

    private DahuaSwingRecord toRecord(Long taskId, Map<String, Object> row) {
        DahuaSwingRecord r = new DahuaSwingRecord();
        r.setTaskId(taskId);
        r.setPullTaskType("STATS");
        r.setRecordId(str(row.get("id")));
        r.setCardNumber(str(row.get("cardNumber")));
        r.setCardStatus(intvObj(row.get("cardStatus")));
        r.setChannelCode(str(row.get("channelCode")));
        r.setChannelName(str(row.get("channelName")));
        r.setOpenType(intvObj(row.get("openType")));
        r.setPersonCode(str(row.get("personCode")));
        r.setPersonId(longvObj(row.get("personId")));
        r.setPersonName(str(row.get("personName")));
        r.setSwingTime(str(row.get("swingTime")));
        r.setCreateTime(str(row.get("createTime")));
        r.setOpenResult(intvObj(row.get("openResult")));
        r.setEnterOrExit(intvObj(row.get("enterOrExit")));
        r.setRawJson(JSON.toJSONString(row));
        com.example.demo.modules.twin.support.DahuaSwingEnterExitSupport.applyResolved(r);
        return r;
    }

    private void enrichMapping(DahuaSwingRecord r) {
        TwinCardMapping mapping = null;
        if (!str(r.getPersonCode()).isBlank()) {
            mapping = twinCardMappingService.getByDahuaPersonCode(r.getPersonCode());
        }
        if (mapping == null && !str(r.getCardNumber()).isBlank()) {
            mapping = twinCardMappingService.getByCardNo(r.getCardNumber());
        }
        if (mapping == null) {
            r.setMappingHit(0);
            return;
        }
        r.setMappingHit(1);
        r.setMappingUserId(mapping.getAroUserId());
        r.setMappingCardNo(mapping.getCardNo());
        r.setFreezeExemptFlag(mapping.getFreezeExemptFlag());
    }

    static boolean withinExecutionPlan(Map<String, Object> query, LocalDateTime now) {
        List<Integer> days = intList(query.get("execWeekDays"));
        if (!days.isEmpty() && !days.contains(now.getDayOfWeek().getValue())) {
            return false;
        }
        LocalTime start = parseTimeOrDefault(str(query.get("execStartTime")), LocalTime.of(2, 0, 0));
        LocalTime end = parseTimeOrDefault(str(query.get("execEndTime")), LocalTime.of(6, 0, 0));
        LocalTime t = now.toLocalTime();
        if (start.equals(end)) {
            return true;
        }
        if (end.isAfter(start)) {
            return !t.isBefore(start) && !t.isAfter(end);
        }
        return !t.isBefore(start) || !t.isAfter(end);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> parseQuery(String json) {
        if (json == null || json.isBlank()) {
            return new HashMap<>();
        }
        Map<String, Object> q = JSON.parseObject(json, Map.class);
        return q != null ? q : new HashMap<>();
    }

    private static String simplifyError(Throwable throwable) {
        Throwable cur = throwable;
        while (cur.getCause() != null) {
            cur = cur.getCause();
        }
        String msg = cur.getMessage();
        if (msg == null || msg.isBlank()) {
            msg = throwable.getMessage();
        }
        return msg == null || msg.isBlank() ? "未知错误" : (msg.length() > 500 ? msg.substring(0, 500) : msg);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> castMap(Object o) {
        if (o instanceof Map<?, ?> m) {
            return (Map<String, Object>) m;
        }
        return new HashMap<>();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> castList(Object o) {
        if (!(o instanceof List<?> l)) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object item : l) {
            if (item instanceof Map<?, ?> m) {
                out.add((Map<String, Object>) m);
            }
        }
        return out;
    }

    private static String str(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    private static int intValue(Object v, int def) {
        if (v == null) {
            return def;
        }
        if (v instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(v));
        } catch (Exception e) {
            return def;
        }
    }

    private static Integer intvObj(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(v));
        } catch (Exception e) {
            return null;
        }
    }

    private static Long longvObj(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(v));
        } catch (Exception e) {
            return null;
        }
    }

    private static LocalDateTime parseDateTime(String v) {
        if (v == null || v.isBlank()) {
            return null;
        }
        String s = v.trim();
        try {
            if (s.length() == 10) {
                return LocalDate.parse(s).atStartOfDay();
            }
            if (s.contains("T")) {
                s = s.replace('T', ' ');
            }
            if (s.length() == 16) {
                s = s + ":00";
            }
            return LocalDateTime.parse(s, DT);
        } catch (Exception e) {
            return null;
        }
    }

    private static String fmt(LocalDateTime t) {
        return t == null ? null : t.format(DT);
    }

    private static LocalTime parseTimeOrDefault(String text, LocalTime def) {
        if (text == null || text.isBlank()) {
            return def;
        }
        String s = text.trim();
        try {
            if (s.length() == 5) {
                return LocalTime.parse(s + ":00");
            }
            return LocalTime.parse(s);
        } catch (Exception e) {
            return def;
        }
    }

    @SuppressWarnings("unchecked")
    private static List<Integer> intList(Object o) {
        if (!(o instanceof List<?> l)) {
            return List.of();
        }
        List<Integer> out = new ArrayList<>();
        for (Object item : l) {
            if (item instanceof Number n) {
                out.add(n.intValue());
            } else {
                try {
                    out.add(Integer.parseInt(String.valueOf(item)));
                } catch (Exception ignore) {
                    // skip
                }
            }
        }
        return out;
    }
}
