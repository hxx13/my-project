package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.telemetry.dto.TelemetryAlarmConfigTreeDto;
import com.example.demo.modules.telemetry.dto.TelemetryAlarmConfigTreeDto.*;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryGlobalAlarmLimitsDto;
import com.example.demo.modules.telemetry.entity.TelemetryFloorAlarmConfig;
import com.example.demo.modules.telemetry.entity.TelemetrySuiteAlarmConfig;
import com.example.demo.modules.telemetry.entity.TelemetryWatchlistTagRow;
import com.example.demo.modules.telemetry.mapper.TelemetryFloorAlarmConfigMapper;
import com.example.demo.modules.telemetry.mapper.TelemetrySuiteAlarmConfigMapper;
import com.example.demo.modules.telemetry.mapper.TelemetryWatchlistTagMapper;
import com.example.demo.modules.telemetry.util.WinccLimitVariableNaming;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.text.Collator;
import java.util.*;
import java.util.regex.Pattern;

/**
 * 动物房报警配置：楼层/套间开关 + 三级阈值解析（全局 → 套间 → 逐测点覆盖）。
 * suite_norm 计算与 {@code AnimalRoomHubAssembler} 中 standardSuiteRoomSegment / basementSuiteRoomSegment 一致。
 */
@Service
public class TelemetryAlarmConfigService {

    private static final Logger log = LoggerFactory.getLogger(TelemetryAlarmConfigService.class);

    /** ── 套间归并（与 HubAssembler 同源）── */
    private static final Pattern SUITE_SUFFIX = Pattern.compile("(\\d+)([A-Za-z]+)$");
    private static final Pattern NUMERIC_STANDARD_FLOOR_TAB_KEY = Pattern.compile("^\\d+F$");

    static String normalizeRoomForGrouping(String room) {
        if (room == null) return "";
        String s = room.trim();
        if (s.isEmpty()) return s;
        return SUITE_SUFFIX.matcher(s).replaceFirst("$1");
    }

    static String localPartRoom(String roomCanonical) {
        String r = roomCanonical == null ? "" : roomCanonical.trim();
        if (r.isEmpty()) return r;
        List<String> parts = Arrays.stream(r.split("-")).map(String::trim).filter(s -> !s.isEmpty()).toList();
        if (parts.isEmpty()) return r;
        // 跳过首段楼层 token（如 1F, B1F）
        int start = 0;
        if (parts.get(0).matches("^(?i)\\d*F$|^B\\d*F$|^M\\d*F$")) start = 1;
        if (start >= parts.size()) return r;
        return String.join("-", parts.subList(start, parts.size()));
    }

    /** 标准层套间段：去掉楼层前缀后的第一段 */
    static String standardSuiteRoomSegment(String roomCanonical) {
        String r = roomCanonical == null ? "" : roomCanonical.trim();
        if (r.isEmpty()) return r;
        List<String> parts = Arrays.stream(r.split("-")).map(String::trim).filter(s -> !s.isEmpty()).toList();
        if (parts.isEmpty()) return r;
        int i = 0;
        if (i < parts.size() && parts.get(i).matches("^\\d+F$")) i++;
        if (i >= parts.size()) return r;
        return normalizeRoomForGrouping(parts.get(i));
    }

    /** B1F 等地下室套间段：跳过楼层 token + 区段（E10/E11A…）后的房间码段 */
    static String basementSuiteRoomSegment(String roomCanonical) {
        String r = roomCanonical == null ? "" : roomCanonical.trim();
        if (r.isEmpty()) return r;
        List<String> parts = Arrays.stream(r.split("-")).map(String::trim).filter(s -> !s.isEmpty()).toList();
        if (parts.isEmpty()) return r;
        int i = 0;
        if (i < parts.size() && parts.get(i).matches("^(?i)B\\d*F$")) i++;
        while (i < parts.size() && isBasementHardZoneSegment(parts.get(i))) i++;
        if (i >= parts.size()) return r;
        return normalizeRoomForGrouping(parts.get(i));
    }

    static boolean isSuiteConceptFloor(String tabKey) {
        return tabKey != null && NUMERIC_STANDARD_FLOOR_TAB_KEY.matcher(tabKey.trim().toUpperCase(Locale.ROOT)).matches();
    }

