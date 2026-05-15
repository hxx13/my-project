package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.telemetry.client.WinCcRestTagClient;
import com.example.demo.modules.telemetry.config.TelemetryWatchlistLoader;
import com.example.demo.modules.telemetry.config.WinCcProperties;
import com.example.demo.modules.telemetry.dto.TelemetryWatchlistEnrichment;
import com.example.demo.modules.telemetry.dto.TelemetrySequentialDiagnosticDto;
import com.example.demo.modules.telemetry.dto.TelemetrySnapshotDto;
import com.example.demo.modules.telemetry.dto.TelemetryTagItemDto;
import com.example.demo.modules.twin.mapper.TwinJobScheduleConfigMapper;
import com.example.demo.modules.twin.service.JobExecutionRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 内存快照 + 定时刷新；后续可替换为从时序库读取而不改 Controller。
 */
@Service
public class TelemetrySnapshotService {

    private static final Logger log = LoggerFactory.getLogger(TelemetrySnapshotService.class);

    private static final String MSG_DISABLED = "WinCC 集成未启用（app.wincc.enabled=false）。可在配置中开启并填写 base-url 与账号。";

    private static final String SCHED_TRACE = "system-wincc-telemetry";

    private final WinCcProperties properties;
    private final WinCcRestTagClient winCcRestTagClient;
    private final TelemetryWatchlistLoader watchlistLoader;
    private final TelemetryWatchlistDbService watchlistDbService;
    private final TwinJobScheduleConfigMapper jobScheduleConfigMapper;
    private final TelemetryArchiveService telemetryArchiveService;
    private final TelemetryWinCcSnapshotBroadcastService snapshotBroadcastService;

    private final AtomicReference<List<TelemetryTagItemDto>> lastItems = new AtomicReference<>(List.of());
    private final AtomicReference<Instant> lastSuccessAt = new AtomicReference<>(null);
    private final AtomicReference<String> lastError = new AtomicReference<>(null);
    private final AtomicReference<Boolean> lastReachable = new AtomicReference<>(false);

    /** 避免 @Scheduled 与 HTTP sync=true 同时对 WinCC 发 POST，加重卡顿或 Read timed out。 */
    private final Object winCcRefreshLock = new Object();

    /**
     * 每变量滑动窗内 (时间, 数值) 样本；仅在 {@link #refreshFromWinCc} 互斥区内访问。
     */
    private final Map<String, ArrayDeque<ValueTrendSample>> valueTrendWindows = new HashMap<>();

    public TelemetrySnapshotService(WinCcProperties properties,
                                    WinCcRestTagClient winCcRestTagClient,
                                    TelemetryWatchlistLoader watchlistLoader,
                                    TelemetryWatchlistDbService watchlistDbService,
                                    TwinJobScheduleConfigMapper jobScheduleConfigMapper,
                                    TelemetryArchiveService telemetryArchiveService,
                                    TelemetryWinCcSnapshotBroadcastService snapshotBroadcastService) {
        this.properties = properties;
        this.winCcRestTagClient = winCcRestTagClient;
        this.watchlistLoader = watchlistLoader;
        this.watchlistDbService = watchlistDbService;
        this.jobScheduleConfigMapper = jobScheduleConfigMapper;
        this.telemetryArchiveService = telemetryArchiveService;
        this.snapshotBroadcastService = snapshotBroadcastService;
    }

    /**
     * 供 HTTP 读取的当前快照（不触发 WinCC 调用，只读内存；避免前端轮询打爆 WinCC）。
     */
    public TelemetrySnapshotDto getSnapshot() {
        if (!properties.isEnabled()) {
            return TelemetrySnapshotDto.disabled(MSG_DISABLED);
        }
        return TelemetrySnapshotDto.builder()
                .winccEnabled(true)
                .fetchedAt(lastSuccessAt.get())
                .items(List.copyOf(lastItems.get()))
                .lastError(lastError.get())
                .winccReachable(Boolean.TRUE.equals(lastReachable.get()))
                .build();
    }

