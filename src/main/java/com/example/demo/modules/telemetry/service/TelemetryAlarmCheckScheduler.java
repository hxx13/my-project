package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.notification.push.digest.NotifyDigestItem;
import com.example.demo.modules.notification.push.digest.NotifyDigestItemMapper;
import com.example.demo.modules.notification.push.dispatch.PushService;
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
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * 动物房环境报警 — 三层缓存架构：
 * <pre>
 *   Layer 1: pushService.send() 即时推送
 *     信息源自带渠道派发，汇总后仅调用一次
 *
 *   Layer 2: 内存缓冲 + 5min 冷却（同向去重）
 *     alarmBuffer: 同变量同方向合并，5min 内只保留最新
 *     recoveryBuffer: 独立存储，防止恢复通知高频轰炸
 *     flush: 写 alarm_log + 调用 Layer-1 推送 + 写入 Layer-3 缓冲
 *
 *   Layer 3: notify_digest_item → DigestScheduler 聚合通知
 *     轮询间隔 ≥ Layer-2 冷却 (5min)，防止轮询短于预缓存周期
 * </pre>
 */
@Service
public class TelemetryAlarmCheckScheduler {

    private static final Logger log = LoggerFactory.getLogger(TelemetryAlarmCheckScheduler.class);
    private static final Set<String> MONITORED_KINDS = Set.of("TEMP", "HUM", "RH", "PRESSURE");
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
    private final PushService pushService;
    private final NotifyDigestItemMapper digestItemMapper;

    public TelemetryAlarmCheckScheduler(TelemetryWatchlistTagMapper watchlistTagMapper,
                                        TelemetryAlarmLogMapper alarmLogMapper,
                                        TelemetryAlarmConfigService alarmConfigService,
                                        TelemetryGlobalAlarmLimitsService globalLimitsService,
                                        TelemetrySnapshotService snapshotService,
                                        PushService pushService,
                                        NotifyDigestItemMapper digestItemMapper) {
        this.watchlistTagMapper = watchlistTagMapper;
        this.alarmLogMapper = alarmLogMapper;
        this.alarmConfigService = alarmConfigService;
        this.globalLimitsService = globalLimitsService;
        this.snapshotService = snapshotService;
        this.pushService = pushService;
        this.digestItemMapper = digestItemMapper;
    }

