package com.example.demo.modules.telemetry.service;

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

import java.text.Collator;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.*;

/**
 * 动物房环境报警定时检测。
 * <p>
 * 核心逻辑：
 * <ol>
 *   <li>从 watchlist 取所有启用且类型为 TEMP/HUM/PRESSURE 的测量变量</li>
 *   <li>按 floor_code → suite_norm 分组</li>
 *   <li>检查楼层开关 → 套间开关 → 解析阈值 → 读取快照值 → 判断越限</li>
 *   <li>冷却窗口去重：同变量同方向需间隔 ≥ cooldown_minutes</li>
 *   <li>状态变化 OK→ALARM 立即发送；ALARM→OK 可选恢复通知</li>
 *   <li>ALARM→ALARM 同方向持续：超过冷却才重发</li>
 * </ol>
 */
@Service
public class TelemetryAlarmCheckScheduler {

    private static final Logger log = LoggerFactory.getLogger(TelemetryAlarmCheckScheduler.class);

    /**
     * 报警指标类型
     */
    private static final Set<String> MONITORED_KINDS = Set.of("TEMP", "HUM", "RH", "PRESSURE");

    private static String canonicalMetricKind(String kind) {
        if (kind == null) return null;
        String u = kind.trim().toUpperCase(Locale.ROOT);
        if ("RH".equals(u)) return "HUM";
        return MONITORED_KINDS.contains(u) ? u : null;
    }

    private final TelemetryWatchlistTagMapper watchlistTagMapper;
    private final TelemetryAlarmLogMapper alarmLogMapper;
    private final TelemetryAlarmConfigService alarmConfigService;
    private final TelemetryGlobalAlarmLimitsService globalLimitsService;
    private final TelemetrySnapshotService snapshotService;
    private final PushService pushService;

    public TelemetryAlarmCheckScheduler(TelemetryWatchlistTagMapper watchlistTagMapper,
                                        TelemetryAlarmLogMapper alarmLogMapper,
                                        TelemetryAlarmConfigService alarmConfigService,
                                        TelemetryGlobalAlarmLimitsService globalLimitsService,
                                        TelemetrySnapshotService snapshotService,
                                        PushService pushService) {
        this.watchlistTagMapper = watchlistTagMapper;
        this.alarmLogMapper = alarmLogMapper;
        this.alarmConfigService = alarmConfigService;
        this.globalLimitsService = globalLimitsService;
        this.snapshotService = snapshotService;
        this.pushService = pushService;
    }

    @PostConstruct
    public void init() {
        log.info("[遥测报警] 调度器已创建，依赖就绪，首次检测将在 120 秒后执行");
    }

    @Scheduled(fixedDelay = 60_000, initialDelay = 120_000)
    public void check() {
        try {
            doCheck();
        } catch (Exception e) {
            log.error("[遥测报警] 定时检测异常", e);
        }
    }

