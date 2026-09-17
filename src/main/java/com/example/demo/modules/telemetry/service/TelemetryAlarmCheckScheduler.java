package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.notification.push.digest.DigestResolutionService;
import com.example.demo.modules.notification.push.digest.DigestScheduler;
import com.example.demo.modules.notification.push.digest.NotifyDigestItem;
import com.example.demo.modules.notification.push.digest.NotifyDigestItemMapper;
import com.example.demo.modules.notification.push.dispatch.PushRecipientResolver;
import com.example.demo.modules.notification.push.source.NotifySource;
import com.example.demo.modules.notification.push.source.NotifySourceService;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryGlobalAlarmLimitsDto;
import com.example.demo.modules.telemetry.entity.TelemetryAlarmLog;
import com.example.demo.modules.telemetry.entity.TelemetryFloorAlarmConfig;
import com.example.demo.modules.telemetry.entity.TelemetrySuiteAlarmConfig;
import com.example.demo.modules.telemetry.entity.TelemetryWatchlistTagRow;
import com.example.demo.modules.telemetry.mapper.TelemetryAlarmLogMapper;
import com.example.demo.modules.telemetry.mapper.TelemetryWatchlistTagMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * 动物房环境报警调度。
 *
 * <p>每 60 秒扫一遍监控点，判定交给 {@link TelemetryAlarmBandEvaluator}（纯函数状态机）。
 * 报警与恢复都在内存缓冲里按（变量 × 方向）去重，攒满 buffer_flush_minutes 后统一处理。
 *
 * <p>台账 telemetry_alarm_log 逐条写入，报警与恢复都写；它同时是下一轮判定"上次状态"的依据。
 * 通知按接收人写 notify_digest_item 明细项，由 DigestScheduler 按源的聚合配置合并成一条发出；
 * 聚合被关时整源回退即时推送。
 */
@Service
public class TelemetryAlarmCheckScheduler {

    private static final Logger log = LoggerFactory.getLogger(TelemetryAlarmCheckScheduler.class);
    private static final Set<String> MONITORED_KINDS = Set.of("TEMP", "HUM", "RH", "PRESSURE", "WIND", "SWITCH", "STATUS");
    private static String canonicalMetricKind(String kind) {
        if (kind == null) return null;
        String u = kind.trim().toUpperCase(Locale.ROOT);
        if ("RH".equals(u)) return "HUM";
        return MONITORED_KINDS.contains(u) ? u : null;
    }

    // ── 依赖 ──

    private final TelemetryWatchlistTagMapper watchlistTagMapper;
    private final TelemetryAlarmLogMapper alarmLogMapper;
    private final TelemetryAlarmConfigService alarmConfigService;
    private final TelemetryGlobalAlarmLimitsService globalLimitsService;
    private final TelemetrySnapshotService snapshotService;
    private final NotifyDigestItemMapper digestItemMapper;
    private final NotifySourceService sourceService;
    private final PushRecipientResolver recipientResolver;
    private final DigestResolutionService digestResolutionService;
    private final DigestScheduler digestScheduler;

    public TelemetryAlarmCheckScheduler(TelemetryWatchlistTagMapper watchlistTagMapper,
                                        TelemetryAlarmLogMapper alarmLogMapper,
                                        TelemetryAlarmConfigService alarmConfigService,
                                        TelemetryGlobalAlarmLimitsService globalLimitsService,
                                        TelemetrySnapshotService snapshotService,
                                        NotifyDigestItemMapper digestItemMapper,
                                        NotifySourceService sourceService,
                                        PushRecipientResolver recipientResolver,
                                        DigestResolutionService digestResolutionService,
                                        DigestScheduler digestScheduler) {
        this.watchlistTagMapper = watchlistTagMapper;
        this.alarmLogMapper = alarmLogMapper;
        this.alarmConfigService = alarmConfigService;
        this.globalLimitsService = globalLimitsService;
        this.snapshotService = snapshotService;
        this.digestItemMapper = digestItemMapper;
        this.sourceService = sourceService;
        this.recipientResolver = recipientResolver;
        this.digestResolutionService = digestResolutionService;
        this.digestScheduler = digestScheduler;
    }