    static boolean isBasementFloorScope(String floorCode) {
        return floorCode != null && Pattern.compile("^(?i)B\\d*F").matcher(floorCode.trim()).find();
    }

    private static boolean isBasementHardZoneSegment(String seg) {
        if (seg == null || seg.isBlank()) return false;
        String u = seg.trim().toUpperCase(Locale.ROOT);
        return u.matches("^E1[01][A-C]?$");
    }

    /** 归一化楼层代码 */
    static String normalizeFloorCode(String floorCode) {
        if (floorCode == null) return "";
        String s = floorCode.trim();
        if (s.isEmpty()) return s;
        String lower = s.toLowerCase(Locale.ROOT);
        if (lower.matches("^\\d+$")) return s + "F";
        if (lower.matches("^\\d+\\s*[层楼]$")) return s.replaceAll("[层楼]", "").trim() + "F";
        if (lower.matches("^\\d+\\s*f$")) return s.replaceAll("(?i)f", "").trim() + "F";
        if (lower.matches("^b\\d*\\s*f$")) return s.toUpperCase(Locale.ROOT);
        return s.toUpperCase(Locale.ROOT);
    }

    /** 计算套间标识 */
    public static String resolveSuiteNorm(String floorCode, String roomCanonical) {
        if (roomCanonical == null || roomCanonical.isBlank()) return "__no_room__";
        if (isSuiteConceptFloor(floorCode)) {
            String seg = standardSuiteRoomSegment(roomCanonical);
            return seg.isEmpty() ? roomCanonical.trim() : seg;
        }
        if (isBasementFloorScope(floorCode)) {
            String seg = basementSuiteRoomSegment(roomCanonical);
            return seg.isEmpty() ? roomCanonical.trim() : seg;
        }
        return roomCanonical.trim();
    }

    /** ── 阈值解析 ── */

    /**
     * 解析变量在指定套间下的有效报警限。
     * 优先级：逐测点 override > 套间配置 > 全局限值
     */
    public record ResolvedAlarmLimit(String minValue, String maxValue, String hysteresisValue) {}

    public ResolvedAlarmLimit resolveEffectiveLimits(
            String suiteNorm,
            String metricKindCode,
            String alarmOverrideMin,
            String alarmOverrideMax,
            TelemetryGlobalAlarmLimitsDto global,
            TelemetrySuiteAlarmConfig suiteConfig) {

        String minFromSuite = null, maxFromSuite = null;
        if (suiteConfig != null) {
            minFromSuite = suiteLimitForMetric(suiteConfig, metricKindCode, true);
            maxFromSuite = suiteLimitForMetric(suiteConfig, metricKindCode, false);
        }

        String minFromGlobal = globalLimitForMetric(global, metricKindCode, true);
        String maxFromGlobal = globalLimitForMetric(global, metricKindCode, false);

        // 优先级：逐测点 > 套间 > 全局
        String effectiveMin = firstNonBlank(alarmOverrideMin, minFromSuite, minFromGlobal);
        String effectiveMax = firstNonBlank(alarmOverrideMax, maxFromSuite, maxFromGlobal);

        // Hysteresis resolution: suite > global (per-tag doesn't have hysteresis override)
        String hysFromSuite = suiteHysteresisForMetric(suiteConfig, metricKindCode);
        String hysFromGlobal = globalHysteresisForMetric(global, metricKindCode);
        String effectiveHysteresis = firstNonBlank(hysFromSuite, hysFromGlobal);

        return new ResolvedAlarmLimit(effectiveMin, effectiveMax, effectiveHysteresis);
    }

    private static String suiteLimitForMetric(TelemetrySuiteAlarmConfig cfg, String metricKind, boolean isMin) {
        if (cfg == null) return null;
        String u = metricKind != null ? metricKind.trim().toUpperCase(Locale.ROOT) : "";
        return switch (u) {
            case "TEMP" -> isMin ? cfg.getTempMin() : cfg.getTempMax();
            case "HUM", "RH" -> isMin ? cfg.getHumMin() : cfg.getHumMax();
            case "PRESSURE" -> isMin ? cfg.getPressureMin() : cfg.getPressureMax();
            default -> null;
        };
    }