    private void doCheck() {
        log.info("[遥测报警] 开始检测...");
        // 1. 加载 watchlist 变量
        List<TelemetryWatchlistTagRow> allRows = watchlistTagMapper.selectAllEnabledTagsJoinedBundlesOrdered();
        if (allRows == null || allRows.isEmpty()) {
            log.info("[遥测报警] watchlist 为空或无启用变量，跳过检测（请检查 telemetry_watchlist_tag 是否有 enabled=1 且 display_label≠'无' 的行）");
            return;
        }
        log.info("[遥测报警] watchlist 加载 {} 行", allRows.size());
        // 诊断：打印前几个变量的 metricKind 和 kindRole
        if (!allRows.isEmpty()) {
            int diag = Math.min(3, allRows.size());
            for (int i = 0; i < diag; i++) {
                TelemetryWatchlistTagRow r = allRows.get(i);
                log.info("[遥测报警]   样本{}: var={} kind={} role={} floor={} room={}",
                        i + 1, r.getWinccVariableName(), r.getMetricKindCode(), r.getMetricKindRole(),
                        r.getFloorCode(), r.getRoomCanonical());
            }
        }

        // 过滤：主测量 + TEMP/HUM/PRESSURE
        List<TelemetryWatchlistTagRow> monitored = allRows.stream()
                .filter(r -> r != null && StringUtils.hasText(r.getWinccVariableName()))
                .filter(r -> canonicalMetricKind(r.getMetricKindCode()) != null)
                .filter(r -> !"LIMIT_MIN".equalsIgnoreCase(trim(r.getMetricKindRole()))
                        && !"LIMIT_MAX".equalsIgnoreCase(trim(r.getMetricKindRole())))
                .filter(r -> !isLimitSuffixVariable(r.getWinccVariableName()))
                .filter(r -> StringUtils.hasText(r.getFloorCode()))
                .toList();

        if (monitored.isEmpty()) {
            log.info("[遥测报警] 过滤后无可监控变量（{} 行被过滤：需 metricKind=TEMP/HUM/PRESSURE + kindRole≠LIMIT + 非限值后缀 + 有 floorCode）", allRows.size());
            return;
        }
        log.info("[遥测报警] 过滤后 {} 个可监控变量", monitored.size());

        // 2. 加载全局阈值缓存
        TelemetryGlobalAlarmLimitsDto globalLimits = globalLimitsService.load();

        // 3. 加载当前快照
        Map<String, String> snapshotValues = buildSnapshotValueMap();

        // 4. 按 floor_code 分组检查
        Map<String, List<TelemetryWatchlistTagRow>> byFloor = new LinkedHashMap<>();
        for (TelemetryWatchlistTagRow r : monitored) {
            String fc = TelemetryAlarmConfigService.normalizeFloorCode(r.getFloorCode());
            byFloor.computeIfAbsent(fc, k -> new ArrayList<>()).add(r);
        }

        int totalAlarms = 0, totalRecoveries = 0, totalSkipped = 0;
        Instant now = Instant.now();

        for (Map.Entry<String, List<TelemetryWatchlistTagRow>> entry : byFloor.entrySet()) {
            String floorCode = entry.getKey();
            List<TelemetryWatchlistTagRow> floorRows = entry.getValue();

            // 楼层开关检查
            TelemetryFloorAlarmConfig floorCfg = alarmConfigService.getFloorByCode(floorCode);
            if (floorCfg != null && floorCfg.getEnabled() != null && floorCfg.getEnabled() != 1) {
                log.debug("[遥测报警] 楼层 {} 报警已禁用，跳过 {} 个变量", floorCode, floorRows.size());
                totalSkipped += floorRows.size();
                continue;
            }
            if (floorCfg == null) {
                // 首次遇到：自动初始化楼层（默认开启）
                floorCfg = alarmConfigService.ensureFloor(floorCode);
            }
            int cooldownMin = floorCfg.getCooldownMinutes() != null ? floorCfg.getCooldownMinutes() : 30;
            boolean notifyRecovery = floorCfg.getNotifyOnRecovery() != null && floorCfg.getNotifyOnRecovery() == 1;

            // 套间分组
            Map<String, List<TelemetryWatchlistTagRow>> bySuite = new LinkedHashMap<>();
            for (TelemetryWatchlistTagRow r : floorRows) {
                String suiteNorm = TelemetryAlarmConfigService.resolveSuiteNorm(floorCode, r.getRoomCanonical());
                bySuite.computeIfAbsent(suiteNorm, k -> new ArrayList<>()).add(r);
            }

            for (Map.Entry<String, List<TelemetryWatchlistTagRow>> suiteEntry : bySuite.entrySet()) {
                String suiteNorm = suiteEntry.getKey();
                List<TelemetryWatchlistTagRow> suiteRows = suiteEntry.getValue();

                // 套间开关检查
                TelemetrySuiteAlarmConfig suiteCfg = alarmConfigService.getSuiteByNorm(suiteNorm);
                boolean suiteEnabled;
                if (suiteCfg != null && suiteCfg.getEnabled() != null) {
                    suiteEnabled = suiteCfg.getEnabled() == 1;
                } else {
                    suiteEnabled = true; // NULL = 继承楼层（楼层已检查通过）
                }
                if (!suiteEnabled) {
                    log.debug("[遥测报警] 套间 {} 报警已禁用，跳过 {} 个变量", suiteNorm, suiteRows.size());
                    totalSkipped += suiteRows.size();
                    continue;
                }

                // 逐变量检查
                for (TelemetryWatchlistTagRow row : suiteRows) {
                    // 逐变量报警开关：alarm_enabled=0 明确禁用，NULL 继承 enabled
                    if (row.getAlarmEnabled() != null && row.getAlarmEnabled() == 0) {
                        totalSkipped++;
                        continue;
                    }
                    AlarmResult result = checkSingleVariable(
                            row, floorCode, suiteNorm, suiteCfg, globalLimits,
                            snapshotValues, cooldownMin, notifyRecovery, now);
                    if (result == AlarmResult.ALARM_SENT) totalAlarms++;
                    else if (result == AlarmResult.RECOVERY_SENT) totalRecoveries++;
                    else totalSkipped++;
                }
            }
        }

        // 5. 清理旧日志（保留7天）
        try {
            alarmLogMapper.deleteOlderThan(LocalDateTime.now().minusDays(7));
        } catch (Exception e) {
            log.debug("[遥测报警] 清理旧日志失败（可忽略）: {}", e.getMessage());
        }

        log.info("[遥测报警] 检测完成: {} 报警 {} 恢复 {} 跳过（{} 楼层）",
                totalAlarms, totalRecoveries, totalSkipped, byFloor.size());
    }

