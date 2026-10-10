package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.telemetry.dto.TelemetrySnapshotDto;
import com.example.demo.modules.telemetry.dto.TelemetryTagItemDto;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermBundleOptionDto;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermCandidateDto;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermDayMatrixDto;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermMatrixDto;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermMatrixRowDto;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermPlanDto;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermQueryPageDto;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermSampleDto;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermSampleLogDto;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermSlotDto;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermVariableDto;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryWatchlistTagDto;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryWatchlistZoneAdminDto;
import com.example.demo.modules.telemetry.entity.TelemetryLongtermSampleLogRow;
import com.example.demo.modules.telemetry.entity.TelemetryLongtermSampleRow;
import com.example.demo.modules.telemetry.entity.TelemetryLongtermVariableRow;
import com.example.demo.modules.telemetry.mapper.TelemetryLongtermSampleLogMapper;
import com.example.demo.modules.telemetry.mapper.TelemetryLongtermSampleMapper;
import com.example.demo.modules.telemetry.mapper.TelemetryLongtermVariableMapper;
import com.example.demo.modules.telemetry.util.TelemetryNumericParseUtil;
import com.example.demo.modules.twin.common.entity.TwinJobScheduleConfig;
import com.example.demo.modules.twin.common.mapper.TwinJobScheduleConfigMapper;
import com.example.demo.modules.twin.common.service.JobExecutionRegistry;
import com.example.demo.modules.twin.common.service.JobSchedulePolicy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
public class TelemetryLongtermArchiveService {

    private static final Logger log = LoggerFactory.getLogger(TelemetryLongtermArchiveService.class);

    private final TelemetryLongtermVariableMapper variableMapper;
    private final TelemetryLongtermSampleLogMapper sampleLogMapper;
    private final TelemetryLongtermSampleMapper sampleMapper;
    private final TelemetrySnapshotService snapshotService;
    private final TelemetryWatchlistDbService watchlistDbService;
    /**
     * 只读这张调度配置表，**故意不注入 {@code JobSchedulerService}**：
     * 那个服务依赖 {@code JobExecutionRegistry}，而注册表又要回调本服务跑采集任务 ——
     * 注入它就成了「注册表 → 本服务 → 调度服务 → 注册表」的环。Spring Boot 2.6 起**默认禁止循环引用**
     * （不分构造器注入还是字段注入，真机踩过：启动直接失败）。这里的 mapper 是叶子 bean，
     * 环在源码层面就不存在，不依赖任何懒加载语义。
     */
    private final TwinJobScheduleConfigMapper scheduleMapper;

    /** 快照超过此分钟数视为过旧，跳过本轮（不写假值）。 */
    @Value("${app.telemetry.longterm.stale-minutes:30}")
    private int staleMinutes = 30;

    public TelemetryLongtermArchiveService(TelemetryLongtermVariableMapper variableMapper,
                                           TelemetryLongtermSampleLogMapper sampleLogMapper,
                                           TelemetryWatchlistDbService watchlistDbService,
                                           TwinJobScheduleConfigMapper scheduleMapper,
                                           TelemetryLongtermSampleMapper sampleMapper,
                                           TelemetrySnapshotService snapshotService) {
        this.variableMapper = variableMapper;
        this.sampleLogMapper = sampleLogMapper;
        this.sampleMapper = sampleMapper;
        this.snapshotService = snapshotService;
        this.watchlistDbService = watchlistDbService;
        this.scheduleMapper = scheduleMapper;
    }

    /** 一轮采集的结局。 */
    public record SamplingResult(String outcome, int rowsWritten, int missing, String reason) {
    }