    private static String globalLimitForMetric(TelemetryGlobalAlarmLimitsDto g, String metricKind, boolean isMin) {
        if (g == null) return null;
        String u = metricKind != null ? metricKind.trim().toUpperCase(Locale.ROOT) : "";
        return switch (u) {
            case "TEMP" -> isMin ? g.getTempMin() : g.getTempMax();
            case "HUM", "RH" -> isMin ? g.getHumMin() : g.getHumMax();
            case "PRESSURE" -> isMin ? g.getPressureMin() : g.getPressureMax();
            default -> null;
        };
    }

    private static String suiteHysteresisForMetric(TelemetrySuiteAlarmConfig cfg, String metricKind) {
        if (cfg == null) return null;
        String u = metricKind != null ? metricKind.trim().toUpperCase(Locale.ROOT) : "";
        return switch (u) {
            case "TEMP" -> cfg.getHysteresisTemp();
            case "HUM", "RH" -> cfg.getHysteresisHum();
            case "PRESSURE" -> cfg.getHysteresisPressure();
            default -> null;
        };
    }

    private static String globalHysteresisForMetric(TelemetryGlobalAlarmLimitsDto g, String metricKind) {
        if (g == null) return null;
        String u = metricKind != null ? metricKind.trim().toUpperCase(Locale.ROOT) : "";
        return switch (u) {
            case "TEMP" -> g.getHysteresisTemp();
            case "HUM", "RH" -> g.getHysteresisHum();
            case "PRESSURE" -> g.getHysteresisPressure();
            default -> null;
        };
    }

    private static String firstNonBlank(String... vals) {
        for (String v : vals) {
            if (StringUtils.hasText(v)) return v.trim();
        }
        return null;
    }

    /** ── 全量树 ── */

    private static final Set<String> MONITORED_KINDS = Set.of("TEMP", "HUM", "RH", "PRESSURE");

    private static boolean isAlarmMetricKind(String kind, String role) {
        if (kind == null) return false;
        String u = kind.trim().toUpperCase(Locale.ROOT);
        if (u.equals("RH")) u = "HUM";
        if (!MONITORED_KINDS.contains(u)) return false;
        if (role != null) {
            String r = role.trim().toUpperCase(Locale.ROOT);
            if ("LIMIT_MIN".equals(r) || "LIMIT_MAX".equals(r)) return false;
        }
        return true;
    }

    private static String displayLabelOrFallback(TelemetryWatchlistTagRow t) {
        if (StringUtils.hasText(t.getDisplayLabel())) return t.getDisplayLabel().trim();
        if (StringUtils.hasText(t.getMetricKindLabel())) return t.getMetricKindLabel().trim();
        String vn = t.getWinccVariableName() != null ? t.getWinccVariableName().trim() : "";
        // 取变量名最后一段作为兜底显示
        int lastDot = vn.lastIndexOf('.');
        if (lastDot >= 0 && lastDot + 1 < vn.length()) return vn.substring(lastDot + 1);
        return vn;
    }