    private enum AlarmResult { ALARM_SENT, RECOVERY_SENT, SKIPPED }

    private AlarmResult checkSingleVariable(
            TelemetryWatchlistTagRow row,
            String floorCode,
            String suiteNorm,
            TelemetrySuiteAlarmConfig suiteCfg,
            TelemetryGlobalAlarmLimitsDto globalLimits,
            Map<String, String> snapshotValues,
            int cooldownMin,
            boolean notifyRecovery,
            Instant now) {

        String variableName = row.getWinccVariableName().trim();
        String metricKind = canonicalMetricKind(row.getMetricKindCode());
        String roomName = TelemetryAlarmConfigService.localPartRoom(
                row.getRoomCanonical() != null ? row.getRoomCanonical() : "");

        // 解析阈值
        TelemetryAlarmConfigService.ResolvedAlarmLimit limits = alarmConfigService.resolveEffectiveLimits(
                suiteNorm, metricKind,
                row.getAlarmOverrideMin(), row.getAlarmOverrideMax(),
                globalLimits, suiteCfg);

        // 取快照值
        String currentValue = snapshotValues.get(variableName);
        if (!StringUtils.hasText(currentValue)) return AlarmResult.SKIPPED;

        // 比较阈值
        Double current = parseNumeric(currentValue);
        if (current == null) return AlarmResult.SKIPPED;

        Double limitMin = parseNumeric(limits.minValue());
        Double limitMax = parseNumeric(limits.maxValue());

        String newBand;
        String limitDisplay;
        if (limitMax != null && current > limitMax) {
            newBand = "HIGH";
            limitDisplay = limits.maxValue();
        } else if (limitMin != null && current < limitMin) {
            newBand = "LOW";
            limitDisplay = limits.minValue();
        } else {
            newBand = "OK";
            limitDisplay = null;
        }

        // 查询上次状态
        TelemetryAlarmLog lastAny = alarmLogMapper.findLastByVariable(variableName);
        String lastBand = lastAny != null ? lastAny.getAlarmBand() : null;
        LocalDateTime lastSentAt = lastAny != null ? lastAny.getSentAt() : null;

        // 状态判断
        boolean isNewAlarm = "OK".equals(lastBand) || lastBand == null;
        boolean isRecovery = ("HIGH".equals(lastBand) || "LOW".equals(lastBand)) && "OK".equals(newBand);
        boolean isSameDirection = newBand.equals(lastBand) && !"OK".equals(newBand);
        boolean cooldownPassed = true;
        if (isSameDirection && lastSentAt != null) {
            long minutesSinceLast = Duration.between(lastSentAt, LocalDateTime.now()).toMinutes();
            cooldownPassed = minutesSinceLast >= cooldownMin;
        }

        // 决定是否发送
        boolean shouldSend = false;
        String pushSource = null;
        boolean isRecoveryPush = false;

        if (isNewAlarm && !"OK".equals(newBand)) {
            shouldSend = true;
            pushSource = "TELEMETRY_ALARM";
        } else if (isSameDirection && cooldownPassed) {
            shouldSend = true;
            pushSource = "TELEMETRY_ALARM";
        } else if (isRecovery && notifyRecovery) {
            shouldSend = true;
            pushSource = "TELEMETRY_RECOVERY";
            isRecoveryPush = true;
        }

        if (!shouldSend) return AlarmResult.SKIPPED;

        // 发送推送
        String metricKindDisplay = switch (metricKind) {
            case "TEMP" -> "温度";
            case "HUM" -> "湿度";
            case "PRESSURE" -> "压强";
            default -> metricKind;
        };
        String alarmDirection = "HIGH".equals(newBand) ? "偏高" : "LOW".equals(newBand) ? "偏低" : "";

        Map<String, String> vars = new LinkedHashMap<>();
        vars.put("floorCode", floorCode);
        vars.put("roomName", roomName);
        vars.put("metricKind", metricKindDisplay);
        vars.put("alarmDirection", alarmDirection);
        vars.put("currentValue", currentValue + (metricKind.contains("TEMP") ? "℃" : metricKind.contains("HUM") ? "%" : "Pa"));
        vars.put("limitValue", limitDisplay != null ? limitDisplay : "—");
        vars.put("sentAt", LocalDateTime.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS).toString());
        if (isRecoveryPush) {
            vars.put("recoveryAt", vars.get("sentAt"));
        }