    /**
     * WinCC 写入成功后：仅对被读回的变量 POST /Values 并合并进内存快照对应行，禁止整表 {@link #refreshFromWinCc()}。
     * 保存后仅合并当前行，禁止整表 load —— {@code post-save-no-full-refresh.mdc}
     */
    public List<TelemetryTagItemDto> mergeWinCcReadingsIntoCachedSnapshot(List<String> variableNames) {
        if (!properties.isEnabled()) {
            return List.of();
        }
        if (variableNames == null || variableNames.isEmpty()) {
            return List.of();
        }
        List<String> names = variableNames.stream()
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .toList();
        if (names.isEmpty()) {
            return List.of();
        }
        synchronized (winCcRefreshLock) {
            List<Map<String, Object>> raw = winCcRestTagClient.readValues(names);
            List<TelemetryTagItemDto> readings = enrichDisplayLabelsOnly(mapRows(raw));
            Instant trendNow = Instant.now();
            List<TelemetryTagItemDto> cur = new ArrayList<>(lastItems.get());
            List<TelemetryTagItemDto> out = new ArrayList<>();
            for (TelemetryTagItemDto fresh : readings) {
                if (fresh == null || !StringUtils.hasText(fresh.getVariableName())) {
                    continue;
                }
                Integer idx = findSnapshotRowIndex(cur, fresh.getVariableName().trim());
                if (idx != null) {
                    TelemetryTagItemDto merged = overlayWinCcReadingOnto(cur.get(idx), fresh);
                    applyTrendToSingleItem(merged, trendNow);
                    cur.set(idx, merged);
                    out.add(merged);
                } else {
                    applyTrendToSingleItem(fresh, trendNow);
                    out.add(fresh);
                }
            }
            lastItems.set(cur);
            // 与前端当前分区 10s 定点读同源：广播增量行，其它 Web 标签页合并缓存（禁止仅靠本机 setQueryData）（post-save-no-full-refresh.mdc）
            snapshotBroadcastService.broadcastTagDelta(out);
            return out;
        }
    }

    private Integer findSnapshotRowIndex(List<TelemetryTagItemDto> cur, String variableName) {
        if (cur == null || cur.isEmpty() || !StringUtils.hasText(variableName)) {
            return null;
        }
        String t = variableName.trim();
        for (int i = 0; i < cur.size(); i++) {
            TelemetryTagItemDto x = cur.get(i);
            if (x != null && StringUtils.hasText(x.getVariableName()) && t.equals(x.getVariableName().trim())) {
                return i;
            }
        }
        String want = TelemetryWatchlistDbService.normalizeWinCcVariableKey(t);
        for (int i = 0; i < cur.size(); i++) {
            TelemetryTagItemDto x = cur.get(i);
            if (x == null || !StringUtils.hasText(x.getVariableName())) {
                continue;
            }
            if (TelemetryWatchlistDbService.normalizeWinCcVariableKey(x.getVariableName().trim()).equals(want)) {
                return i;
            }
        }
        return null;
    }

    private static TelemetryTagItemDto overlayWinCcReadingOnto(TelemetryTagItemDto existing, TelemetryTagItemDto fresh) {
        if (existing == null) {
            return fresh;
        }
        if (fresh == null) {
            return existing;
        }
        return TelemetryTagItemDto.builder()
                .variableName(existing.getVariableName())
                .displayLabel(existing.getDisplayLabel())
                .bundleCode(existing.getBundleCode())
                .bundleDisplayName(existing.getBundleDisplayName())
                .floorCode(existing.getFloorCode())
                .roomCanonical(existing.getRoomCanonical())
                .metricKindCode(existing.getMetricKindCode())
                .metricKindLabel(existing.getMetricKindLabel())
                .kindRole(existing.getKindRole())
                .alarmMinValue(existing.getAlarmMinValue())
                .alarmMaxValue(existing.getAlarmMaxValue())
                .alarmMinVariableName(existing.getAlarmMinVariableName())
                .alarmMaxVariableName(existing.getAlarmMaxVariableName())
                .alarmOutOfRange(existing.getAlarmOutOfRange())
                .alarmBand(existing.getAlarmBand())
                .watchlistTagId(existing.getWatchlistTagId())
                .alarmOverrideMin(existing.getAlarmOverrideMin())
                .alarmOverrideMax(existing.getAlarmOverrideMax())
                .value(fresh.getValue())
                .timestamp(fresh.getTimestamp())
                .qualityCode(fresh.getQualityCode())
                .dataType(fresh.getDataType())
                .errorCode(fresh.getErrorCode())
                .error(fresh.getError())
                .valueTrend(existing.getValueTrend())
                .build();
    }