    // ── 内存缓冲 ──

    /** key = variableName|alarmBand，value = 最新报警项 */
    private final Map<String, AlarmItem> alarmBuffer = new ConcurrentHashMap<>();
    /** 恢复项队列 */
    private final Map<String, AlarmItem> recoveryBuffer = new ConcurrentHashMap<>();
    private volatile LocalDateTime lastFlushTime = null;

    @PostConstruct
    public void init() {
        log.info("[遥测报警] 调度器已创建，缓冲冷却按楼层配置，首次检测将在 120s 后执行");
    }

    @Scheduled(fixedDelay = 60_000, initialDelay = 120_000)
    public void check() {
        try {
            doCheck();
        } catch (Exception e) {
            log.error("[遥测报警] 定时检测异常", e);
        }
    }

    // ── 报警项 DTO ──

    private record AlarmItem(String floorCode, String roomName, String variableName,
                             String metricKind, String alarmBand, String alarmDirection,
                             String currentValue, String limitValue, long sustainedMinutes,
                             boolean recovery, boolean shouldNotify, String oldValue) {
        String dedupKey() { return variableName + "|" + alarmBand; }
    }

    private void doCheck() {
        // ── 1. 检测 ──
        List<TelemetryWatchlistTagRow> allRows = watchlistTagMapper.selectAllEnabledTagsJoinedBundlesOrdered();
        if (allRows == null || allRows.isEmpty()) {
            log.info("[遥测报警] watchlist 为空，跳过");
            return;
        }

        List<TelemetryWatchlistTagRow> monitored = allRows.stream()
                .filter(r -> r != null && StringUtils.hasText(r.getWinccVariableName()))
                .filter(r -> canonicalMetricKind(r.getMetricKindCode()) != null)
                .filter(r -> !"LIMIT_MIN".equalsIgnoreCase(trim(r.getMetricKindRole()))
                        && !"LIMIT_MAX".equalsIgnoreCase(trim(r.getMetricKindRole())))
                .filter(r -> !isLimitSuffixVariable(r.getWinccVariableName()))
                .filter(r -> StringUtils.hasText(r.getFloorCode()))
                .toList();
        if (monitored.isEmpty()) {
            log.info("[遥测报警] 过滤后无可监控变量（{} 行被过滤）", allRows.size());
            return;
        }
        log.info("[遥测报警] 过滤后 {} 个可监控变量", monitored.size());

        TelemetryGlobalAlarmLimitsDto globalLimits = globalLimitsService.load();
        Map<String, String> snapshotValues = buildSnapshotValueMap();

        Map<String, List<TelemetryWatchlistTagRow>> byFloor = new LinkedHashMap<>();
        for (TelemetryWatchlistTagRow r : monitored) {
            String fc = TelemetryAlarmConfigService.normalizeFloorCode(r.getFloorCode());
            byFloor.computeIfAbsent(fc, k -> new ArrayList<>()).add(r);
        }

        int skipped = 0;
        for (var entry : byFloor.entrySet()) {
            String floorCode = entry.getKey();
            List<TelemetryWatchlistTagRow> floorRows = entry.getValue();

            TelemetryFloorAlarmConfig floorCfg = alarmConfigService.getFloorByCode(floorCode);
            if (floorCfg != null && floorCfg.getEnabled() != null && floorCfg.getEnabled() != 1) {
                skipped += floorRows.size(); continue;
            }
            if (floorCfg == null) floorCfg = alarmConfigService.ensureFloor(floorCode);

            int renotifyIntervalMin = floorCfg.getCooldownMinutes() != null
                    ? floorCfg.getCooldownMinutes() : 360;
            boolean notifyRecovery = floorCfg.getNotifyOnRecovery() != null && floorCfg.getNotifyOnRecovery() == 1;

            Map<String, List<TelemetryWatchlistTagRow>> bySuite = new LinkedHashMap<>();
            for (TelemetryWatchlistTagRow r : floorRows) {
                String sn = TelemetryAlarmConfigService.resolveSuiteNorm(floorCode, r.getRoomCanonical());
                bySuite.computeIfAbsent(sn, k -> new ArrayList<>()).add(r);
            }

            for (var suiteEntry : bySuite.entrySet()) {
                String suiteNorm = suiteEntry.getKey();
                List<TelemetryWatchlistTagRow> suiteRows = suiteEntry.getValue();

                TelemetrySuiteAlarmConfig suiteCfg = alarmConfigService.getSuiteByNorm(suiteNorm);
                if (suiteCfg != null && suiteCfg.getEnabled() != null && suiteCfg.getEnabled() != 1) {
                    skipped += suiteRows.size(); continue;
                }

                for (TelemetryWatchlistTagRow row : suiteRows) {
                    if (row.getAlarmEnabled() != null && row.getAlarmEnabled() == 0) { skipped++; continue; }

                    AlarmItem item = evaluateVariable(row, floorCode, suiteNorm, suiteCfg, globalLimits,
                            snapshotValues, renotifyIntervalMin, notifyRecovery);
                    if (item != null) {
                        // 内存缓冲（按 dedupKey 覆盖，保留最新值）
                        if (item.recovery()) {
                            recoveryBuffer.put(item.dedupKey(), item);
                        } else {
                            alarmBuffer.put(item.dedupKey(), item);
                        }
                    } else {
                        skipped++;
                    }
                }
            }
        }

        // ── 2. 判断是否到 flush 时间 ──
        // 取所有活跃楼层中最小的 buffer_flush_minutes 作为 flush 间隔
        int minBufferMinutes = 5; // 兜底默认
        for (var entry : byFloor.entrySet()) {
            TelemetryFloorAlarmConfig fCfg = alarmConfigService.getFloorByCode(entry.getKey());
            if (fCfg != null && fCfg.getBufferFlushMinutes() != null && fCfg.getBufferFlushMinutes() > 0
                    && fCfg.getBufferFlushMinutes() < minBufferMinutes) {
                minBufferMinutes = fCfg.getBufferFlushMinutes();
            }
        }

        boolean shouldFlush = lastFlushTime == null
                || Duration.between(lastFlushTime, LocalDateTime.now()).toMinutes() >= minBufferMinutes;

        if (!shouldFlush) {
            log.info("[遥测报警] 内存缓冲中（{} 报警 {} 恢复），距上次 flush {}s，{} 跳过",
                    alarmBuffer.size(), recoveryBuffer.size(),
                    lastFlushTime != null ? Duration.between(lastFlushTime, LocalDateTime.now()).toSeconds() : 0,
                    skipped);
            return;
        }

        // ── 3. 到点冲刷 ──
        List<AlarmItem> alarms = List.copyOf(alarmBuffer.values());
        List<AlarmItem> recoveries = List.copyOf(recoveryBuffer.values());
        alarmBuffer.clear();
        recoveryBuffer.clear();
        lastFlushTime = LocalDateTime.now();

        if (alarms.isEmpty() && recoveries.isEmpty()) {
            log.info("[遥测报警] 检测完成: 0 报警 0 恢复 {} 跳过", skipped);
            return;
        }

        // ── 台账：报警与恢复都写 ──
        // 恢复行是下一轮判定"上次状态"的依据；不写的话 lastBand 永远停在 HIGH，
        // 下次越限会被当成"仍在持续"而漏报真实报警。
        for (AlarmItem it : alarms) alarmLogMapper.insert(toLogEntry(it));
        for (AlarmItem it : recoveries) alarmLogMapper.insert(toLogEntry(it));

        // ── 通知：聚合或即时，按源决定；恢复是否外发由楼层开关决定 ──
        emit("TELEMETRY_ALARM", alarms);
        emit("TELEMETRY_RECOVERY", recoveries.stream().filter(AlarmItem::shouldNotify).toList());

        // 清理旧日志
        try { alarmLogMapper.deleteOlderThan(LocalDateTime.now().minusDays(7)); }
        catch (Exception e) { log.debug("[遥测报警] 清理旧日志: {}", e.getMessage()); }

        log.info("[遥测报警] Flush 完成: {} 报警 {} 恢复 {} 跳过（{} 楼层）",
                alarms.size(), recoveries.size(), skipped, byFloor.size());
    }