    /**
     * 构建报警配置树：楼层 → 套间 → 房间 → 变量（供前端一次性加载）。
     * 包含所有 metric kinds（TEMP/HUM/PRESSURE 作为报警指标，SETPOINT/SWITCH 作为参考），
     * 使用 display_label 作为展示名，支持 per-variable alarmEnabled。
     */
    public TelemetryAlarmConfigTreeDto buildConfigTree() {
        TelemetryGlobalAlarmLimitsDto global = globalLimitsService.load();
        List<TelemetryFloorAlarmConfig> floorConfigs = floorMapper.findAll();
        Map<String, TelemetryFloorAlarmConfig> floorMap = new LinkedHashMap<>();
        for (TelemetryFloorAlarmConfig f : floorConfigs) {
            floorMap.put(f.getFloorCode(), f);
        }

        // 加载所有 watchlist 变量（包含所有 metric kind）
        List<TelemetryWatchlistTagRow> allRows = watchlistTagMapper.selectAllEnabledTagsJoinedBundlesOrdered();
        List<TelemetryWatchlistTagRow> valid = new ArrayList<>();
        if (allRows != null) {
            for (TelemetryWatchlistTagRow r : allRows) {
                if (r == null || !StringUtils.hasText(r.getWinccVariableName())) continue;
                if (!StringUtils.hasText(r.getFloorCode())) continue;
                if (!StringUtils.hasText(r.getMetricKindCode())) continue;
                // 排除 WinCC 限值后缀变量（_TT_Floor/_TT_Top/_RH_Floor/_RH_Top/_PT_Floor/_PT_Top）
                if (WinccLimitVariableNaming.isLimitSuffixVariable(r.getWinccVariableName())) continue;
                String role = r.getMetricKindRole() != null ? r.getMetricKindRole().trim().toUpperCase(Locale.ROOT) : "";
                if ("LIMIT_MIN".equals(role) || "LIMIT_MAX".equals(role)) continue;
                valid.add(r);
            }
        }

        // 按 floor → suite → room 分组
        record RoomKey(String roomCanonical) {}
        Map<String, Map<String, Map<String, List<TelemetryWatchlistTagRow>>>> grouped = new LinkedHashMap<>();
        for (TelemetryWatchlistTagRow r : valid) {
            String fc = normalizeFloorCode(r.getFloorCode());
            String sn = resolveSuiteNorm(fc, r.getRoomCanonical());
            String rc = r.getRoomCanonical() != null ? r.getRoomCanonical().trim() : "__no_room__";
            grouped.computeIfAbsent(fc, k -> new LinkedHashMap<>())
                    .computeIfAbsent(sn, k -> new LinkedHashMap<>())
                    .computeIfAbsent(rc, k -> new ArrayList<>())
                    .add(r);
        }

        Collator cn = Collator.getInstance(Locale.CHINA);
        List<String> sortedFloors = new ArrayList<>(grouped.keySet());
        sortedFloors.sort(cn);

        int totalSuites = 0, totalRooms = 0, totalVars = 0;
        List<FloorNode> floorNodes = new ArrayList<>();

        for (String fc : sortedFloors) {
            Map<String, Map<String, List<TelemetryWatchlistTagRow>>> suiteMap = grouped.get(fc);
            TelemetryFloorAlarmConfig floorCfg = floorMap.get(fc);
            boolean floorEnabled = floorCfg == null || floorCfg.getEnabled() == null || floorCfg.getEnabled() == 1;
            int cooldown = floorCfg != null && floorCfg.getCooldownMinutes() != null ? floorCfg.getCooldownMinutes() : 30;
            boolean floorRecovery = floorCfg != null && floorCfg.getNotifyOnRecovery() != null && floorCfg.getNotifyOnRecovery() == 1;

            List<String> sortedSuites = new ArrayList<>(suiteMap.keySet());
            sortedSuites.sort(cn);
            List<SuiteNode> suiteNodes = new ArrayList<>();
            int floorVarCount = 0;

            for (String sn : sortedSuites) {
                Map<String, List<TelemetryWatchlistTagRow>> roomMap = suiteMap.get(sn);
                TelemetrySuiteAlarmConfig suiteCfg = suiteMapper.findBySuiteNorm(sn);

                Boolean suiteEnabled = suiteCfg != null ? (suiteCfg.getEnabled() == null ? null : suiteCfg.getEnabled() == 1) : null;
                boolean hasCustom = suiteCfg != null && (
                        StringUtils.hasText(suiteCfg.getTempMin()) || StringUtils.hasText(suiteCfg.getTempMax())
                                || StringUtils.hasText(suiteCfg.getHumMin()) || StringUtils.hasText(suiteCfg.getHumMax())
                                || StringUtils.hasText(suiteCfg.getPressureMin()) || StringUtils.hasText(suiteCfg.getPressureMax()));

                List<String> sortedRooms = new ArrayList<>(roomMap.keySet());
                sortedRooms.sort(cn);
                List<RoomNode> roomNodes = new ArrayList<>();
                int suiteVarCount = 0;
                boolean suiteHasAlarm = false;

                for (String rc : sortedRooms) {
                    List<TelemetryWatchlistTagRow> tags = roomMap.get(rc);
                    List<TagNode> tagNodes = new ArrayList<>();
                    boolean roomHasAlarm = false;

                    // 房间内排序：报警指标优先，同类型按 displayLabel
                    tags.sort((a, b) -> {
                        boolean aAlarm = isAlarmMetricKind(a.getMetricKindCode(), a.getMetricKindRole());
                        boolean bAlarm = isAlarmMetricKind(b.getMetricKindCode(), b.getMetricKindRole());
                        if (aAlarm && !bAlarm) return -1;
                        if (!aAlarm && bAlarm) return 1;
                        return cn.compare(displayLabelOrFallback(a), displayLabelOrFallback(b));
                    });

                    for (TelemetryWatchlistTagRow t : tags) {
                        String mk = t.getMetricKindCode() != null ? t.getMetricKindCode().trim().toUpperCase(Locale.ROOT) : "";
                        if ("RH".equals(mk)) mk = "HUM";
                        String role = t.getMetricKindRole() != null ? t.getMetricKindRole().trim().toUpperCase(Locale.ROOT) : "METRIC";
                        boolean isAlarm = isAlarmMetricKind(mk, role);
                        if (isAlarm) roomHasAlarm = true;

                        ResolvedAlarmLimit limits = isAlarm
                                ? resolveEffectiveLimits(sn, mk, t.getAlarmOverrideMin(), t.getAlarmOverrideMax(), global, suiteCfg)
                                : new ResolvedAlarmLimit(null, null, null);

                        // alarmEnabled: 优先用 alarm_enabled 列，否则同 enabled
                        Boolean alarmOn = t.getAlarmEnabled() != null
                                ? t.getAlarmEnabled() == 1
                                : (t.getEnabled() != null && t.getEnabled() == 1);

                        tagNodes.add(TagNode.builder()
                                .tagId(t.getId())
                                .variableName(t.getWinccVariableName())
                                .displayLabel(displayLabelOrFallback(t))
                                .roomCanonical(rc)
                                .roomDisplay(localPartRoom(rc))
                                .metricKindCode(mk)
                                .metricKindLabel(t.getMetricKindLabel())
                                .kindRole(role)
                                .isAlarmMetric(isAlarm)
                                .alarmEnabled(isAlarm ? alarmOn : null)
                                .alarmCooldownMinutes(isAlarm ? (t.getAlarmCooldownMinutes() != null ? t.getAlarmCooldownMinutes() : 0) : null)
                                .alarmOverrideMin(isAlarm && StringUtils.hasText(t.getAlarmOverrideMin()) ? t.getAlarmOverrideMin().trim() : null)
                                .alarmOverrideMax(isAlarm && StringUtils.hasText(t.getAlarmOverrideMax()) ? t.getAlarmOverrideMax().trim() : null)
                                .effectiveMinValue(limits.minValue())
                                .effectiveMaxValue(limits.maxValue())
                                .build());
                    }

                    roomNodes.add(RoomNode.builder()
                            .roomCanonical(rc)
                            .roomDisplay(localPartRoom(rc))
                            .variableCount(tags.size())
                            .hasAlarmMetrics(roomHasAlarm)
                            .tags(tagNodes)
                            .build());
                    if (roomHasAlarm) suiteHasAlarm = true;
                    suiteVarCount += tags.size();
                }

                suiteNodes.add(SuiteNode.builder()
                        .configId(suiteCfg != null ? suiteCfg.getId() : null)
                        .suiteNorm(sn)
                        .floorCode(fc)
                        .enabled(suiteEnabled)
                        .tempMin(suiteCfg != null && StringUtils.hasText(suiteCfg.getTempMin()) ? suiteCfg.getTempMin().trim() : null)
                        .tempMax(suiteCfg != null && StringUtils.hasText(suiteCfg.getTempMax()) ? suiteCfg.getTempMax().trim() : null)
                        .humMin(suiteCfg != null && StringUtils.hasText(suiteCfg.getHumMin()) ? suiteCfg.getHumMin().trim() : null)
                        .humMax(suiteCfg != null && StringUtils.hasText(suiteCfg.getHumMax()) ? suiteCfg.getHumMax().trim() : null)
                        .pressureMin(suiteCfg != null && StringUtils.hasText(suiteCfg.getPressureMin()) ? suiteCfg.getPressureMin().trim() : null)
                        .pressureMax(suiteCfg != null && StringUtils.hasText(suiteCfg.getPressureMax()) ? suiteCfg.getPressureMax().trim() : null)
                        .hysteresisTemp(suiteCfg != null && StringUtils.hasText(suiteCfg.getHysteresisTemp()) ? suiteCfg.getHysteresisTemp().trim() : null)
                        .hysteresisHum(suiteCfg != null && StringUtils.hasText(suiteCfg.getHysteresisHum()) ? suiteCfg.getHysteresisHum().trim() : null)
                        .hysteresisPressure(suiteCfg != null && StringUtils.hasText(suiteCfg.getHysteresisPressure()) ? suiteCfg.getHysteresisPressure().trim() : null)
                        .hasCustomThresholds(hasCustom)
                        .variableCount(suiteVarCount)
                        .roomCount(roomNodes.size())
                        .rooms(roomNodes)
                        .build());
                totalSuites++;
                totalRooms += roomNodes.size();
                floorVarCount += suiteVarCount;
                totalVars += suiteVarCount;
            }

            floorNodes.add(FloorNode.builder()
                    .configId(floorCfg != null ? floorCfg.getId() : null)
                    .floorCode(fc)
                    .enabled(floorEnabled)
                    .cooldownMinutes(cooldown)
                    .notifyOnRecovery(floorRecovery)
                    .bufferFlushMinutes(floorCfg != null && floorCfg.getBufferFlushMinutes() != null ? floorCfg.getBufferFlushMinutes() : 5)
                    .variableCount(floorVarCount)
                    .suiteCount(suiteNodes.size())
                    .suites(suiteNodes)
                    .build());
        }

        return TelemetryAlarmConfigTreeDto.builder()
                .floors(floorNodes)
                .totalFloors(floorNodes.size())
                .totalSuites(totalSuites)
                .totalRooms(totalRooms)
                .totalVariables(totalVars)
                .build();
    }