    /**
     * 按定时管理节奏执行一轮瞬时采样：取内存快照，选中变量各写一行；快照不可用则跳过并留痕，绝不写假值。
     * 值行写入失败会抛回（让调度器标记失败）；留痕写入失败只 warn，不让整轮抛出去打挂调度。
     */
    public SamplingResult runSamplingRound() {
        long t0 = System.currentTimeMillis();
        try {
            List<TelemetryLongtermVariableRow> variables = variableMapper.selectAllOrdered().stream()
                    .filter(r -> r != null && Boolean.TRUE.equals(r.getEnabled()) && StringUtils.hasText(r.getWinccVariableName()))
                    .toList();
            if (variables.isEmpty()) {
                return finish("SKIPPED", 0, 0, "未选择任何变量", t0);
            }

            TelemetrySnapshotDto snap = snapshotService.getSnapshot();
            if (snap == null) {
                return finish("SKIPPED", 0, 0, "快照不存在", t0);
            }
            if (!snap.isWinccReachable()) {
                return finish("SKIPPED", 0, 0, "采集不可达", t0);
            }
            Instant fetchedAt = snap.getFetchedAt();
            if (fetchedAt == null) {
                return finish("SKIPPED", 0, 0, "快照没有时间戳", t0);
            }
            long ageMinutes = Duration.between(fetchedAt, Instant.now()).toMinutes();
            if (ageMinutes > staleMinutes) {
                return finish("SKIPPED", 0, 0, "快照过旧（" + ageMinutes + " 分钟前）", t0);
            }

            Map<String, TelemetryTagItemDto> byName = new HashMap<>();
            if (snap.getItems() != null) {
                for (TelemetryTagItemDto it : snap.getItems()) {
                    if (it != null && StringUtils.hasText(it.getVariableName())) {
                        byName.put(it.getVariableName().trim(), it);
                    }
                }
            }

            LocalDateTime sampleAt = LocalDateTime.now();
            LocalDateTime snapshotAt = LocalDateTime.ofInstant(fetchedAt, ZoneId.systemDefault());
            String tickBatchId = UUID.randomUUID().toString();

            List<TelemetryLongtermSampleRow> rows = new ArrayList<>();
            int missing = 0;
            for (TelemetryLongtermVariableRow v : variables) {
                String name = v.getWinccVariableName().trim();
                TelemetryTagItemDto it = byName.get(name);
                if (it == null) {
                    missing++;
                    continue;
                }
                TelemetryLongtermSampleRow row = new TelemetryLongtermSampleRow();
                row.setSampleAt(sampleAt);
                row.setSnapshotAt(snapshotAt);
                row.setTickBatchId(tickBatchId);
                row.setVariableName(truncate(name, 500));
                row.setNumericValue(TelemetryNumericParseUtil.parseNumeric(it.getValue()));
                row.setRawValue(truncate(it.getValue(), 500));
                row.setMetricKindCode(truncate(it.getMetricKindCode(), 64));
                row.setRoomCanonical(truncate(it.getRoomCanonical(), 256));
                row.setFloorCode(truncate(it.getFloorCode(), 32));
                row.setBundleCode(truncate(it.getBundleCode(), 128));
                rows.add(row);
            }
            if (!rows.isEmpty()) {
                sampleMapper.insertBatch(rows);
            }
            String reason = missing > 0 ? "有 " + missing + " 个变量不在本次快照里（其余已写）" : null;
            return finish("OK", rows.size(), missing, reason, t0);
        } catch (RuntimeException e) {
            writeLog("FAILED", 0, null, t0);
            throw e;
        }
    }

    private SamplingResult finish(String outcome, int rowsWritten, int missing, String reason, long t0) {
        writeLog(outcome, rowsWritten, reason, t0);
        return new SamplingResult(outcome, rowsWritten, missing, reason);
    }

    private void writeLog(String outcome, int rowsWritten, String reason, long t0) {
        TelemetryLongtermSampleLogRow row = new TelemetryLongtermSampleLogRow();
        row.setRunAt(LocalDateTime.now());
        row.setOutcome(outcome);
        row.setRowsWritten(rowsWritten);
        row.setReason(reason);
        row.setDurationMs(System.currentTimeMillis() - t0);
        try {
            sampleLogMapper.insert(row);
        } catch (Exception e) {
            log.warn("[长期归档] 写采样留痕失败（不影响本轮结果）: {}", e.getMessage());
        }
    }

    private static String truncate(String s, int max) {
        if (s == null || s.isBlank()) {
            return null;
        }
        String t = s.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }

    /** 已选变量（含顺序）。 */
    public List<TelemetryLongtermVariableDto> listVariables() {
        List<TelemetryLongtermVariableRow> rows = variableMapper.selectAllOrdered();
        return rows.stream().map(this::toDto).toList();
    }

    /**
     * 候选变量的**分区列表**（变量目录本来的导入分区 + 各分区变量数）。
     * 加入变量时先让用户选分区，避免一次拉五千多个点位。
     */
    public List<TelemetryLongtermBundleOptionDto> listCandidateBundles() {
        Map<String, TelemetryLongtermBundleOptionDto> byCode = new java.util.LinkedHashMap<>();
        for (TelemetryWatchlistZoneAdminDto zone : watchlistDbService.listZonesWithTagsForAdmin()) {
            if (zone == null || zone.getBundle() == null || zone.getTags() == null) {
                continue;
            }
            String code = zone.getBundle().getCode();
            if (!StringUtils.hasText(code)) {
                continue;
            }
            int count = 0;
            for (TelemetryWatchlistTagDto tag : zone.getTags()) {
                if (tag != null && StringUtils.hasText(tag.getWinccVariableName())) {
                    count++;
                }
            }
            TelemetryLongtermBundleOptionDto dto = byCode.computeIfAbsent(code, k -> TelemetryLongtermBundleOptionDto.builder()
                    .code(k)
                    .displayName(StringUtils.hasText(zone.getBundle().getDisplayName())
                            ? zone.getBundle().getDisplayName() : k)
                    .count(0)
                    .build());
            dto.setCount(dto.getCount() + count);
        }
        return new ArrayList<>(byCode.values());
    }

    /**
     * 候选变量：变量目录 + 标记哪些已选。**与 watchlists 页同一份数据源**。
     *
     * @param bundle 分区 code；给了就只列该分区的变量（加入变量时按目录分区逐层加载）
     */
    public List<TelemetryLongtermCandidateDto> listCandidates(String keyword, String floor, String bundle) {
        String kw = keyword == null ? "" : keyword.trim().toLowerCase(Locale.ROOT);
        String fl = floor == null ? "" : floor.trim().toLowerCase(Locale.ROOT);
        String bd = bundle == null ? "" : bundle.trim();
        java.util.Set<String> selected = new java.util.LinkedHashSet<>();
        for (TelemetryLongtermVariableRow r : variableMapper.selectAllOrdered()) {
            if (StringUtils.hasText(r.getWinccVariableName())) {
                selected.add(r.getWinccVariableName().trim());
            }
        }
        List<TelemetryLongtermCandidateDto> out = new ArrayList<>();
        for (TelemetryWatchlistZoneAdminDto zone : watchlistDbService.listZonesWithTagsForAdmin()) {
            if (zone == null || zone.getTags() == null) {
                continue;
            }
            String zoneCode = zone.getBundle() == null ? null : zone.getBundle().getCode();
            if (!bd.isEmpty() && !bd.equals(zoneCode)) {
                continue;
            }
            for (TelemetryWatchlistTagDto tag : zone.getTags()) {
                if (tag == null || !StringUtils.hasText(tag.getWinccVariableName())) {
                    continue;
                }
                String name = tag.getWinccVariableName().trim();
                if (!kw.isEmpty() && !hit(tag, name, kw)) {
                    continue;
                }
                if (!fl.isEmpty() && !contains(tag.getFloorCode(), fl) && !contains(tag.getDisplayLabel(), fl)) {
                    continue;
                }
                TelemetryLongtermCandidateDto d = new TelemetryLongtermCandidateDto();
                d.setWinccVariableName(name);
                d.setDisplayLabel(tag.getDisplayLabel() != null ? tag.getDisplayLabel() : name);
                d.setFloorCode(tag.getFloorCode());
                d.setRoomCanonical(tag.getRoomCanonical());
                d.setMetricKindCode(tag.getMetricKindCode());
                d.setEnabledInCatalog(tag.isEnabled());
                d.setSelected(selected.contains(name));
                d.setBundleCode(zoneCode);
                d.setBundleDisplayName(zone.getBundle() == null ? null
                        : (StringUtils.hasText(zone.getBundle().getDisplayName())
                                ? zone.getBundle().getDisplayName() : zoneCode));
                out.add(d);
            }
        }
        return out;
    }