    private TelemetryAlarmLog toLogEntry(AlarmItem it) {
        TelemetryAlarmLog e = new TelemetryAlarmLog();
        e.setVariableName(it.variableName());
        e.setFloorCode(it.floorCode());
        e.setRoomCanonical(it.roomName());
        e.setMetricKind(it.metricKind());
        e.setAlarmBand(it.alarmBand());
        e.setCurrentValue(it.currentValue());
        e.setLimitValue(it.limitValue());
        e.setSentAt(LocalDateTime.now());
        return e;
    }

    /**
     * 把一批事件投出去。
     *
     * <p>组装方式只有一种：按接收人写聚合明细项。聚合开关从"要不要聚合"降级为"窗口多长"——
     * 开启时由 DigestScheduler 按 minutely_interval 发，关闭时立刻冲刷该源。
     * 两种模式都是**每个缓冲周期一条消息**，不会退化成逐条推送。
     * （即时路径在结构上无法表达一批：它的入参是扁平的单个 map，没有"行"。）
     */
    private void emit(String sourceCode, List<AlarmItem> items) {
        if (items.isEmpty()) return;
        // 一屏表里，同一房间的温/湿/压原本会随检测顺序散落在各处。按 楼层 → 房间 → 指标 排一遍，
        // 同房间的行就相邻了，读的人一眼能看出"这个房间有几个指标不正常"。
        items = items.stream()
                .sorted(java.util.Comparator.comparing(AlarmItem::floorCode)
                        .thenComparing(AlarmItem::roomName)
                        .thenComparing(AlarmItem::metricKind))
                .toList();
        NotifySource src;
        try {
            src = sourceService.getByCode(sourceCode);
        } catch (Exception e) {
            log.warn("[遥测报警] 取通知源 {} 失败: {}", sourceCode, e.getMessage());
            return;
        }
        if (src == null || src.getEnabled() == null || src.getEnabled() != 1) {
            log.info("[遥测报警] 通知源 {} 未启用，跳过 {} 条（检测与台账不受影响）",
                    sourceCode, items.size());
            return;
        }

        Set<String> recipients = recipientResolver.resolve(src.getId(), null);
        if (recipients.isEmpty()) {
            log.info("[遥测报警] 通知源 {} 没有接收人，跳过 {} 条", sourceCode, items.size());
            return;
        }

        for (String uid : recipients) {
            // 表头只在本接收人本源的待发队列为空时并入第一行，保证一组表恰好一个表头。
            // 若上一批还没被投递（待发队列非空），它已经带了表头，这批就不能再带。
            boolean needHeader = digestItemMapper.countPending(uid, sourceCode) == 0;
            for (AlarmItem it : items) {
                String content = lineOf(it);
                if (needHeader) {
                    content = TelemetryAlarmLineFormatter.tableHeader() + "\n" + content;
                    needHeader = false;
                }
                NotifyDigestItem item = new NotifyDigestItem();
                item.setUserId(uid);
                item.setSourceCode(sourceCode);
                item.setChannelCode("ALL");
                item.setTitle(content);
                item.setContent(content);
                digestItemMapper.insert(item);
            }
        }

        if (!digestResolutionService.isSourceAggregatedNow(sourceCode)) {
            // 未启用聚合：立刻冲刷，让内存缓冲攒下的这一批仍然只出一条消息
            log.info("[遥测报警] {} 未启用聚合，{} 条立刻冲刷（{} 个接收人）",
                    sourceCode, items.size(), recipients.size());
            digestScheduler.flushSourcesNow(Set.of(sourceCode));
        } else {
            log.info("[遥测报警] {} 共 {} 条进聚合队列，{} 个接收人",
                    sourceCode, items.size(), recipients.size());
        }
    }