        try {
            pushService.send(pushSource, vars);
        } catch (Exception e) {
            log.warn("[遥测报警] 推送发送失败: {} {}", variableName, e.getMessage());
        }

        // 记录日志
        TelemetryAlarmLog logEntry = new TelemetryAlarmLog();
        logEntry.setVariableName(variableName);
        logEntry.setFloorCode(floorCode);
        logEntry.setRoomCanonical(row.getRoomCanonical());
        logEntry.setSuiteNorm(suiteNorm);
        logEntry.setMetricKind(metricKind);
        logEntry.setAlarmBand(newBand);
        logEntry.setCurrentValue(currentValue);
        logEntry.setLimitValue(limitDisplay);
        logEntry.setSentAt(LocalDateTime.now());
        alarmLogMapper.insert(logEntry);

        log.info("[遥测报警] {} {}: {} {} {} (当前={} 阈值={})",
                isRecoveryPush ? "恢复" : "报警", floorCode, roomName, metricKindDisplay,
                alarmDirection, currentValue, limitDisplay);

        return isRecoveryPush ? AlarmResult.RECOVERY_SENT : AlarmResult.ALARM_SENT;
    }

    /** 从内存快照构建 variableName → value 映射 */
    private Map<String, String> buildSnapshotValueMap() {
        Map<String, String> map = new LinkedHashMap<>();
        try {
            var snapshot = snapshotService.getSnapshot();
            if (snapshot != null && snapshot.getItems() != null) {
                for (var item : snapshot.getItems()) {
                    if (item != null && StringUtils.hasText(item.getVariableName()) && StringUtils.hasText(item.getValue())) {
                        map.put(item.getVariableName().trim(), item.getValue().trim());
                    }
                }
            }
        } catch (Exception e) {
            log.debug("[遥测报警] 读取快照失败: {}", e.getMessage());
        }
        return map;
    }

    /** ── 工具 ── */

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }

    private static boolean isLimitSuffixVariable(String variableName) {
        if (variableName == null) return false;
        String u = variableName.trim();
        return u.endsWith("_TT_Floor") || u.endsWith("_TT_Top")
                || u.endsWith("_RH_Floor") || u.endsWith("_RH_Top")
                || u.endsWith("_PT_Floor") || u.endsWith("_PT_Top");
    }

    private static Double parseNumeric(String raw) {
        if (!StringUtils.hasText(raw)) return null;
        String t = raw.trim().replace(',', '.');
        // 只取前导数字
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("(-?\\d+(?:\\.\\d*)?)").matcher(t);
        if (m.find()) {
            try {
                return Double.parseDouble(m.group(1));
            } catch (NumberFormatException ignored) {
            }
        }
        return null;
    }
}