    /** ── CRUD ── */

    private final TelemetryFloorAlarmConfigMapper floorMapper;
    private final TelemetrySuiteAlarmConfigMapper suiteMapper;
    private final TelemetryWatchlistTagMapper watchlistTagMapper;
    private final TelemetryGlobalAlarmLimitsService globalLimitsService;

    public TelemetryAlarmConfigService(TelemetryFloorAlarmConfigMapper floorMapper,
                                       TelemetrySuiteAlarmConfigMapper suiteMapper,
                                       TelemetryWatchlistTagMapper watchlistTagMapper,
                                       TelemetryGlobalAlarmLimitsService globalLimitsService) {
        this.floorMapper = floorMapper;
        this.suiteMapper = suiteMapper;
        this.watchlistTagMapper = watchlistTagMapper;
        this.globalLimitsService = globalLimitsService;
    }

    // -- 楼层 --

    public List<TelemetryFloorAlarmConfig> listFloors() {
        return floorMapper.findAll();
    }

    public TelemetryFloorAlarmConfig getFloorByCode(String floorCode) {
        return floorMapper.findByFloorCode(floorCode);
    }

    public TelemetryFloorAlarmConfig saveFloor(TelemetryFloorAlarmConfig config) {
        if (config.getCooldownMinutes() == null) config.setCooldownMinutes(30);
        if (config.getEnabled() == null) config.setEnabled(1);
        if (config.getNotifyOnRecovery() == null) config.setNotifyOnRecovery(0);
        floorMapper.insertOrUpdate(config);
        return floorMapper.findByFloorCode(config.getFloorCode());
    }