    /** 聚合明细的单行文案（Markdown 表格的一行）。 */
    private static String lineOf(AlarmItem it) {
        if (it.recovery()) {
            return TelemetryAlarmLineFormatter.recoveryRow(it.roomName(), it.metricKind(), it.currentValue());
        }
        if ("CHANGE".equals(it.alarmBand())) {
            return TelemetryAlarmLineFormatter.changeRow(it.roomName(), it.metricKind(),
                    it.oldValue(), it.currentValue());
        }
        if (it.sustainedMinutes() > 0) {
            return TelemetryAlarmLineFormatter.renotifyRow(it.roomName(), it.metricKind(), it.alarmBand(),
                    it.sustainedMinutes(), it.currentValue(), it.limitValue());
        }
        return TelemetryAlarmLineFormatter.alarmRow(it.roomName(), it.metricKind(), it.alarmBand(),
                it.currentValue(), it.limitValue());
    }

    // ── 单变量评估 ──

    private AlarmItem evaluateVariable(
            TelemetryWatchlistTagRow row, String floorCode, String suiteNorm,
            TelemetrySuiteAlarmConfig suiteCfg, TelemetryGlobalAlarmLimitsDto globalLimits,
            Map<String, String> snapshotValues, int renotifyIntervalMin, boolean notifyRecovery) {

        String variableName = row.getWinccVariableName().trim();
        String metricKind = canonicalMetricKind(row.getMetricKindCode());
        String roomName = TelemetryAlarmConfigService.localPartRoom(
                row.getRoomCanonical() != null ? row.getRoomCanonical() : "");

        String currentValue = snapshotValues.get(variableName);
        if (!StringUtils.hasText(currentValue)) return null;

        // 布尔量（开关/状态）没有阈值，按"值变化"报警，走独立路径
        if ("SWITCH".equals(metricKind) || "STATUS".equals(metricKind)) {
            return evaluateBooleanVariable(floorCode, roomName, variableName, metricKind, currentValue);
        }

        var limits = alarmConfigService.resolveEffectiveLimits(suiteNorm, metricKind,
                row.getAlarmOverrideMin(), row.getAlarmOverrideMax(), globalLimits, suiteCfg);

        Double current = parseNumeric(currentValue);
        if (current == null) return null;
        Double limitMin = parseNumeric(limits.minValue());
        Double limitMax = parseNumeric(limits.maxValue());
        if (limitMin == null && limitMax == null) return null;

        Double hysteresis = parseNumeric(limits.hysteresisValue());
        if (hysteresis == null || hysteresis < 0) hysteresis = 0.0;

        // 逐变量重提醒间隔覆盖楼层值；逐变量未配（0 或 null）时用楼层值
        int effectiveRenotify = renotifyIntervalMin;
        Integer tagInterval = row.getAlarmCooldownMinutes();
        if (tagInterval != null && tagInterval > 0) effectiveRenotify = tagInterval;

        TelemetryAlarmLog lastAny = alarmLogMapper.findLastByVariable(variableName);
        String lastBand = lastAny != null ? lastAny.getAlarmBand() : null;
        LocalDateTime lastNotifiedAt = lastAny != null ? lastAny.getSentAt() : null;

        // 只有处在报警状态时才需要查本轮起点，避免每个点每轮都多查一次
        LocalDateTime streakStart = ("HIGH".equals(lastBand) || "LOW".equals(lastBand))
                ? alarmLogMapper.findStreakStart(variableName, lastBand)
                : null;

        var outcome = TelemetryAlarmBandEvaluator.evaluate(new TelemetryAlarmBandEvaluator.Input(
                lastBand, lastNotifiedAt, streakStart, LocalDateTime.now(),
                current, limitMin, limitMax, hysteresis, effectiveRenotify));

        if (outcome.eventType() == TelemetryAlarmBandEvaluator.EventType.NONE) return null;

        String metricKindDisplay = metricKindDisplay(metricKind);
        String valWithUnit = TelemetryAlarmLineFormatter.appendUnit(currentValue, metricKind);
        boolean isRecovery = outcome.eventType() == TelemetryAlarmBandEvaluator.EventType.RECOVERY;
        // 恢复行总要写台账（状态需要复位，否则下次越限会被当成"仍在持续"而漏报）；
        // 是否对外发恢复通知由楼层开关决定。
        boolean shouldNotify = !isRecovery || notifyRecovery;
        String limitDisplay = isRecovery ? null
                : ("HIGH".equals(outcome.band()) ? limits.maxValue() : limits.minValue());

        return new AlarmItem(floorCode, roomName, variableName, metricKindDisplay,
                outcome.band(), outcome.direction(), valWithUnit, limitDisplay,
                outcome.sustainedMinutes(), isRecovery, shouldNotify, null);
    }

