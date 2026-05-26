package com.example.demo.modules.analytics.service;

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
    private final ObjectMapper objectMapper;

    public AnalyticsAuditService(
            AnalyticsUserViewMapper userViewMapper,
            AnalyticsAuditLogMapper auditLogMapper,
            IsolationUsageReportService isolationUsageReportService,
            CageOccupancyReportService cageOccupancyReportService,
            AnalyticsCageAuditProgressService cageAuditProgressService,
            ObjectMapper objectMapper) {
        this.userViewMapper = userViewMapper;
        this.auditLogMapper = auditLogMapper;
        this.isolationUsageReportService = isolationUsageReportService;
        this.cageOccupancyReportService = cageOccupancyReportService;
        this.cageAuditProgressService = cageAuditProgressService;
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
        if (row == null || !userId.equals(row.getUserId())) {
            throw new IllegalArgumentException("记录不存在");
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
        return out;
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
        if (view == null || view.getIsSubscribed() == null || view.getIsSubscribed() != 1) {
            return;
        }
        if (isCageReport(view)) {
            log.info("[analytics-audit] cage_occupancy skip history backfill viewId={}", view.getId());
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
        for (LocalDate d = start; !d.isAfter(endDay); d = d.plusDays(1)) {
            writeDayPeriod(view, d);
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

    private void writeDayPeriod(AnalyticsUserView view, LocalDate day) {
        writeDayPeriod(view, day, 1, 1);
    }

    private void writeWeekPeriod(AnalyticsUserView view, LocalDate weekMonday) {
        writeWeekPeriod(view, weekMonday, 1, 1);
    }

    private void writeMonthPeriod(AnalyticsUserView view, LocalDate monthStart) {
        writeMonthPeriod(view, monthStart, 1, 1);
    }

    private void writeDayPeriod(AnalyticsUserView view, LocalDate day, int cycleIndex, int cycleTotal) {
        LocalDate prev = day.minusDays(1);
        writePeriodLog(
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

    private void writePeriodLog(
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
        if (existing != null && !cageReport) {
            return;
        }
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
            log.info(
                    "[cage-occupancy-audit] snapshot refreshed viewId={} {} {} slots={}",
                    view.getId(),
                    periodType,
                    periodLabel,
                    curRounds);
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
            snap.put("byProjectGroup", report.get("byProjectGroup"));
            snap.put("byPi", report.get("byPi"));
            snap.put("byRoom", report.get("byRoom"));
            snap.put("byRegion", report.get("byRegion"));
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
        dto.setCreatedAt(row.getCreatedAt());
        return dto;
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
        long v = toLong(summary.get("totalOccupiedSlots"));
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