    /** 整份替换已选变量与顺序（只写本表，**不碰变量目录**）。 */
    @Transactional
    public void saveVariables(List<TelemetryLongtermVariableDto> incoming) {
        List<TelemetryLongtermVariableRow> rows = new ArrayList<>();
        if (incoming != null) {
            int order = 0;
            for (TelemetryLongtermVariableDto d : incoming) {
                if (d == null || !StringUtils.hasText(d.getWinccVariableName())) {
                    continue;
                }
                TelemetryLongtermVariableRow r = new TelemetryLongtermVariableRow();
                r.setWinccVariableName(d.getWinccVariableName().trim());
                r.setSortOrder(order++);
                r.setDisplayLabel(trim(d.getDisplayLabel()));
                r.setUnit(trim(d.getUnit()));
                r.setEnabled(d.isEnabled());
                rows.add(r);
            }
        }
        variableMapper.deleteAll();
        if (!rows.isEmpty()) {
            variableMapper.insertBatch(rows);
        }
        log.info("[长期归档] 已选变量保存 {} 条", rows.size());
    }

    /** 计划视图：间隔从定时管理读，只读展示（唯一权威入口是定时管理页）。 */
    public TelemetryLongtermPlanDto getPlanView() {
        TelemetryLongtermPlanDto dto = new TelemetryLongtermPlanDto();
        String jobKey = JobExecutionRegistry.JOB_TELEMETRY_LONGTERM_SAMPLE;
        TwinJobScheduleConfig cfg = scheduleMapper.selectByJobKey(jobKey);
        if (cfg != null) {
            dto.setScheduleEnabled(cfg.getEnabled() != null && cfg.getEnabled() == 1);
            dto.setPollIntervalSeconds(cfg.getPollIntervalSeconds() == null
                    ? JobSchedulePolicy.defaultPollIntervalSeconds(jobKey)
                    : cfg.getPollIntervalSeconds());
            dto.setScheduleStartTime(cfg.getScheduleStartTime());
            dto.setScheduleEndTime(cfg.getScheduleEndTime());
        } else {
            // 调度行还没播种（启动后第一次 tick 才会建）——给默认值，别让页面显示 0 分钟
            dto.setScheduleEnabled(false);
            dto.setPollIntervalSeconds(JobSchedulePolicy.defaultPollIntervalSeconds(jobKey));
            dto.setScheduleStartTime("00:00");
            dto.setScheduleEndTime("23:59");
        }
        dto.setVariableCount(variableMapper.selectAllOrdered().size());
        dto.setSampleRows(sampleMapper.countByFilter(null, null, null));
        dto.setRecentRuns(recentLogs(20));
        return dto;
    }

    public List<TelemetryLongtermSampleLogDto> recentLogs(int limit) {
        List<TelemetryLongtermSampleLogDto> out = new ArrayList<>();
        for (TelemetryLongtermSampleLogRow r : sampleLogMapper.selectRecent(Math.max(1, Math.min(200, limit)))) {
            out.add(TelemetryLongtermSampleLogDto.builder()
                    .runAt(r.getRunAt())
                    .outcome(r.getOutcome())
                    .rowsWritten(r.getRowsWritten() == null ? 0 : r.getRowsWritten())
                    .reason(r.getReason())
                    .durationMs(r.getDurationMs() == null ? 0L : r.getDurationMs())
                    .build());
        }
        return out;
    }

    /** 矩阵一次最多取多少行原始样本（一个月 20 变量 × 2 小时 ≈ 七千行，留足余量）。 */
    private static final int MATRIX_ROW_LIMIT = 50_000;

    private static final java.time.format.DateTimeFormatter DAY_FMT =
            java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd");