    /** 指标类型的显示名（类型格文字）。 */
    private static String metricKindDisplay(String metricKind) {
        return switch (metricKind) {
            case "TEMP" -> "温度"; case "HUM" -> "湿度"; case "PRESSURE" -> "压强";
            case "WIND" -> "风量"; case "SWITCH" -> "开关"; case "STATUS" -> "状态";
            default -> metricKind;
        };
    }

    /**
     * 布尔量（开关/状态）按"值变化"报警，与阈值/滞回/重提醒都无关。
     *
     * <p>首次观测只写台账做基准、不产生事件；有历史且归一化后不同才报变化。变化事件的
     * {@code current_value} 写新值（作下次基准），行里读数格再拼 旧→新。
     */
    private AlarmItem evaluateBooleanVariable(String floorCode, String roomName, String variableName,
                                              String metricKind, String currentValue) {
        String display = metricKindDisplay(metricKind);
        TelemetryAlarmLog lastAny = alarmLogMapper.findLastByVariable(variableName);
        String lastValue = lastAny != null ? lastAny.getCurrentValue() : null;
        var change = TelemetryAlarmLineFormatter.booleanChange(metricKind, currentValue, lastValue);

        switch (change.kind()) {
            case SKIP, NO_CHANGE -> { return null; }
            case BASELINE -> {
                // 首次观测：写台账记基准，否则永远没有可比对的"上次值"，这个点就永远不报变化
                alarmLogMapper.insert(booleanLog(variableName, floorCode, roomName, display, change.normalized()));
                return null;
            }
            case CHANGE -> {
                return new AlarmItem(floorCode, roomName, variableName, display,
                        "CHANGE", null, change.normalized(), null, 0L, false, true, lastValue);
            }
        }
        return null;
    }

