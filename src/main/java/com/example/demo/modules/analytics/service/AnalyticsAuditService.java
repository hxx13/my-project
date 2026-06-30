package com.example.demo.modules.analytics.service;

import com.example.demo.modules.accessfusion.service.AccessAudienceConstants;
import com.example.demo.modules.accessfusion.service.AccessSwingCleanWorkspaceService;
import com.example.demo.modules.analytics.dto.AnalyticsAuditLogDto;
import com.example.demo.modules.analytics.entity.AnalyticsAuditLog;
import com.example.demo.modules.analytics.entity.AnalyticsUserView;
import com.example.demo.modules.analytics.mapper.AnalyticsAuditLogMapper;
import com.example.demo.modules.analytics.mapper.AnalyticsUserViewMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.time.temporal.WeekFields;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AnalyticsAuditService {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsAuditService.class);
    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter MONTH_FMT = DateTimeFormatter.ofPattern("yyyy-MM");
    private static final WeekFields ISO_WEEK = WeekFields.ISO;
    private static final int MAX_BACKFILL_DAYS = 366;
    private static final int MAX_BACKFILL_WEEKS = 104;
    private static final int MAX_BACKFILL_MONTHS = 36;

    private final AnalyticsUserViewMapper userViewMapper;
    private final AnalyticsAuditLogMapper auditLogMapper;
    private final IsolationUsageReportService isolationUsageReportService;
    private final CageOccupancyReportService cageOccupancyReportService;
    private final AnalyticsCageAuditProgressService cageAuditProgressService;
    private final AccessSwingCleanWorkspaceService workspaceService;
    private final ObjectMapper objectMapper;

    public AnalyticsAuditService(
            AnalyticsUserViewMapper userViewMapper,
            AnalyticsAuditLogMapper auditLogMapper,
            IsolationUsageReportService isolationUsageReportService,
            CageOccupancyReportService cageOccupancyReportService,
            AnalyticsCageAuditProgressService cageAuditProgressService,
            AccessSwingCleanWorkspaceService workspaceService,
            ObjectMapper objectMapper) {
        this.userViewMapper = userViewMapper;
        this.auditLogMapper = auditLogMapper;
        this.isolationUsageReportService = isolationUsageReportService;
        this.cageOccupancyReportService = cageOccupancyReportService;
        this.cageAuditProgressService = cageAuditProgressService;
        this.workspaceService = workspaceService;
        this.objectMapper = objectMapper;
    }

    public List<AnalyticsAuditLogDto> listForUser(String userId, String reportKey, Long viewId, int limit) {
        int cap = Math.min(Math.max(limit, 1), 200);
        return auditLogMapper.selectByUserAndReport(userId, reportKey, viewId, cap).stream()
                .map(this::toDto)
                .toList();
    }

    public Map<String, Object> getDetailForUser(String userId, long id) {
        AnalyticsAuditLog row = auditLogMapper.selectById(id);
        if (row == null) {
            throw new IllegalArgumentException("记录不存在");
        }
        // Allow access if user owns the log OR the log's view is public
        if (!userId.equals(row.getUserId())) {
            AnalyticsUserView view = userViewMapper.selectById(row.getViewId());
            if (view == null || view.getIsPublic() == null || view.getIsPublic() != 1) {
                throw new IllegalArgumentException("记录不存在");
            }
        }
        Map<String, Object> snap = readSnapshot(row.getTopGroupsJson());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.getId());
        out.put("viewId", row.getViewId());
        out.put("viewName", row.getViewName());
        out.put("periodType", row.getPeriodType());
        out.put("periodLabel", row.getPeriodLabel());
        out.put("currentRounds", row.getCurrentRounds());
        out.put("previousRounds", row.getPreviousRounds());
        out.put("deltaRounds", row.getDeltaRounds());
        out.put("deltaPct", row.getDeltaPct());
        out.put("currentStart", row.getCurrentStart());
        out.put("currentEnd", row.getCurrentEnd());
        out.put("previousStart", row.getPreviousStart());
        out.put("previousEnd", row.getPreviousEnd());
        out.put("fromSnapshot", true);
        if (snap.get("summary") != null) {
            out.put("summary", snap.get("summary"));
        }
        if (snap.get("byProjectGroup") != null) {
            out.put("byProjectGroup", snap.get("byProjectGroup"));
        } else if (snap.get("topGroups") != null) {
            out.put("byProjectGroup", snap.get("topGroups"));
        }
        if (snap.get("byRegion") != null) {
            out.put("byRegion", snap.get("byRegion"));
        } else {
            out.put("byRegion", List.of());
        }
        if (snap.get("byPi") != null) {
            out.put("byPi", snap.get("byPi"));
        } else {
            out.put("byPi", List.of());
        }
        if (snap.get("byRoom") != null) {
            out.put("byRoom", snap.get("byRoom"));
        } else {
            out.put("byRoom", List.of());
        }
        if (snap.get("auxiliaryFlow") != null) {
            out.put("auxiliaryFlow", snap.get("auxiliaryFlow"));
        }
        if (snap.get("queryProvenance") != null) {
            out.put("queryProvenance", snap.get("queryProvenance"));
        }
        return out;
    }

    /**
     * 强制重算：回源清洗 + 历史回溯 + 刷新已有快照 + 写最新周期。
     * 不要求视图已订阅 — 用户主动触发强制重算即应执行。
     */
    public void refreshAllSnapshotsForView(AnalyticsUserView view) {
        if (view == null) {
            return;
        }
        if (isCageReport(view)) {
            runAuditForView(view);
            return;
        }
        List<AnalyticsAuditLog> existing =
                auditLogMapper.selectAllByView(view.getUserId(), view.getId(), 500);
        log.warn(
                "[analytics-audit] force refresh viewId={} existingSnapshots={} subscribed={}",
                view.getId(),
                existing.size(),
                view.getIsSubscribed());

        // Step 1: 回源清洗 — 确保 access_clean_package_item 有数据
        preCleanForForceRecalc(view, existing);

        // Step 2: 找出需要覆盖的日期范围
        LocalDate today = LocalDate.now();
        LocalDate yesterday = today.minusDays(1);
        LocalDate backfillFrom;
        if (!existing.isEmpty()) {
            // 从最早快照日期开始回溯，覆盖所有历史缺失
            LocalDate earliest = findEarliestSnapshotDate(existing);
            backfillFrom = earliest.isBefore(yesterday.minusDays(30))
                    ? yesterday.minusDays(30) : earliest;
        } else {
            // 无已有快照：回溯最近 30 天
            backfillFrom = yesterday.minusDays(30);
        }
        if (backfillFrom.isAfter(yesterday)) {
            backfillFrom = yesterday;
        }

        // Step 3: 历史回溯 — 覆盖从 backfillFrom 到 yesterday 的所有天
        log.warn(
                "[analytics-audit] force refresh viewId={} backfill range=[{} -> {}]",
                view.getId(), backfillFrom, yesterday);
        backfillAuditForView(view, backfillFrom);

        // Step 4: 刷新已有快照中可能未被 backfill 覆盖的周/月周期
        int idx = 0;
        for (AnalyticsAuditLog auditLog : existing) {
            idx++;
            try {
                refreshSnapshotPeriod(view, auditLog, idx, existing.size());
            } catch (Exception e) {
                log.warn(
                        "[analytics-audit] refresh snapshot failed viewId={} {} {}: {}",
                        view.getId(),
                        auditLog.getPeriodType(),
                        auditLog.getPeriodLabel(),
                        e.getMessage());
            }
        }

        // Step 5: 写最新周期（昨天/上周/上月）
        runAuditForView(view);
        log.warn("[analytics-audit] force refresh complete viewId={}", view.getId());
    }

    /** 从已有快照列表中找到最早的日期 */
    private static LocalDate findEarliestSnapshotDate(List<AnalyticsAuditLog> logs) {
        LocalDate earliest = null;
        for (AnalyticsAuditLog log : logs) {
            LocalDate d = parsePeriodDate(log.getPeriodType(), log.getPeriodLabel());
            if (d != null && (earliest == null || d.isBefore(earliest))) {
                earliest = d;
            }
        }
        return earliest != null ? earliest : LocalDate.now().minusDays(1);
    }

    /**
     * 强制重算前置步骤：回源清洗门禁原表数据到清洗库。
     * 从已有快照中提取日期范围，对所有已启用通道执行全量（非增量）合并。
     */
    private void preCleanForForceRecalc(AnalyticsUserView view, List<AnalyticsAuditLog> existing) {
        try {
            // pre-clean 仅覆盖最近 7 天，作为安全网。历史回溯走 backfillAuditForView 查已有清洗库。
            LocalDate rangeEnd = LocalDate.now().minusDays(1);
            LocalDate rangeStart = rangeEnd.minusDays(7);
            String startTime = rangeStart.atStartOfDay().format(DT_FMT);
            String endTime = rangeEnd.atTime(23, 59, 59).format(DT_FMT);
            log.warn(
                    "[analytics-audit] force-recalc pre-clean viewId={} range=[{}, {}]",
                    view.getId(), startTime, endTime);
            Map<String, Object> result = workspaceService.forceMergeAllChannelsForWindow(
                    startTime, endTime, "FORCE_RECALC");
            log.warn(
                    "[analytics-audit] force-recalc pre-clean done viewId={}: ok={} fail={} included={}",
                    view.getId(),
                    result.get("ok"), result.get("fail"), result.get("totalIncluded"));
        } catch (Exception e) {
            log.warn(
                    "[analytics-audit] force-recalc pre-clean failed viewId={}: {}",
                    view.getId(), e.getMessage());
        }
    }

    /** 从快照 periodLabel 解析日期（日/周取周一/月取1日） */
    private static LocalDate parsePeriodDate(String periodType, String periodLabel) {
        if (!StringUtils.hasText(periodLabel)) {
            return null;
        }
        try {
            return switch (periodType) {
                case "day" -> LocalDate.parse(periodLabel, DateTimeFormatter.ISO_LOCAL_DATE);
                case "week" -> {
                    int dash = periodLabel.indexOf("-W");
                    if (dash < 0) yield null;
                    int year = Integer.parseInt(periodLabel.substring(0, dash));
                    int week = Integer.parseInt(periodLabel.substring(dash + 2));
                    yield LocalDate.of(year, 1, 4)
                            .with(WeekFields.ISO.weekBasedYear(), year)
                            .with(WeekFields.ISO.weekOfWeekBasedYear(), week)
                            .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
                }
                case "month" -> LocalDate.parse(periodLabel + "-01");
                default -> null;
            };
        } catch (Exception e) {
            return null;
        }
    }

    private void refreshSnapshotPeriod(
            AnalyticsUserView view, AnalyticsAuditLog auditLog, int cycleIndex, int cycleTotal) {
        if (auditLog == null
                || !StringUtils.hasText(auditLog.getPeriodType())
                || !StringUtils.hasText(auditLog.getPeriodLabel())) {
            return;
        }
        switch (auditLog.getPeriodType()) {
            case "day" -> writeDayPeriod(view, LocalDate.parse(auditLog.getPeriodLabel()), cycleIndex, cycleTotal);
            case "week" -> {
                LocalDate monday = parseWeekMondayFromLabel(auditLog.getPeriodLabel());
                if (monday != null) {
                    writeWeekPeriod(view, monday, cycleIndex, cycleTotal);
                }
            }
            case "month" -> writeMonthPeriod(
                    view, LocalDate.parse(auditLog.getPeriodLabel() + "-01"), cycleIndex, cycleTotal);
            default -> { }
        }
    }

    private static LocalDate parseWeekMondayFromLabel(String periodLabel) {
        if (!StringUtils.hasText(periodLabel)) {
            return null;
        }
        try {
            int dash = periodLabel.indexOf("-W");
            if (dash < 0) {
                return null;
            }
            int year = Integer.parseInt(periodLabel.substring(0, dash));
            int week = Integer.parseInt(periodLabel.substring(dash + 2));
            return LocalDate.of(year, 1, 4)
                    .with(ISO_WEEK.weekBasedYear(), year)
                    .with(ISO_WEEK.weekOfWeekBasedYear(), week)
                    .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        } catch (Exception e) {
            return null;
        }
    }

    public void runAuditForView(AnalyticsUserView view) {
        if (view == null || view.getIsSubscribed() == null || view.getIsSubscribed() != 1) {
            return;
        }
        LocalDate today = LocalDate.now();
        List<String> cycles = auditCyclesFor(view);
        boolean cage = isCageReport(view);
        if (cage) {
            Map<String, Object> filter = readFilter(view.getFilterJson());
            CageAnalyticsFilterParams cageParams = CageAnalyticsFilterParams.fromMap(filter);
            int shelfCount = cageOccupancyReportService.countShelvesInScope(cageParams);
            cageAuditProgressService.start(view.getId(), view.getUserId(), cycles.size(), shelfCount);
        }
        try {
            int cycleIndex = 0;
            int cycleTotal = cycles.size();
            for (String cycle : cycles) {
                cycleIndex++;
                switch (cycle) {
                    case "day" -> writeDayPeriod(view, today.minusDays(1), cycleIndex, cycleTotal);
                    case "week" -> writeWeekPeriod(view, lastCompleteWeekMonday(today), cycleIndex, cycleTotal);
                    case "month" -> writeMonthPeriod(view, lastCompleteMonthStart(today), cycleIndex, cycleTotal);
                    default -> { }
                }
            }
            if (cage) {
                cageAuditProgressService.complete(view.getId());
            }
        } catch (Exception e) {
            if (cage) {
                cageAuditProgressService.fail(view.getId(), e.getMessage());
            }
            throw e;
        }
    }

    /**
     * 从 until（含）向最近已结束周期回填历史清算；已存在 periodLabel 则跳过。
     * 笼架占用统计不支持历史回填（仅按订阅周期落库快照并环比）。
     */
    public void backfillAuditForView(AnalyticsUserView view, LocalDate until) {
        if (view == null) {
            return;
        }
        if (isCageReport(view)) {
            log.warn("[analytics-audit] cage_occupancy skip history backfill viewId={}", view.getId());
            return;
        }
        if (until == null) {
            throw new IllegalArgumentException("回溯截止日不能为空");
        }
        LocalDate today = LocalDate.now();
        LocalDate yesterday = today.minusDays(1);
        if (until.isAfter(yesterday)) {
            throw new IllegalArgumentException("回溯截止日不能晚于昨日");
        }
        for (String cycle : auditCyclesFor(view)) {
            switch (cycle) {
                case "day" -> backfillDays(view, until, yesterday);
                case "week" -> backfillWeeks(view, until, lastCompleteWeekMonday(today));
                case "month" -> backfillMonths(view, until, lastCompleteMonthStart(today));
                default -> { }
            }
        }
    }

    private List<String> auditCyclesFor(AnalyticsUserView view) {
        Map<String, Object> filter = readFilter(view.getFilterJson());
        if (AnalyticsReportRegistry.REPORT_CAGE_OCCUPANCY.equals(view.getReportKey())) {
            return CageAnalyticsFilterParams.fromMap(filter).auditCycles();
        }
        return AnalyticsFilterParams.fromMap(filter).auditCycles();
    }

    private static boolean isCageReport(AnalyticsUserView view) {
        return view != null && AnalyticsReportRegistry.REPORT_CAGE_OCCUPANCY.equals(view.getReportKey());
    }

    public LocalDate parseBackfillUntil(String raw) {
        if (!StringUtils.hasText(raw)) {
            throw new IllegalArgumentException("请指定回溯截止日");
        }
        try {
            return LocalDate.parse(raw.trim(), DateTimeFormatter.ISO_LOCAL_DATE);
        } catch (Exception e) {
            throw new IllegalArgumentException("回溯截止日格式无效，请使用 yyyy-MM-dd");
        }
    }

    private void backfillDays(AnalyticsUserView view, LocalDate until, LocalDate endDay) {
        LocalDate start = until;
        long span = ChronoUnit.DAYS.between(start, endDay) + 1;
        if (span > MAX_BACKFILL_DAYS) {
            start = endDay.minusDays(MAX_BACKFILL_DAYS - 1L);
            log.warn("[analytics-audit] viewId={} day backfill capped to {} days", view.getId(), MAX_BACKFILL_DAYS);
        }
        int zeroDays = 0;
        int totalDays = 0;
        long lastLog = System.currentTimeMillis();
        for (LocalDate d = start; !d.isAfter(endDay); d = d.plusDays(1)) {
            totalDays++;
            long events = writeDayPeriod(view, d);
            if (events == 0) {
                zeroDays++;
            }
            // 每10天或每10秒输出一次进度
            long now = System.currentTimeMillis();
            if (totalDays % 10 == 0 || now - lastLog > 10_000) {
                log.warn("[analytics-audit] viewId={} backfill progress: {}/{} days done, {} zero-event days so far",
                        view.getId(), totalDays, span, zeroDays);
                lastLog = now;
            }
        }
        if (zeroDays > 0) {
            log.warn("[analytics-audit] viewId={} day backfill done: {} total, {} zero-event days",
                    view.getId(), totalDays, zeroDays);
        }
    }

    private void backfillWeeks(AnalyticsUserView view, LocalDate until, LocalDate lastWeekMonday) {
        LocalDate weekStart = until.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        if (weekStart.isAfter(lastWeekMonday)) {
            return;
        }
        int count = 0;
        for (LocalDate w = weekStart; !w.isAfter(lastWeekMonday); w = w.plusWeeks(1)) {
            if (++count > MAX_BACKFILL_WEEKS) {
                log.warn("[analytics-audit] viewId={} week backfill capped at {}", view.getId(), MAX_BACKFILL_WEEKS);
                break;
            }
            writeWeekPeriod(view, w);
        }
    }

    private void backfillMonths(AnalyticsUserView view, LocalDate until, LocalDate lastMonthStart) {
        LocalDate monthStart = until.withDayOfMonth(1);
        if (monthStart.isAfter(lastMonthStart)) {
            return;
        }
        int count = 0;
        for (LocalDate m = monthStart; !m.isAfter(lastMonthStart); m = m.plusMonths(1)) {
            if (++count > MAX_BACKFILL_MONTHS) {
                log.warn("[analytics-audit] viewId={} month backfill capped at {}", view.getId(), MAX_BACKFILL_MONTHS);
                break;
            }
            writeMonthPeriod(view, m);
        }
    }

    private long writeDayPeriod(AnalyticsUserView view, LocalDate day) {
        return writeDayPeriod(view, day, 1, 1);
    }

    private void writeWeekPeriod(AnalyticsUserView view, LocalDate weekMonday) {
        writeWeekPeriod(view, weekMonday, 1, 1);
    }

    private void writeMonthPeriod(AnalyticsUserView view, LocalDate monthStart) {
        writeMonthPeriod(view, monthStart, 1, 1);
    }

    private long writeDayPeriod(AnalyticsUserView view, LocalDate day, int cycleIndex, int cycleTotal) {
        LocalDate prev = day.minusDays(1);
        return writePeriodLog(
                view,
                "day",
                day.format(DateTimeFormatter.ISO_LOCAL_DATE),
                day.atStartOfDay(),
                day.atTime(23, 59, 59),
                prev.atStartOfDay(),
                prev.atTime(23, 59, 59),
                cycleIndex,
                cycleTotal);
    }

    private void writeWeekPeriod(AnalyticsUserView view, LocalDate weekMonday, int cycleIndex, int cycleTotal) {
        LocalDate weekSunday = weekMonday.plusDays(6);
        LocalDate prevWeekMonday = weekMonday.minusWeeks(1);
        LocalDate prevWeekSunday = weekMonday.minusDays(1);
        String weekLabel = weekMonday.get(ISO_WEEK.weekBasedYear()) + "-W"
                + String.format("%02d", weekMonday.get(ISO_WEEK.weekOfWeekBasedYear()));
        writePeriodLog(
                view,
                "week",
                weekLabel,
                weekMonday.atStartOfDay(),
                weekSunday.atTime(23, 59, 59),
                prevWeekMonday.atStartOfDay(),
                prevWeekSunday.atTime(23, 59, 59),
                cycleIndex,
                cycleTotal);
    }

    private void writeMonthPeriod(AnalyticsUserView view, LocalDate monthStart, int cycleIndex, int cycleTotal) {
        LocalDate monthEnd = monthStart.with(TemporalAdjusters.lastDayOfMonth());
        LocalDate prevMonthEnd = monthStart.minusDays(1);
        LocalDate prevMonthStart = prevMonthEnd.withDayOfMonth(1);
        String monthLabel = monthStart.format(MONTH_FMT);
        writePeriodLog(
                view,
                "month",
                monthLabel,
                monthStart.atStartOfDay(),
                monthEnd.atTime(23, 59, 59),
                prevMonthStart.atStartOfDay(),
                prevMonthEnd.atTime(23, 59, 59),
                cycleIndex,
                cycleTotal);
    }

    private static LocalDate lastCompleteWeekMonday(LocalDate today) {
        return today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).minusWeeks(1);
    }

    private static LocalDate lastCompleteMonthStart(LocalDate today) {
        return today.withDayOfMonth(1).minusMonths(1);
    }

    public void runAuditForAllSubscribed(String reportKey) {
        List<AnalyticsUserView> views = userViewMapper.selectAllSubscribed(reportKey);
        for (AnalyticsUserView view : views) {
            try {
                runAuditForView(view);
            } catch (Exception e) {
                log.warn("[analytics-audit] viewId={} failed: {}", view.getId(), e.getMessage());
            }
        }
    }

    private long writePeriodLog(
            AnalyticsUserView view,
            String periodType,
            String periodLabel,
            LocalDateTime curStart,
            LocalDateTime curEnd,
            LocalDateTime prevStart,
            LocalDateTime prevEnd,
            int cycleIndex,
            int cycleTotal) {
        Map<String, Object> filter = readFilter(view.getFilterJson());
        boolean cageReport = isCageReport(view);
        AnalyticsAuditLog existing =
                auditLogMapper.selectByViewPeriodLabel(view.getId(), periodType, periodLabel);
        // 隔离服：同 periodLabel 允许覆盖更新（配置变更后自动重算）
        Map<String, Object> curReport;
        if (cageReport) {
            CageAnalyticsFilterParams cageParams = CageAnalyticsFilterParams.fromMap(filter);
            cageAuditProgressService.onCycleStart(view.getId(), cycleIndex, periodType, periodLabel);
            curReport = cageOccupancyReportService.querySnapshotForAudit(
                    cageParams, formatDt(curStart), formatDt(curEnd), view.getId());
        } else {
            AnalyticsFilterParams params = AnalyticsFilterParams.fromMap(filter);
            curReport = isolationUsageReportService.queryWithFilter(params, formatDt(curStart), formatDt(curEnd));
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> curSummary = (Map<String, Object>) curReport.get("summary");

        long curRounds = extractMetric(curSummary);
        long prevRounds;
        String prevPeriodLabel = null;
        Map<String, Object> prevSummary = Map.of();
        if (cageReport) {
            prevPeriodLabel = previousPeriodLabel(periodType, periodLabel);
            prevRounds = resolvePreviousCageOccupancy(view.getId(), periodType, prevPeriodLabel);
            if (StringUtils.hasText(prevPeriodLabel)) {
                AnalyticsAuditLog prevLog =
                        auditLogMapper.selectByViewPeriodLabel(view.getId(), periodType, prevPeriodLabel);
                if (prevLog != null) {
                    Map<String, Object> prevSnap = readSnapshot(prevLog.getTopGroupsJson());
                    Object summaryObj = prevSnap.get("summary");
                    if (summaryObj instanceof Map<?, ?> map) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> typed = (Map<String, Object>) map;
                        prevSummary = typed;
                    }
                }
            }
        } else {
            AnalyticsFilterParams isoParams = AnalyticsFilterParams.fromMap(filter);
            Map<String, Object> prevReport =
                    isolationUsageReportService.queryWithFilter(isoParams, formatDt(prevStart), formatDt(prevEnd));
            @SuppressWarnings("unchecked")
            Map<String, Object> prevSummaryFromReport = (Map<String, Object>) prevReport.get("summary");
            prevSummary = prevSummaryFromReport != null ? prevSummaryFromReport : Map.of();
            prevRounds = extractMetric(prevSummary);
        }
        long delta = curRounds - prevRounds;
        BigDecimal deltaPct = null;
        if (prevRounds > 0) {
            deltaPct = BigDecimal.valueOf(delta * 100.0 / prevRounds).setScale(2, RoundingMode.HALF_UP);
        }

        AnalyticsAuditLog row = new AnalyticsAuditLog();
        row.setUserId(view.getUserId());
        row.setViewId(view.getId());
        row.setReportKey(view.getReportKey());
        row.setViewName(view.getName());
        row.setPeriodType(periodType);
        row.setPeriodLabel(periodLabel);
        row.setCurrentStart(curStart);
        row.setCurrentEnd(curEnd);
        row.setPreviousStart(prevStart);
        row.setPreviousEnd(prevEnd);
        row.setCurrentRounds(curRounds);
        row.setPreviousRounds(prevRounds);
        row.setCurrentUsers(toInt(curSummary.get("uniqueUsers")));
        row.setPreviousUsers(toInt(prevSummary.get("uniqueUsers")));
        row.setCurrentGroups(toInt(curSummary.get("uniqueGroups")));
        row.setPreviousGroups(toInt(prevSummary.get("uniqueGroups")));
        row.setDeltaRounds(delta);
        row.setDeltaPct(deltaPct);
        row.setTopGroupsJson(
                writeSnapshot(curReport, periodLabel, cageReport, prevPeriodLabel, prevRounds, delta, deltaPct));
        if (existing != null) {
            row.setId(existing.getId());
            auditLogMapper.updatePeriodSnapshot(row);
            if (cageReport) {
                log.info(
                        "[cage-occupancy-audit] snapshot refreshed viewId={} {} {} slots={}",
                        view.getId(),
                        periodType,
                        periodLabel,
                        curRounds);
            } else {
                log.warn(
                        "[analytics-audit] snapshot refreshed viewId={} {} {} events={}",
                        view.getId(),
                        periodType,
                        periodLabel,
                        curRounds);
            }
        } else {
            auditLogMapper.insert(row);
            if (cageReport) {
                log.info(
                        "[cage-occupancy-audit] snapshot saved viewId={} {} {} slots={}",
                        view.getId(),
                        periodType,
                        periodLabel,
                        curRounds);
            }
        }
        return curRounds;
    }

    private String writeSnapshot(
            Map<String, Object> report,
            String periodLabel,
            boolean cageReport,
            String previousPeriodLabel,
            long previousRounds,
            long deltaRounds,
            BigDecimal deltaPct) {
        try {
            Map<String, Object> snap = new LinkedHashMap<>();
            snap.put("summary", report.get("summary"));
            Object summaryObj = report.get("summary");
            if (summaryObj instanceof Map<?, ?> sm) {
                @SuppressWarnings("unchecked")
                Map<String, Object> summary = (Map<String, Object>) sm;
                if (summary.get("filterSnapshot") != null) {
                    snap.put("filterSnapshot", summary.get("filterSnapshot"));
                }
                Map<String, Object> quality = new LinkedHashMap<>();
                String ds = summary.get("dataSource") != null ? String.valueOf(summary.get("dataSource")) : "aro";
                quality.put("dataSource", "cleaned".equals(ds) ? "dahua_cleaned" : ds);
                if (summary.get("studentEvents") != null) {
                    quality.put("studentEvents", summary.get("studentEvents"));
                } else if (summary.get("studentSets") != null) {
                    quality.put("studentSets", summary.get("studentSets"));
                }
                if (summary.get("staffEvents") != null) {
                    quality.put("staffEvents", summary.get("staffEvents"));
                } else if (summary.get("staffSets") != null) {
                    quality.put("staffSets", summary.get("staffSets"));
                }
                if (summary.get("reviewPendingCount") != null) {
                    quality.put("lowConfidenceCount", summary.get("reviewPendingCount"));
                }
                if ("access_package".equals(ds)) {
                    quality.put(
                            "metricNote",
                            "条数/涉及人数=清洗总库；课题组/涉及学生人数=ARO 流水（订阅校区楼层进出）；学生部门ID="
                                    + AccessAudienceConstants.studentRuleLabel());
                } else if ("cleaned".equals(ds)) {
                    quality.put(
                            "metricNote",
                            "隔离服人次来自大华摆闸清洗管线（门禁规则/去抖），与 ARO 在馆状态可能短期不一致");
                }
                snap.put("dataQuality", quality);
            }
            snap.put("byProjectGroup", report.get("byProjectGroup"));
            snap.put("byPi", report.get("byPi"));
            snap.put("byRoom", report.get("byRoom"));
            snap.put("byRegion", report.get("byRegion"));
            if (report.get("auxiliaryFlow") != null) {
                snap.put("auxiliaryFlow", report.get("auxiliaryFlow"));
            }
            if (report.get("queryProvenance") != null) {
                snap.put("queryProvenance", report.get("queryProvenance"));
            }
            snap.put("periodLabel", periodLabel);
            snap.put("savedAt", LocalDateTime.now().format(DT_FMT));
            if (cageReport) {
                Map<String, Object> compare = new LinkedHashMap<>();
                compare.put("previousPeriodLabel", previousPeriodLabel);
                compare.put("previousRounds", previousRounds);
                compare.put("deltaRounds", deltaRounds);
                compare.put("deltaPct", deltaPct);
                compare.put("metric", "occupiedSlots");
                snap.put("compare", compare);
            }
            return objectMapper.writeValueAsString(snap);
        } catch (Exception e) {
            return "{}";
        }
    }

    private AnalyticsAuditLogDto toDto(AnalyticsAuditLog row) {
        AnalyticsAuditLogDto dto = new AnalyticsAuditLogDto();
        dto.setId(row.getId());
        dto.setViewId(row.getViewId());
        dto.setReportKey(row.getReportKey());
        dto.setViewName(row.getViewName());
        dto.setPeriodType(row.getPeriodType());
        dto.setPeriodLabel(row.getPeriodLabel());
        dto.setCurrentStart(row.getCurrentStart());
        dto.setCurrentEnd(row.getCurrentEnd());
        dto.setPreviousStart(row.getPreviousStart());
        dto.setPreviousEnd(row.getPreviousEnd());
        dto.setCurrentRounds(row.getCurrentRounds());
        dto.setPreviousRounds(row.getPreviousRounds());
        dto.setCurrentUsers(row.getCurrentUsers());
        dto.setPreviousUsers(row.getPreviousUsers());
        dto.setCurrentGroups(row.getCurrentGroups());
        dto.setPreviousGroups(row.getPreviousGroups());
        dto.setDeltaRounds(row.getDeltaRounds());
        dto.setDeltaPct(row.getDeltaPct());
        dto.setTopGroups(readTopGroups(row.getTopGroupsJson()));
        enrichAudienceFromSnapshot(dto, row.getTopGroupsJson());
        dto.setCreatedAt(row.getCreatedAt());
        return dto;
    }

    private void enrichAudienceFromSnapshot(AnalyticsAuditLogDto dto, String json) {
        Map<String, Object> snap = readSnapshot(json);
        Object summaryObj = snap.get("summary");
        if (!(summaryObj instanceof Map<?, ?> summary)) {
            return;
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> s = (Map<String, Object>) summary;
        if (s.get("studentEvents") instanceof Number n) {
            dto.setStudentRounds(n.longValue());
        } else if (s.get("studentSets") instanceof Number n) {
            dto.setStudentRounds(n.longValue());
        }
        if (s.get("staffEvents") instanceof Number n) {
            dto.setStaffRounds(n.longValue());
        } else if (s.get("staffSets") instanceof Number n) {
            dto.setStaffRounds(n.longValue());
        }
        if (s.get("uniqueStudentUsers") instanceof Number n) {
            dto.setCurrentStudentUsers(n.intValue());
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> readTopGroups(String json) {
        Map<String, Object> snap = readSnapshot(json);
        Object top = snap.get("topGroups");
        if (top instanceof List<?> list) {
            return (List<Map<String, Object>>) list;
        }
        Object groups = snap.get("byProjectGroup");
        if (groups instanceof List<?> list) {
            return (List<Map<String, Object>>) list;
        }
        return List.of();
    }

    private Map<String, Object> readSnapshot(String json) {
        if (!StringUtils.hasText(json)) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            return Map.of();
        }
    }

    private Map<String, Object> readFilter(String json) {
        if (!StringUtils.hasText(json)) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            return Map.of();
        }
    }

    private static String formatDt(LocalDateTime dt) {
        return dt.format(DT_FMT);
    }

    private long resolvePreviousCageOccupancy(long viewId, String periodType, String prevLabel) {
        if (!StringUtils.hasText(prevLabel)) {
            return 0L;
        }
        AnalyticsAuditLog prev = auditLogMapper.selectByViewPeriodLabel(viewId, periodType, prevLabel);
        return prev != null && prev.getCurrentRounds() != null ? prev.getCurrentRounds() : 0L;
    }

    private static String previousPeriodLabel(String periodType, String periodLabel) {
        if (!StringUtils.hasText(periodLabel)) {
            return null;
        }
        try {
            return switch (periodType) {
                case "day" -> LocalDate.parse(periodLabel).minusDays(1).format(DateTimeFormatter.ISO_LOCAL_DATE);
                case "week" -> {
                    int dash = periodLabel.indexOf("-W");
                    if (dash < 0) {
                        yield null;
                    }
                    int year = Integer.parseInt(periodLabel.substring(0, dash));
                    int week = Integer.parseInt(periodLabel.substring(dash + 2));
                    LocalDate monday = LocalDate.of(year, 1, 4)
                            .with(ISO_WEEK.weekBasedYear(), year)
                            .with(ISO_WEEK.weekOfWeekBasedYear(), week)
                            .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
                            .minusWeeks(1);
                    yield monday.get(ISO_WEEK.weekBasedYear()) + "-W"
                            + String.format("%02d", monday.get(ISO_WEEK.weekOfWeekBasedYear()));
                }
                case "month" -> LocalDate.parse(periodLabel + "-01").minusMonths(1).format(MONTH_FMT);
                default -> null;
            };
        } catch (Exception e) {
            return null;
        }
    }

    private static long extractMetric(Map<String, Object> summary) {
        if (summary == null) {
            return 0L;
        }
        long v = toLong(summary.get("totalEvents"));
        if (v > 0) {
            return v;
        }
        v = toLong(summary.get("totalSets"));
        if (v > 0) {
            return v;
        }
        v = toLong(summary.get("totalOccupiedSlots"));
        if (v > 0) {
            return v;
        }
        v = toLong(summary.get("totalPersonTimes"));
        if (v > 0) {
            return v;
        }
        return toLong(summary.get("totalEnter"));
    }

    private static long toLong(Object o) {
        if (o instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(o));
        } catch (Exception e) {
            return 0L;
        }
    }

    private static int toInt(Object o) {
        if (o instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(o));
        } catch (Exception e) {
            return 0;
        }
    }
}