    /**
     * 按天矩阵：**一天一张表，行 = 变量、列 = 平分槽位**。
     *
     * <p>三条口径（写错就满屏空白格或时间错位）：
     * <ul>
     *   <li><b>列是槽位不是实际时刻</b>：把一天按采样间隔平分成 slotCount 段，实际采样有延迟
     *       （要等采集），归到最近的槽位后不同天/不同变量才对得齐；每列带上该槽的**名义时间点**。</li>
     *   <li>只列**当天真有数据的槽**（升序），不铺满全部槽位；</li>
     *   <li>行只取**当天有数据的变量**，顺序仍按配置里的排序。</li>
     * </ul>
     */
    public TelemetryLongtermMatrixDto queryMatrix(String day, String month, LocalDateTime from, LocalDateTime to) {
        LocalDateTime effFrom;
        LocalDateTime effTo;
        if (StringUtils.hasText(day) && day.trim().length() == 10) {
            // 单日查看（日历选一天）：只取那一天，别把整月拉下来 —— 一天 144 槽 × 二十几个变量
            // 就已经是几万个单元格了，整月一次性下发是实打实的数据压力。
            try {
                java.time.LocalDate d = java.time.LocalDate.parse(day.trim());
                effFrom = d.atStartOfDay();
                effTo = d.atTime(23, 59, 59, 999_000_000);
            } catch (Exception e) {
                return TelemetryLongtermMatrixDto.builder().days(List.of()).dayTables(List.of()).build();
            }
        } else {
            LocalDateTime[] range = monthRange(month);
            effFrom = range != null ? range[0] : from;
            effTo = range != null ? range[1] : to;
        }

        List<TelemetryLongtermSampleRow> rows = sampleMapper.selectForExport(null, effFrom, effTo, MATRIX_ROW_LIMIT);

        int intervalSec = currentIntervalSeconds();
        int slotCount = Math.max(1, (int) Math.round(86400.0 / intervalSec));
        int slotLenSec = Math.max(1, 86400 / slotCount);

        Map<String, TelemetryLongtermVariableRow> cfgByVar = new java.util.LinkedHashMap<>();
        for (TelemetryLongtermVariableRow v : variableMapper.selectAllOrdered()) {
            if (v != null && StringUtils.hasText(v.getWinccVariableName())) {
                cfgByVar.put(v.getWinccVariableName().trim(), v);
            }
        }

        // day → 槽 → 变量 → 值（TreeMap 让槽位天然升序）
        Map<String, Map<Integer, Map<String, String>>> byDay = new java.util.LinkedHashMap<>();
        // 变量 → 指标类型 / 房间（同一变量恒定，取第一次见到的即可）
        Map<String, String> metricKindByVar = new java.util.LinkedHashMap<>();
        Map<String, String> roomByVar = new java.util.LinkedHashMap<>();
        if (rows != null) {
            for (TelemetryLongtermSampleRow r : rows) {
                if (r == null || r.getSampleAt() == null || !StringUtils.hasText(r.getVariableName())) {
                    continue;
                }
                String varName = r.getVariableName().trim();
                if (StringUtils.hasText(r.getMetricKindCode()) && !metricKindByVar.containsKey(varName)) {
                    metricKindByVar.put(varName, r.getMetricKindCode());
                }
                if (StringUtils.hasText(r.getRoomCanonical()) && !roomByVar.containsKey(varName)) {
                    roomByVar.put(varName, r.getRoomCanonical());
                }
                String dayKey = r.getSampleAt().toLocalDate().format(DAY_FMT);
                int slot = slotOf(r.getSampleAt(), slotLenSec, slotCount);
                String value = r.getRawValue() != null
                        ? r.getRawValue()
                        : (r.getNumericValue() == null ? null : String.valueOf(r.getNumericValue()));
                byDay.computeIfAbsent(dayKey, k -> new java.util.TreeMap<>())
                        .computeIfAbsent(slot, k -> new java.util.LinkedHashMap<>())
                        .put(varName, value);
            }
        }

        List<String> days = new ArrayList<>(byDay.keySet());
        days.sort(java.util.Comparator.reverseOrder()); // 新的在前

        List<TelemetryLongtermDayMatrixDto> tables = new ArrayList<>();
        for (String dayKey : days) {
            Map<Integer, Map<String, String>> bySlot = byDay.get(dayKey);
            List<Integer> slots = new ArrayList<>(bySlot.keySet());
            List<TelemetryLongtermSlotDto> columns = new ArrayList<>(slots.size());
            for (Integer s : slots) {
                columns.add(TelemetryLongtermSlotDto.builder()
                        .slot(s)
                        .time(slotTimeText(s, slotLenSec))
                        .build());
            }
            List<TelemetryLongtermMatrixRowDto> rowDtos = new ArrayList<>();
            for (String name : orderedVariableNames(cfgByVar, bySlot)) {
                List<String> values = new ArrayList<>(slots.size());
                boolean any = false;
                for (Integer s : slots) {
                    String v = bySlot.get(s).get(name);
                    if (v != null) {
                        any = true;
                    }
                    values.add(v);
                }
                if (!any) {
                    continue; // 当天这个变量一条都没有 → 不出这一行（否则满屏「—」）
                }
                TelemetryLongtermVariableRow c = cfgByVar.get(name);
                rowDtos.add(TelemetryLongtermMatrixRowDto.builder()
                        .variableName(name)
                        .displayLabel(c != null && StringUtils.hasText(c.getDisplayLabel())
                                ? c.getDisplayLabel() : name)
                        .unit(c == null ? null : c.getUnit())
                        .metricKindCode(metricKindByVar.get(name))
                        .roomCanonical(roomByVar.get(name))
                        .values(values)
                        .build());
            }
            tables.add(TelemetryLongtermDayMatrixDto.builder()
                    .day(dayKey)
                    .slotCount(slotCount)
                    .columns(columns)
                    .rows(rowDtos)
                    .build());
        }

        return TelemetryLongtermMatrixDto.builder().days(days).dayTables(tables).build();
    }