    /** 布尔量台账行：band=CHANGE，current_value=归一化显示值，limit_value 恒为空。 */
    private TelemetryAlarmLog booleanLog(String variableName, String floorCode, String roomName,
                                         String metricKindDisplay, String normalizedValue) {
        TelemetryAlarmLog e = new TelemetryAlarmLog();
        e.setVariableName(variableName);
        e.setFloorCode(floorCode);
        e.setRoomCanonical(roomName);
        e.setMetricKind(metricKindDisplay);
        e.setAlarmBand("CHANGE");
        e.setCurrentValue(normalizedValue);
        e.setSentAt(LocalDateTime.now());
        return e;
    }

    // ── 快照 ──

    private Map<String, String> buildSnapshotValueMap() {
        Map<String, String> map = new LinkedHashMap<>();
        try {
            var snap = snapshotService.getSnapshot();
            if (snap != null && snap.getItems() != null) {
                for (var it : snap.getItems()) {
                    if (it != null && StringUtils.hasText(it.getVariableName()) && StringUtils.hasText(it.getValue())) {
                        map.put(it.getVariableName().trim(), it.getValue().trim());
                    }
                }
            }
        } catch (Exception e) { log.debug("[遥测报警] 快照读取失败: {}", e.getMessage()); }
        return map;
    }

    // ── 工具 ──

    private static String trim(String s) { return s == null ? "" : s.trim(); }
    private static boolean isLimitSuffixVariable(String v) {
        if (v == null) return false;
        return v.trim().endsWith("_TT_Floor") || v.trim().endsWith("_TT_Top")
                || v.trim().endsWith("_RH_Floor") || v.trim().endsWith("_RH_Top")
                || v.trim().endsWith("_PT_Floor") || v.trim().endsWith("_PT_Top");
    }
    private static Double parseNumeric(String raw) {
        if (!StringUtils.hasText(raw)) return null;
        String t = raw.trim().replace(',', '.');
        var m = java.util.regex.Pattern.compile("(-?\\d+(?:\\.\\d*)?)").matcher(t);
        if (m.find()) {
            try { return Double.parseDouble(m.group(1)); }
            catch (NumberFormatException ignored) {}
        }
        return null;
    }
}