    private void applyTrendToSingleItem(TelemetryTagItemDto dto, Instant trendNow) {
        if (dto == null || !StringUtils.hasText(dto.getVariableName())) {
            return;
        }
        String vn = dto.getVariableName().trim();
        long windowMs = Math.max(60_000L, properties.getTrendWindowMs());
        Instant cutoff = trendNow.minusMillis(windowMs);
        double dbAbs = Math.max(0d, properties.getTrendDeadbandAbs());
        double dbRel = Math.max(0d, properties.getTrendDeadbandRel());
        Double close = parseTelemetryNumeric(dto.getValue());
        if (close == null) {
            dto.setValueTrend(null);
            return;
        }
        ArrayDeque<ValueTrendSample> q = valueTrendWindows.computeIfAbsent(vn, k -> new ArrayDeque<>());
        q.addLast(new ValueTrendSample(trendNow, close));
        while (!q.isEmpty() && q.peekFirst().instant().isBefore(cutoff)) {
            q.pollFirst();
        }
        ValueTrendSample first = q.peekFirst();
        double open = first == null ? close : first.value();
        dto.setValueTrend(computeSlidingWindowTrend(open, close, dbAbs, dbRel));
    }

    /**
     * 从 WinCC 拉取测量值并更新内存快照（高频）；定时任务与「立即执行 TELEMETRY_WINCC_UI」共用。
     */
    public void refreshFromWinCc() {
        if (!properties.isEnabled()) {
            log.debug("[WinCC遥测] refreshFromWinCc 跳过：未启用 app.wincc.enabled");
            return;
        }
        synchronized (winCcRefreshLock) {
            List<String> names = resolveMeasurementTagNamesForSnapshotRefresh();
            if (names == null) {
                return;
            }
            LocalDateTime runAt = LocalDateTime.now();
            jobScheduleConfigMapper.markRunning(JobExecutionRegistry.JOB_TELEMETRY_WINCC_UI, runAt, SCHED_TRACE);
            if (names.isEmpty()) {
                if (log.isDebugEnabled()) {
                    log.debug("[WinCC测量] 无待拉取测量变量，跳过");
                }
                jobScheduleConfigMapper.markSuccess(JobExecutionRegistry.JOB_TELEMETRY_WINCC_UI, LocalDateTime.now(), SCHED_TRACE);
                return;
            }
            int chunk = Math.max(1, properties.getValuesChunkSize());
            int batches = (names.size() + chunk - 1) / chunk;
            if (log.isDebugEnabled()) {
                log.debug("[WinCC测量] 开始拉取 {} 点，每批 {}，共 {} 批", names.size(), chunk, batches);
            }
            try {
                List<Map<String, Object>> raw = readWinCcInOrderedChunks(names, "测量");
                List<TelemetryTagItemDto> readings = mapRows(raw);
                if (readings.size() < names.size()) {
                    log.warn("[WinCC测量] WinCC 返回 {} 行，少于请求的 {} 个测量点；缺行沿用上次快照（若无则显示为空）",
                            readings.size(), names.size());
                }
                List<TelemetryTagItemDto> merged = mergeMeasurementsWithWinCcRows(names, readings, lastItems.get());
                List<TelemetryTagItemDto> mapped = enrichDisplayLabelsOnly(merged);
                Instant trendNow = Instant.now();
                long windowMs = Math.max(60_000L, properties.getTrendWindowMs());
                Instant cutoff = trendNow.minusMillis(windowMs);
                double dbAbs = Math.max(0d, properties.getTrendDeadbandAbs());
                double dbRel = Math.max(0d, properties.getTrendDeadbandRel());
                Set<String> trendSeen = new HashSet<>();
                for (TelemetryTagItemDto dto : mapped) {
                    if (dto == null || !StringUtils.hasText(dto.getVariableName())) {
                        continue;
                    }
                    String vn = dto.getVariableName().trim();
                    trendSeen.add(vn);
                    Double close = parseTelemetryNumeric(dto.getValue());
                    if (close == null) {
                        dto.setValueTrend(null);
                        continue;
                    }
                    ArrayDeque<ValueTrendSample> q = valueTrendWindows.computeIfAbsent(vn, k -> new ArrayDeque<>());
                    q.addLast(new ValueTrendSample(trendNow, close));
                    while (!q.isEmpty() && q.peekFirst().instant().isBefore(cutoff)) {
                        q.pollFirst();
                    }
                    ValueTrendSample first = q.peekFirst();
                    double open = first == null ? close : first.value();
                    dto.setValueTrend(computeSlidingWindowTrend(open, close, dbAbs, dbRel));
                }
                valueTrendWindows.keySet().removeIf(k -> !trendSeen.contains(k));
                lastItems.set(mapped);
                telemetryArchiveService.appendAfterRefresh(mapped, Instant.now(),
                        UUID.randomUUID().toString().replace("-", ""));
                lastSuccessAt.set(Instant.now());
                lastError.set(null);
                lastReachable.set(true);
                if (log.isDebugEnabled()) {
                    log.debug("[WinCC测量] 拉取完毕，解析 {} 行", mapped.size());
                }
                // 与 GET /animal-room（pollIntervalMs 周期拉）同源：通知 Web 重新读内存快照组装页
                snapshotBroadcastService.broadcastFullSnapshotRefreshed();
                jobScheduleConfigMapper.markSuccess(JobExecutionRegistry.JOB_TELEMETRY_WINCC_UI, LocalDateTime.now(), SCHED_TRACE);
            } catch (Exception e) {
                lastReachable.set(false);
                String msg = describeThrowableForLog(e);
                lastError.set(msg);
                log.warn("[WinCC测量] 拉取失败: {}", msg, e);
                jobScheduleConfigMapper.markFailed(JobExecutionRegistry.JOB_TELEMETRY_WINCC_UI, LocalDateTime.now(),
                        trimScheduleError(msg), SCHED_TRACE);
            }
        }
    }