    /** 采样间隔（秒）：取定时管理里那一行的配置；取不到用策略里的默认值。 */
    private int currentIntervalSeconds() {
        String jobKey = JobExecutionRegistry.JOB_TELEMETRY_LONGTERM_SAMPLE;
        TwinJobScheduleConfig cfg = scheduleMapper.selectByJobKey(jobKey);
        Integer poll = cfg == null ? null : cfg.getPollIntervalSeconds();
        if (poll != null && poll > 0) {
            return poll;
        }
        return JobSchedulePolicy.defaultPollIntervalSeconds(jobKey);
    }

    /**
     * 把实际采样时刻归到槽位：**取最近的那个平分点**，落在它左右范围内都算它。
     * 这样采样晚了几秒/几分钟也不会跑到隔壁列去（用户原话：序号左右范围内都属于这个序号）。
     */
    private static int slotOf(LocalDateTime at, int slotLenSec, int slotCount) {
        int secOfDay = at.toLocalTime().toSecondOfDay();
        int slot = (int) Math.round((double) secOfDay / slotLenSec);
        return Math.max(0, Math.min(slotCount - 1, slot));
    }

    /** 槽位的名义时间点；间隔整除不了一天时带秒（否则两个槽会显示成同一时刻）。 */
    private static String slotTimeText(int slot, int slotLenSec) {
        int sec = slot * slotLenSec;
        int h = sec / 3600;
        int m = (sec % 3600) / 60;
        int s = sec % 60;
        return s == 0 ? String.format("%02d:%02d", h, m) : String.format("%02d:%02d:%02d", h, m, s);
    }

    /** 行序：先按配置顺序，再补「数据里有但已不在配置里」的历史变量。 */
    private static List<String> orderedVariableNames(Map<String, TelemetryLongtermVariableRow> cfgByVar,
                                                     Map<Integer, Map<String, String>> bySlot) {
        List<String> ordered = new ArrayList<>(cfgByVar.keySet());
        for (Map<String, String> perVar : bySlot.values()) {
            for (String name : perVar.keySet()) {
                if (!ordered.contains(name)) {
                    ordered.add(name);
                }
            }
        }
        return ordered;
    }