    // ── Layer-1 内存缓冲 ──

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
                             String currentValue, String limitValue) {
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

            int resetCooldownMin = floorCfg.getCooldownMinutes() != null ? floorCfg.getCooldownMinutes() : 60;
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

                    // ── 逐变量重报警冷却 ──
                    Integer cooldown = row.getAlarmCooldownMinutes();
                    if (cooldown != null && cooldown > 0) {
                        TelemetryAlarmLog lastAlarm = alarmLogMapper.findLastAlarmByVariable(row.getWinccVariableName());
                        if (lastAlarm != null && lastAlarm.getSentAt() != null) {
                            long minutesSinceLastAlarm = Duration.between(lastAlarm.getSentAt(), LocalDateTime.now()).toMinutes();
                            if (minutesSinceLastAlarm < cooldown) {
                                skipped++; continue; // 冷却中，跳过本次检测
                            }
                        }
                    }

                    AlarmItem item = evaluateVariable(row, floorCode, suiteNorm, suiteCfg, globalLimits,
                            snapshotValues, resetCooldownMin, notifyRecovery);
                    if (item != null) {
                        // ── Layer-1: 内存缓冲（按 dedupKey 覆盖，保留最新值）──
                        if ("OK".equals(item.alarmBand)) {
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
            log.info("[遥测报警] Layer-2 缓冲中（{} 报警 {} 恢复），距上次 flush {}s，{} 跳过",
                    alarmBuffer.size(), recoveryBuffer.size(),
                    lastFlushTime != null ? Duration.between(lastFlushTime, LocalDateTime.now()).toSeconds() : 0,
                    skipped);
            return;
        }

        // ── 3. Flush Layer-1 → Layer-2 ──
        List<AlarmItem> alarms = List.copyOf(alarmBuffer.values());
        List<AlarmItem> recoveries = List.copyOf(recoveryBuffer.values());
        alarmBuffer.clear();
        recoveryBuffer.clear();
        lastFlushTime = LocalDateTime.now();

        if (alarms.isEmpty() && recoveries.isEmpty()) {
            log.info("[遥测报警] 检测完成: 0 报警 0 恢复 {} 跳过", skipped);
            return;
        }

        // 批量写 alarm_log
        for (AlarmItem it : alarms) {
            TelemetryAlarmLog e = new TelemetryAlarmLog();
            e.setVariableName(it.variableName); e.setFloorCode(it.floorCode); e.setRoomCanonical(it.roomName);
            e.setMetricKind(it.metricKind); e.setAlarmBand(it.alarmBand);
            e.setCurrentValue(it.currentValue); e.setLimitValue(it.limitValue); e.setSentAt(LocalDateTime.now());
            alarmLogMapper.insert(e);
        }

        // 清旧缓冲残留（旧格式 / 上次未发送的）
        try { digestItemMapper.deletePendingBySource("TELEMETRY_ALARM"); } catch (Exception ignored) {}
        try { digestItemMapper.deletePendingBySource("TELEMETRY_RECOVERY"); } catch (Exception ignored) {}

        // ── Layer-2: 逐条写入 notify_digest_item（完整明细）──
        for (AlarmItem it : alarms) {
            NotifyDigestItem item = new NotifyDigestItem();
            item.setUserId("ALL_DIGEST");
            item.setSourceCode("TELEMETRY_ALARM");
            item.setChannelCode("ALL");
            item.setTitle(it.floorCode + " " + it.roomName + " " + it.metricKind + it.alarmDirection);
            item.setContent(it.floorCode + " · " + it.roomName + "  "
                    + it.metricKind + it.alarmDirection + "  "
                    + it.currentValue + "（阈值 " + it.limitValue + "）");
            digestItemMapper.insert(item);
        }
        for (AlarmItem it : recoveries) {
            NotifyDigestItem item = new NotifyDigestItem();
            item.setUserId("ALL_DIGEST");
            item.setSourceCode("TELEMETRY_RECOVERY");
            item.setChannelCode("ALL");
            item.setTitle(it.floorCode + " " + it.roomName + " " + it.metricKind + " 已恢复正常");
            item.setContent(it.floorCode + " · " + it.roomName + "  "
                    + it.metricKind + " 已恢复正常  "
                    + it.currentValue);
            digestItemMapper.insert(item);
        }

        // ── Layer-3: 逐条即时推送（每条独立变量值，模板正常渲染）──
        DateTimeFormatter readableDt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
        String nowFmt = LocalDateTime.now().format(readableDt);
        for (AlarmItem it : alarms) {
            try {
                pushService.send("TELEMETRY_ALARM", Map.of(
                        "floorCode", it.floorCode, "roomName", it.roomName,
                        "metricKind", it.metricKind, "alarmDirection", it.alarmDirection,
                        "currentValue", it.currentValue, "limitValue", it.limitValue,
                        "sentAt", nowFmt));
            } catch (Exception e) { log.warn("[遥测报警] 单条推送失败: {}", e.getMessage()); }
        }
        for (AlarmItem it : recoveries) {
            try {
                pushService.send("TELEMETRY_RECOVERY", Map.of(
                        "floorCode", it.floorCode, "roomName", it.roomName,
                        "metricKind", it.metricKind, "currentValue", it.currentValue,
                        "recoveryAt", nowFmt));
            } catch (Exception e) { log.warn("[遥测报警] 恢复推送失败: {}", e.getMessage()); }
        }

        // 清理旧日志
        try { alarmLogMapper.deleteOlderThan(LocalDateTime.now().minusDays(7)); }
        catch (Exception e) { log.debug("[遥测报警] 清理旧日志: {}", e.getMessage()); }

        log.info("[遥测报警] Flush 完成: {} 报警 {} 恢复 {} 跳过（{} 楼层）",
                alarms.size(), recoveries.size(), skipped, byFloor.size());
    }

    // ── 单变量评估 ──

    private AlarmItem evaluateVariable(
            TelemetryWatchlistTagRow row, String floorCode, String suiteNorm,
            TelemetrySuiteAlarmConfig suiteCfg, TelemetryGlobalAlarmLimitsDto globalLimits,
            Map<String, String> snapshotValues, int resetCooldownMin, boolean notifyRecovery) {

        String variableName = row.getWinccVariableName().trim();
        String metricKind = canonicalMetricKind(row.getMetricKindCode());
        String roomName = TelemetryAlarmConfigService.localPartRoom(
                row.getRoomCanonical() != null ? row.getRoomCanonical() : "");

        var limits = alarmConfigService.resolveEffectiveLimits(suiteNorm, metricKind,
                row.getAlarmOverrideMin(), row.getAlarmOverrideMax(), globalLimits, suiteCfg);

        String currentValue = snapshotValues.get(variableName);
        if (!StringUtils.hasText(currentValue)) return null;

        Double current = parseNumeric(currentValue);
        if (current == null) return null;
        Double limitMin = parseNumeric(limits.minValue());
        Double limitMax = parseNumeric(limits.maxValue());

        String newBand, limitDisplay, direction;

        // 解析滞回值
        Double hysteresis = parseNumeric(limits.hysteresisValue());
        if (hysteresis == null || hysteresis < 0) hysteresis = 0.0;

        // 查上次报警状态用于滞回判断
        TelemetryAlarmLog lastAny = alarmLogMapper.findLastByVariable(variableName);
        String lastBand = lastAny != null ? lastAny.getAlarmBand() : null;
        LocalDateTime lastSentAt = lastAny != null ? lastAny.getSentAt() : null;

        // 超过 resetCooldownMin 自动重置为 OK，允许再次报警
        // Bug fix: 当逐变量冷却周期 < 楼层重置周期时，取较小值，确保冷却到期后状态机不会错误阻塞
        int effectiveResetMin = resetCooldownMin;
        Integer tagCooldown = row.getAlarmCooldownMinutes();
        if (tagCooldown != null && tagCooldown > 0 && tagCooldown < effectiveResetMin) {
            effectiveResetMin = tagCooldown;
        }
        if (lastBand != null && !"OK".equals(lastBand) && lastSentAt != null
                && Duration.between(lastSentAt, LocalDateTime.now()).toMinutes() >= effectiveResetMin) {
            lastBand = "OK";
        }

        if (limitMax != null && current > limitMax) {
            // 超过上限 → HIGH
            newBand = "HIGH"; limitDisplay = limits.maxValue(); direction = "偏高";
        } else if (limitMin != null && current < limitMin) {
            // 低于下限 → LOW
            newBand = "LOW"; limitDisplay = limits.minValue(); direction = "偏低";
        } else if ("HIGH".equals(lastBand) && limitMax != null && current >= limitMax - hysteresis) {
            // 滞回区内：曾 HIGH 但未降到 limitMax - hysteresis 以下 → 保持 HIGH（不触发恢复）
            return null;
        } else if ("LOW".equals(lastBand) && limitMin != null && current <= limitMin + hysteresis) {
            // 滞回区内：曾 LOW 但未升到 limitMin + hysteresis 以上 → 保持 LOW（不触发恢复）
            return null;
        } else {
            // 正常范围（含滞回恢复）
            newBand = "OK"; limitDisplay = null; direction = "";
        }

        String metricKindDisplay = switch (metricKind) {
            case "TEMP" -> "温度"; case "HUM" -> "湿度"; case "PRESSURE" -> "压强"; default -> metricKind;
        };
        String valUnit = currentValue + (metricKind.contains("TEMP") ? "℃" : metricKind.contains("HUM") ? "%" : "Pa");

        // 状态机（基于 alarm_log 历史，已在滞回判断中查询）

        boolean isNewAlarm = "OK".equals(lastBand) || lastBand == null;
        boolean isRecovery = ("HIGH".equals(lastBand) || "LOW".equals(lastBand)) && "OK".equals(newBand);

        // 仅首次越限和恢复时触发；持续越限不重复报警，必须等恢复后重置
        if (isNewAlarm && !"OK".equals(newBand)) {
            return new AlarmItem(floorCode, roomName, variableName, metricKindDisplay, newBand, direction, valUnit, limitDisplay);
        }
        if (isRecovery && notifyRecovery) {
            return new AlarmItem(floorCode, roomName, variableName, metricKindDisplay, "OK", "恢复", valUnit, null);
        }
        return null;
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