    /**
     * 原 WinCC 限值低频拉取写入变量表缓存列；已停用——动物房报警限改为 {@code telemetry_global_alarm_limits} 全局配置。
     * 定时任务 {@code TELEMETRY_WINCC_LIMITS_UI} 仍可调用以保持「成功」心跳，但不访问 WinCC、不写库。
     */
    public void refreshLimitsFromWinCcAndPersist() {
        LocalDateTime runAt = LocalDateTime.now();
        jobScheduleConfigMapper.markRunning(JobExecutionRegistry.JOB_TELEMETRY_WINCC_LIMITS_UI, runAt, SCHED_TRACE);
        log.debug("[WinCC限值] 已停用：全局报警限模式，跳过 WinCC 限值拉取与入库");
        jobScheduleConfigMapper.markSuccess(JobExecutionRegistry.JOB_TELEMETRY_WINCC_LIMITS_UI, LocalDateTime.now(), SCHED_TRACE);
    }

    /**
     * 委托 {@link WinCcRestTagClient#readValues(List)} 按 {@code values-chunk-size} 分片 POST 并合并，
     * 避免外层再手动 subList 导致与客户端分片逻辑重复或调试时只改一条路径致使大批量拉取失效。
     */
    private List<Map<String, Object>> readWinCcInOrderedChunks(List<String> names, String logLabel) {
        int chunk = Math.max(1, properties.getValuesChunkSize());
        int total = names.size();
        int batches = (total + chunk - 1) / chunk;
        if (log.isDebugEnabled()) {
            log.debug("[WinCC{}] 合并 POST：共 {} 点，客户端按每批 {} 自动分 {} 批", logLabel, total, chunk, batches);
        }
        List<Map<String, Object>> merged = winCcRestTagClient.readValues(names);
        if (log.isDebugEnabled()) {
            log.debug("[WinCC{}] 合并 POST 完成，原始响应行数 {}", logLabel, merged.size());
        }
        return merged;
    }

    private static String trimScheduleError(String error) {
        if (error == null) {
            return "unknown";
        }
        String s = error.trim();
        return s.length() > 480 ? s.substring(0, 480) : s;
    }