    /** `2026-10` → [当月首刻, 当月末刻]；不合法或为空返回 null（表示不加时间条件）。 */
    public static LocalDateTime[] monthRange(String month) {
        if (month == null || month.isBlank()) {
            return null;
        }
        String m = month.trim();
        if (m.length() != 7 || m.charAt(4) != '-') {
            return null;
        }
        try {
            java.time.YearMonth ym = java.time.YearMonth.parse(m);
            return new LocalDateTime[]{
                    ym.atDay(1).atStartOfDay(),
                    ym.atEndOfMonth().atTime(23, 59, 59, 999_000_000)
            };
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 长期归档明细分页。时间条件二选一：给了 month 就按整月，否则用 from/to。
     */
    public TelemetryLongtermQueryPageDto querySamples(int page, int size, String variableQ,
                                                      String month, LocalDateTime from, LocalDateTime to) {
        int p = Math.max(1, page);
        int s = Math.max(1, Math.min(200, size));
        LocalDateTime[] range = monthRange(month);
        LocalDateTime effFrom = range != null ? range[0] : from;
        LocalDateTime effTo = range != null ? range[1] : to;
        String q = variableQ == null || variableQ.isBlank() ? null : variableQ.trim();
        long total = sampleMapper.countByFilter(q, effFrom, effTo);
        Map<String, String> unitByName = unitByVariableName();
        List<TelemetryLongtermSampleDto> items = new ArrayList<>();
        for (TelemetryLongtermSampleRow r : sampleMapper.selectPageByFilter(q, effFrom, effTo, (p - 1) * s, s)) {
            TelemetryLongtermSampleDto d = new TelemetryLongtermSampleDto();
            d.setSampleAt(r.getSampleAt());
            d.setVariableName(r.getVariableName());
            d.setNumericValue(r.getNumericValue());
            d.setRawValue(r.getRawValue());
            d.setUnit(r.getVariableName() == null ? null : unitByName.get(r.getVariableName().trim()));
            d.setRoomCanonical(r.getRoomCanonical());
            d.setFloorCode(r.getFloorCode());
            d.setSnapshotAt(r.getSnapshotAt());
            items.add(d);
        }
        return TelemetryLongtermQueryPageDto.builder().total(total).page(p).size(s).items(items).build();
    }

    /** 单位映射只建一次（单位存在变量配置里，目录没有单位列），别逐行遍历已选变量。 */
    private Map<String, String> unitByVariableName() {
        Map<String, String> map = new HashMap<>();
        for (TelemetryLongtermVariableRow r : variableMapper.selectAllOrdered()) {
            if (r != null && StringUtils.hasText(r.getWinccVariableName())) {
                map.put(r.getWinccVariableName().trim(), r.getUnit());
            }
        }
        return map;
    }

    /** 月份下拉：已有哪些月份有数据。 */
    public List<String> listMonths() {
        return sampleMapper.selectDistinctMonths();
    }

    /** 区间内「有数据的日期」（{@code yyyy-MM-dd}，新的在前）—— 日历上标注哪天有数据。 */
    public List<String> listDaysWithData(String month, LocalDateTime from, LocalDateTime to) {
        LocalDateTime[] range = monthRange(month);
        return sampleMapper.selectDistinctDays(range != null ? range[0] : from, range != null ? range[1] : to);
    }

    private TelemetryLongtermVariableDto toDto(TelemetryLongtermVariableRow r) {        TelemetryLongtermVariableDto d = new TelemetryLongtermVariableDto();
        d.setWinccVariableName(r.getWinccVariableName());
        d.setSortOrder(r.getSortOrder() == null ? 0 : r.getSortOrder());
        d.setDisplayLabel(r.getDisplayLabel());
        d.setUnit(r.getUnit());
        d.setEnabled(r.getEnabled() == null || r.getEnabled());
        return d;
    }

    private static boolean hit(TelemetryWatchlistTagDto tag, String name, String kw) {
        return contains(name, kw)
                || contains(tag.getDisplayLabel(), kw)
                || contains(tag.getRoomCanonical(), kw)
                || contains(tag.getFloorCode(), kw)
                || contains(tag.getMetricKindCode(), kw);
    }

    private static boolean contains(String value, String kw) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(kw);
    }

    private static String trim(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