    public void setFloorEnabled(Long id, boolean enabled) {
        floorMapper.updateEnabled(id, enabled ? 1 : 0);
    }

    /** 确保楼层存在（首次检测时自动初始化） */
    public TelemetryFloorAlarmConfig ensureFloor(String floorCode) {
        TelemetryFloorAlarmConfig existing = floorMapper.findByFloorCode(floorCode);
        if (existing != null) return existing;
        TelemetryFloorAlarmConfig cfg = new TelemetryFloorAlarmConfig();
        cfg.setFloorCode(floorCode);
        cfg.setEnabled(1);
        cfg.setCooldownMinutes(30);
        cfg.setNotifyOnRecovery(0);
        floorMapper.insertOrUpdate(cfg);
        return floorMapper.findByFloorCode(floorCode);
    }

    // -- 套间 --

    public List<TelemetrySuiteAlarmConfig> listSuitesByFloor(String floorCode) {
        return suiteMapper.findByFloorCode(floorCode);
    }

    public TelemetrySuiteAlarmConfig getSuiteByNorm(String suiteNorm) {
        return suiteMapper.findBySuiteNorm(suiteNorm);
    }

    public TelemetrySuiteAlarmConfig saveSuite(TelemetrySuiteAlarmConfig config) {
        suiteMapper.insertOrUpdate(config);
        return suiteMapper.findBySuiteNorm(config.getSuiteNorm());
    }

    public void setSuiteEnabled(Long id, boolean enabled) {
        suiteMapper.updateEnabled(id, enabled ? 1 : 0);
    }
}