    /**
     * 顺序两次 POST /Values：① 内置默认前 5 点（与早期控制台示例一致）② 当前 CSV/配置的 watchlist。
     * 不写入内存快照，仅用于对比超时/失败发生在「老点名」还是「新点名」或整网。
     */
    public TelemetrySequentialDiagnosticDto runSequentialBuiltInThenWatchlist() {
        if (!properties.isEnabled()) {
            return TelemetrySequentialDiagnosticDto.builder()
                    .winccEnabled(false)
                    .disabledReason(MSG_DISABLED)
                    .build();
        }
        synchronized (winCcRefreshLock) {
            if (log.isDebugEnabled()) {
                log.debug("[WinCC遥测][顺序诊断] 已占用与快照刷新相同的互斥锁，将连续 POST 两次（内置5点 → 当前清单）");
            }
            List<String> builtIn = WinCcProperties.defaultWatchlist();
            int n = Math.min(5, builtIn.size());
            List<String> step1Names = builtIn.subList(0, n);
            TelemetrySequentialDiagnosticDto.StepResult r1 = probeValues(
                    step1Names,
                    "① 内置默认前 " + n + " 点（控制台时代示例点名）");

            List<String> step2Names = watchlistLoader.resolveTagNames();
            TelemetrySequentialDiagnosticDto.StepResult r2 = probeValues(
                    step2Names,
                    "② 当前 watchlist（CSV 或 variable-names）");

            if (log.isDebugEnabled()) {
                log.debug("[WinCC遥测][顺序诊断] 完成：① success={} {}ms ② success={} {}ms",
                        r1.isSuccess(), r1.getDurationMs(), r2.isSuccess(), r2.getDurationMs());
            }

            return TelemetrySequentialDiagnosticDto.builder()
                    .winccEnabled(true)
                    .stepBuiltInDefaults(r1)
                    .stepWatchlist(r2)
                    .build();
        }
    }

    private TelemetrySequentialDiagnosticDto.StepResult probeValues(List<String> names, String label) {
        long t0 = System.currentTimeMillis();
        try {
            List<Map<String, Object>> raw = winCcRestTagClient.readValues(names);
            long ms = System.currentTimeMillis() - t0;
            TelemetrySequentialDiagnosticDto.StepResult r = TelemetrySequentialDiagnosticDto.StepResult.builder()
                    .label(label)
                    .variableCount(names.size())
                    .variablePreview(previewNames(names))
                    .success(true)
                    .durationMs(ms)
                    .responseRowCount(raw == null ? 0 : raw.size())
                    .errorMessage(null)
                    .build();
            if (log.isDebugEnabled()) {
                log.debug("[WinCC遥测][顺序诊断] {} → 成功 variableNames={} durationMs={} rows={}",
                        label, names.size(), ms, r.getResponseRowCount());
            }
            return r;
        } catch (Exception e) {
            long ms = System.currentTimeMillis() - t0;
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            log.warn("[WinCC遥测][顺序诊断] {} → 失败 durationMs={} {}", label, ms, msg);
            return TelemetrySequentialDiagnosticDto.StepResult.builder()
                    .label(label)
                    .variableCount(names.size())
                    .variablePreview(previewNames(names))
                    .success(false)
                    .durationMs(ms)
                    .responseRowCount(null)
                    .errorMessage(msg)
                    .build();
        }
    }

    private static List<String> previewNames(List<String> names) {
        if (names == null || names.isEmpty()) {
            return List.of();
        }
        int to = Math.min(2, names.size());
        return Collections.unmodifiableList(new ArrayList<>(names.subList(0, to)));
    }

    @EventListener(ApplicationReadyEvent.class)
    public void warmUpAfterReady() {
        if (properties.isEnabled()) {
            if (log.isDebugEnabled()) {
                log.debug("[WinCC遥测] 应用就绪，异步执行首次 WinCC 拉取");
            }
            CompletableFuture.runAsync(this::refreshFromWinCc);
        } else {
            log.info("[WinCC遥测] 应用就绪，WinCC 未启用（仅返回占位快照）。需在运行 Spring 的机器上配置 app.wincc.* 且该机器能访问 WinCC 主机）");
        }
    }

    /**
     * 测量值快照点名：database 源下仅拉主测量（限值由低频任务单独拉）；非 database 时维持原回退逻辑（整表点名）。
     */
    private List<String> resolveMeasurementTagNamesForSnapshotRefresh() {
        if (watchlistDbService.useDatabaseSource()) {
            return watchlistDbService.loadMeasurementWinccVariableNamesFromDb();
        }
        if (properties.isAllowNonDatabaseSnapshotPull()) {
            log.warn("[WinCC测量] watchlist-source 非 database，已开启 allow-non-database-snapshot-pull，使用 resolveTagNames 回退（含全部点名）");
            return watchlistLoader.resolveTagNames();
        }
        log.warn("[WinCC测量] 已跳过：watchlist-source 非 database");
        log.warn("[WinCC telemetry] measurement refresh SKIPPED: watchlist-source is not 'database'. "
                + "Fix: app.wincc.watchlist-source=database OR app.wincc.allow-non-database-snapshot-pull=true (dev only).");
        return null;
    }

    /**
     * 控制台非 UTF-8 时中文异常会变成问号；供 WARN 一行可读且便于搜英文关键词。
     */
    private static String describeThrowableForLog(Throwable e) {
        if (e == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        Throwable cur = e;
        for (int depth = 0; cur != null && depth < 5; depth++) {
            if (sb.length() > 0) {
                sb.append(" | ");
            }
            sb.append(cur.getClass().getSimpleName());
            String m = cur.getMessage();
            if (StringUtils.hasText(m)) {
                String safe = m.replaceAll("[^\\x20-\\x7E]", "?");
                if (safe.length() > 240) {
                    safe = safe.substring(0, 240) + "...";
                }
                sb.append(": ").append(safe);
            }
            cur = cur.getCause();
        }
        return sb.length() > 0 ? sb.toString() : e.getClass().getSimpleName();
    }

    /**
     * 测点清单保存后调用：在不请求 WinCC 的前提下，按当前库表映射刷新内存快照中的展示名与结构化字段。
     * 报警上下限不在此写入（见 {@link WatchlistAlarmLimitsFacadeService}）。
     */
    public void reapplyWatchlistEnrichmentToCachedSnapshot() {
        synchronized (winCcRefreshLock) {
            reapplyWatchlistEnrichmentToCachedSnapshotLocked();
        }
    }

    /**
     * 按数据库测量点顺序合并 WinCC 返回行：点名统一为 {@link TelemetryWatchlistDbService#normalizeWinCcVariableKey(String)}；
     * WinCC 缺行时沿用上一轮快照，避免 500 请求只解析出 498 行导致测点从内存快照消失。
     */
    private List<TelemetryTagItemDto> mergeMeasurementsWithWinCcRows(List<String> orderedMeasurementCanonNames,
                                                                     List<TelemetryTagItemDto> readings,
                                                                     List<TelemetryTagItemDto> previous) {
        Map<String, TelemetryTagItemDto> byCanon = new HashMap<>();
        if (readings != null) {
            for (TelemetryTagItemDto r : readings) {
                if (r == null || !StringUtils.hasText(r.getVariableName())) {
                    continue;
                }
                String k = TelemetryWatchlistDbService.normalizeWinCcVariableKey(r.getVariableName());
                if (StringUtils.hasText(k)) {
                    byCanon.put(k, r);
                }
            }
        }
        Map<String, TelemetryTagItemDto> prevByCanon = new HashMap<>();
        if (previous != null) {
            for (TelemetryTagItemDto p : previous) {
                if (p == null || !StringUtils.hasText(p.getVariableName())) {
                    continue;
                }
                String k = TelemetryWatchlistDbService.normalizeWinCcVariableKey(p.getVariableName());
                if (StringUtils.hasText(k)) {
                    prevByCanon.putIfAbsent(k, p);
                }
            }
        }
        List<TelemetryTagItemDto> out = new ArrayList<>();
        if (orderedMeasurementCanonNames == null) {
            return out;
        }
        for (String canon : orderedMeasurementCanonNames) {
            if (!StringUtils.hasText(canon)) {
                continue;
            }
            TelemetryTagItemDto fresh = byCanon.get(canon);
            TelemetryTagItemDto old = prevByCanon.get(canon);
            TelemetryTagItemDto base = TelemetryTagItemDto.builder().variableName(canon).build();
            if (fresh != null) {
                out.add(overlayWinCcReadingOnto(base, fresh));
            } else if (old != null) {
                out.add(shallowCopyTagItemRenamed(old, canon));
            } else {
                out.add(base);
            }
        }
        return out;
    }

    private static TelemetryTagItemDto shallowCopyTagItemRenamed(TelemetryTagItemDto x, String variableName) {
        if (x == null) {
            return TelemetryTagItemDto.builder().variableName(variableName).build();
        }
        return TelemetryTagItemDto.builder()
                .variableName(variableName)
                .displayLabel(x.getDisplayLabel())
                .bundleCode(x.getBundleCode())
                .bundleDisplayName(x.getBundleDisplayName())
                .floorCode(x.getFloorCode())
                .roomCanonical(x.getRoomCanonical())
                .metricKindCode(x.getMetricKindCode())
                .metricKindLabel(x.getMetricKindLabel())
                .kindRole(x.getKindRole())
                .alarmMinValue(null)
                .alarmMaxValue(null)
                .alarmMinVariableName(null)
                .alarmMaxVariableName(null)
                .alarmOutOfRange(null)
                .alarmBand(null)
                .valueTrend(x.getValueTrend())
                .watchlistTagId(x.getWatchlistTagId())
                .alarmOverrideMin(x.getAlarmOverrideMin())
                .alarmOverrideMax(x.getAlarmOverrideMax())
                .value(x.getValue())
                .timestamp(x.getTimestamp())
                .qualityCode(x.getQualityCode())
                .dataType(x.getDataType())
                .errorCode(x.getErrorCode())
                .error(x.getError())
                .build();
    }

    private void reapplyWatchlistEnrichmentToCachedSnapshotLocked() {
        List<TelemetryTagItemDto> cur = lastItems.get();
        if (cur == null || cur.isEmpty()) {
            return;
        }
        List<TelemetryTagItemDto> copy = new ArrayList<>(cur.size());
        for (TelemetryTagItemDto x : cur) {
            copy.add(shallowCopyTagItem(x));
        }
        enrichDisplayLabelsOnly(copy);
        lastItems.set(copy);
    }

    private static TelemetryTagItemDto shallowCopyTagItem(TelemetryTagItemDto x) {
        if (x == null) {
            return null;
        }
        return TelemetryTagItemDto.builder()
                .variableName(x.getVariableName())
                .displayLabel(x.getDisplayLabel())
                .bundleCode(x.getBundleCode())
                .bundleDisplayName(x.getBundleDisplayName())
                .floorCode(x.getFloorCode())
                .roomCanonical(x.getRoomCanonical())
                .metricKindCode(x.getMetricKindCode())
                .metricKindLabel(x.getMetricKindLabel())
                .kindRole(x.getKindRole())
                .alarmMinValue(null)
                .alarmMaxValue(null)
                .alarmMinVariableName(null)
                .alarmMaxVariableName(null)
                .alarmOutOfRange(null)
                .alarmBand(null)
                .valueTrend(x.getValueTrend())
                .watchlistTagId(x.getWatchlistTagId())
                .alarmOverrideMin(x.getAlarmOverrideMin())
                .alarmOverrideMax(x.getAlarmOverrideMax())
                .value(x.getValue())
                .timestamp(x.getTimestamp())
                .qualityCode(x.getQualityCode())
                .dataType(x.getDataType())
                .errorCode(x.getErrorCode())
                .error(x.getError())
                .build();
    }

    /** 仅合并展示名与结构化映射；报警上下限由 {@link WatchlistAlarmLimitsFacadeService} 在 HTTP 边界注入。 */
    private List<TelemetryTagItemDto> enrichDisplayLabelsOnly(List<TelemetryTagItemDto> items) {
        TelemetryWatchlistEnrichment en = watchlistDbService.loadActiveWatchlistEnrichment();
        if (en.isEmpty()) {
            return items;
        }
        Map<String, String> labels = en.getDisplayLabelByVariable();
        Map<String, String> bundleCodes = en.getBundleCodeByVariable();
        Map<String, String> bundleTitles = en.getBundleDisplayNameByVariable();
        Map<String, String> floors = en.getFloorCodeByVariable();
        Map<String, String> roomCanon = en.getRoomCanonicalByVariable();
        Map<String, String> kindCodes = en.getMetricKindCodeByVariable();
        Map<String, String> kindLabels = en.getMetricKindLabelByVariable();
        Map<String, String> kindRoles = en.getMetricKindRoleByVariable();
        Map<String, Long> tagIds = en.getWatchlistTagIdByVariable();
        for (TelemetryTagItemDto dto : items) {
            if (dto == null || !StringUtils.hasText(dto.getVariableName())) {
                continue;
            }
            String vn = dto.getVariableName().trim();
            String lb = labels.get(vn);
            if (StringUtils.hasText(lb)) {
                dto.setDisplayLabel(lb);
            }
            String bc = bundleCodes.get(vn);
            if (StringUtils.hasText(bc)) {
                dto.setBundleCode(bc);
            }
            String bt = bundleTitles.get(vn);
            if (StringUtils.hasText(bt)) {
                dto.setBundleDisplayName(bt);
            }
            String fl = floors.get(vn);
            if (StringUtils.hasText(fl)) {
                dto.setFloorCode(fl);
            }
            String rc = roomCanon.get(vn);
            if (StringUtils.hasText(rc)) {
                dto.setRoomCanonical(rc);
            }
            String kc = kindCodes.get(vn);
            if (StringUtils.hasText(kc)) {
                dto.setMetricKindCode(kc);
            }
            String kl = kindLabels.get(vn);
            if (StringUtils.hasText(kl)) {
                dto.setMetricKindLabel(kl);
            }
            String kr = kindRoles.get(vn);
            if (StringUtils.hasText(kr)) {
                dto.setKindRole(kr);
            }
            Long tid = tagIds.get(vn);
            if (tid != null) {
                dto.setWatchlistTagId(tid);
            }
        }
        return items;
    }

    /**
     * 窗内 open→close 方向；|差| 在死区内返回 {@code null}（平缓、前端不显示箭头），仅明显变化返回 UP/DOWN。
     */
    private static String computeSlidingWindowTrend(double open, double close, double deadbandAbs, double deadbandRel) {
        double db = Math.max(deadbandAbs, deadbandRel * Math.max(Math.abs(open), Math.abs(close)));
        double diff = close - open;
        if (Math.abs(diff) <= db) {
            return null;
        }
        return diff > 0 ? "UP" : "DOWN";
    }

    private record ValueTrendSample(Instant instant, double value) {
    }

    private static Double parseTelemetryNumeric(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        String t = raw.trim().replace(',', '.');
        try {
            return Double.parseDouble(t);
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static List<TelemetryTagItemDto> mapRows(List<Map<String, Object>> raw) {
        List<TelemetryTagItemDto> out = new ArrayList<>();
        if (raw == null) {
            return out;
        }
        for (Map<String, Object> row : raw) {
            if (row == null) {
                continue;
            }
            String vnRaw = str(row.get("variableName"));
            String vnNorm = TelemetryWatchlistDbService.normalizeWinCcVariableKey(vnRaw);
            if (!StringUtils.hasText(vnNorm)) {
                continue;
            }
            TelemetryTagItemDto dto = TelemetryTagItemDto.builder()
                    .variableName(vnNorm)
                    .value(str(row.get("value")))
                    .timestamp(str(row.get("timestamp")))
                    .qualityCode(firstNonNullStr(row, "qualitycode", "qualityCode"))
                    .dataType(asInt(row.get("dataType")))
                    .errorCode(asInt(row.get("errorcode")))
                    .error(str(row.get("error")))
                    .build();
            out.add(dto);
        }
        return out;
    }

    private static String firstNonNullStr(Map<String, Object> row, String... keys) {
        for (String k : keys) {
            for (Map.Entry<String, Object> e : row.entrySet()) {
                if (e.getKey() != null && e.getKey().equalsIgnoreCase(k) && e.getValue() != null) {
                    return String.valueOf(e.getValue());
                }
            }
        }
        return null;
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static Integer asInt(Object o) {
        if (o == null) {
            return null;
        }
        if (o instanceof Number n) {
            return n.intValue();
        }
        if (o instanceof String s && StringUtils.hasText(s)) {
            try {
                return Integer.parseInt(s.trim());
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }
}
