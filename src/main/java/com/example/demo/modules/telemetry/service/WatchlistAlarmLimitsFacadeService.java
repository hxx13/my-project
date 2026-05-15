package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.telemetry.dto.TelemetryTagItemDto;
import com.example.demo.modules.telemetry.dto.TelemetryWatchlistEnrichment;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryGlobalAlarmLimitsDto;
import com.example.demo.modules.telemetry.dto.watchlist.WatchlistAlarmLimitEntryDto;
import com.example.demo.modules.telemetry.dto.watchlist.WatchlistAlarmLimitsBatchDto;
import com.example.demo.modules.telemetry.util.WinccLimitVariableNaming;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 动物房报警上下限：先套用 {@code telemetry_global_alarm_limits}，再按库内 {@code alarm_override_min/max} 覆盖；
 * 按测点 {@link TelemetryTagItemDto#getMetricKindCode()} 或 WinCC 限值后缀推断类别。
 */
@Service
public class WatchlistAlarmLimitsFacadeService {

    private final TelemetryWatchlistDbService watchlistDbService;
    private final TelemetryGlobalAlarmLimitsService globalAlarmLimitsService;

    public WatchlistAlarmLimitsFacadeService(TelemetryWatchlistDbService watchlistDbService,
                                             TelemetryGlobalAlarmLimitsService globalAlarmLimitsService) {
        this.watchlistDbService = watchlistDbService;
        this.globalAlarmLimitsService = globalAlarmLimitsService;
    }

    /**
     * 将全局报警限合并进副本（内存快照中的 items 不应携带报警字段；由 Controller 在响应前调用）。
     */
    public List<TelemetryTagItemDto> mergeAlarmLimitsIntoSnapshotItems(List<TelemetryTagItemDto> source) {
        if (source == null || source.isEmpty()) {
            return source == null ? List.of() : List.copyOf(source);
        }
        List<TelemetryTagItemDto> copy = new ArrayList<>(source.size());
        for (TelemetryTagItemDto x : source) {
            copy.add(shallowCopyClearingAlarmFields(x));
        }
        applyGlobalAlarmLimitsToItems(copy);
        return copy;
    }

    /**
     * 按变量名批量查询；可选附带当前值以计算越界。metricKindCode 在 database 源下来自清单映射。
     */
    public WatchlistAlarmLimitsBatchDto queryLimits(Collection<String> variableNames,
                                                     Map<String, String> currentValueByVariable) {
        Map<String, String> valueByVar = currentValueByVariable != null ? currentValueByVariable : Map.of();
        WatchlistAlarmLimitsBatchDto.WatchlistAlarmLimitsBatchDtoBuilder out = WatchlistAlarmLimitsBatchDto.builder();
        Map<String, WatchlistAlarmLimitEntryDto> map = new LinkedHashMap<>();
        if (variableNames == null || variableNames.isEmpty()) {
            return out.byVariableName(map).build();
        }
        TelemetryWatchlistEnrichment en = watchlistDbService.useDatabaseSource()
                ? watchlistDbService.loadActiveWatchlistEnrichment()
                : TelemetryWatchlistEnrichment.empty();
        List<TelemetryTagItemDto> stubs = new ArrayList<>();
        for (String raw : variableNames) {
            if (!StringUtils.hasText(raw)) {
                continue;
            }
            String t = raw.trim();
            String val = lookupMap(valueByVar, t);
            TelemetryTagItemDto dto = TelemetryTagItemDto.builder()
                    .variableName(t)
                    .metricKindCode(lookupMap(en.getMetricKindCodeByVariable(), t))
                    .kindRole(lookupMap(en.getMetricKindRoleByVariable(), t))
                    .value(val)
                    .build();
            stubs.add(dto);
        }
        applyGlobalAlarmLimitsToItems(stubs);
        for (TelemetryTagItemDto d : stubs) {
            if (d == null || !StringUtils.hasText(d.getVariableName())) {
                continue;
            }
            map.put(d.getVariableName().trim(), toEntry(d));
        }
        return out.byVariableName(map).build();
    }

    private static WatchlistAlarmLimitEntryDto toEntry(TelemetryTagItemDto d) {
        return WatchlistAlarmLimitEntryDto.builder()
                .variableName(d.getVariableName())
                .alarmMinValue(d.getAlarmMinValue())
                .alarmMaxValue(d.getAlarmMaxValue())
                .alarmMinVariableName(d.getAlarmMinVariableName())
                .alarmMaxVariableName(d.getAlarmMaxVariableName())
                .alarmOutOfRange(d.getAlarmOutOfRange())
                .alarmBand(d.getAlarmBand())
                .build();
    }

    private static TelemetryTagItemDto shallowCopyClearingAlarmFields(TelemetryTagItemDto x) {
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
                .alarmOverrideMin(null)
                .alarmOverrideMax(null)
                .value(x.getValue())
                .timestamp(x.getTimestamp())
                .qualityCode(x.getQualityCode())
                .dataType(x.getDataType())
                .errorCode(x.getErrorCode())
                .error(x.getError())
                .build();
    }

    private void applyGlobalAlarmLimitsToItems(List<TelemetryTagItemDto> items) {
        if (items == null || items.isEmpty()) {
            return;
        }
        TelemetryGlobalAlarmLimitsDto g = globalAlarmLimitsService.load();
        TelemetryWatchlistEnrichment en = watchlistDbService.useDatabaseSource()
                ? watchlistDbService.loadActiveWatchlistEnrichment()
                : TelemetryWatchlistEnrichment.empty();
        for (TelemetryTagItemDto dto : items) {
            if (dto == null || !StringUtils.hasText(dto.getVariableName())) {
                continue;
            }
            String bucket = resolveAlarmLimitBucket(dto);
            dto.setAlarmMinVariableName(null);
            dto.setAlarmMaxVariableName(null);
            String vn = dto.getVariableName().trim();
            if (bucket == null) {
                dto.setAlarmMinValue(null);
                dto.setAlarmMaxValue(null);
                dto.setAlarmOutOfRange(null);
                dto.setAlarmBand(null);
                dto.setAlarmOverrideMin(trimOrNull(lookupMap(en.getAlarmOverrideMinByVariable(), vn)));
                dto.setAlarmOverrideMax(trimOrNull(lookupMap(en.getAlarmOverrideMaxByVariable(), vn)));
                continue;
            }
            switch (bucket) {
                case "TEMP" -> {
                    dto.setAlarmMinValue(trimOrNull(g.getTempMin()));
                    dto.setAlarmMaxValue(trimOrNull(g.getTempMax()));
                }
                case "HUM" -> {
                    dto.setAlarmMinValue(trimOrNull(g.getHumMin()));
                    dto.setAlarmMaxValue(trimOrNull(g.getHumMax()));
                }
                case "PRESSURE" -> {
                    dto.setAlarmMinValue(trimOrNull(g.getPressureMin()));
                    dto.setAlarmMaxValue(trimOrNull(g.getPressureMax()));
                }
                default -> {
                    dto.setAlarmMinValue(null);
                    dto.setAlarmMaxValue(null);
                }
            }
            String ovMin = lookupMap(en.getAlarmOverrideMinByVariable(), vn);
            String ovMax = lookupMap(en.getAlarmOverrideMaxByVariable(), vn);
            dto.setAlarmOverrideMin(trimOrNull(ovMin));
            dto.setAlarmOverrideMax(trimOrNull(ovMax));
            if (StringUtils.hasText(ovMin)) {
                dto.setAlarmMinValue(trimOrNull(ovMin));
            }
            if (StringUtils.hasText(ovMax)) {
                dto.setAlarmMaxValue(trimOrNull(ovMax));
            }
            applyAlarmBandAndOutOfRange(dto);
        }
    }

    /**
     * TEMP / HUM（含 RH）/ PRESSURE；限值后缀变量按后缀推断类别。
     */
    private static String resolveAlarmLimitBucket(TelemetryTagItemDto dto) {
        String vn = dto.getVariableName().trim();
        WinccLimitVariableNaming.Parsed p = WinccLimitVariableNaming.parseLimitSuffix(vn);
        String mk;
        if (p != null) {
            mk = p.metricKindCode();
        } else {
            mk = dto.getMetricKindCode();
        }
        if (!StringUtils.hasText(mk)) {
            return null;
        }
        String u = mk.trim().toUpperCase(Locale.ROOT);
        if ("RH".equals(u)) {
            u = "HUM";
        }
        if ("TEMP".equals(u) || "HUM".equals(u) || "PRESSURE".equals(u)) {
            return u;
        }
        return null;
    }

    private static String lookupMap(Map<String, String> map, String variableName) {
        if (map == null || map.isEmpty() || !StringUtils.hasText(variableName)) {
            return null;
        }
        String t = variableName.trim();
        String hit = map.get(t);
        if (hit != null) {
            return hit;
        }
        String want = TelemetryWatchlistDbService.normalizeWinCcVariableKey(t);
        for (Map.Entry<String, String> e : map.entrySet()) {
            if (TelemetryWatchlistDbService.normalizeWinCcVariableKey(e.getKey()).equals(want)) {
                return e.getValue();
            }
        }
        return null;
    }

    private static void applyAlarmBandAndOutOfRange(TelemetryTagItemDto dto) {
        Double v = parseTelemetryNumeric(dto.getValue());
        if (v == null) {
            dto.setAlarmOutOfRange(null);
            dto.setAlarmBand(null);
            return;
        }
        Double min = parseTelemetryNumeric(dto.getAlarmMinValue());
        Double max = parseTelemetryNumeric(dto.getAlarmMaxValue());
        if (min == null && max == null) {
            dto.setAlarmOutOfRange(null);
            dto.setAlarmBand(null);
            return;
        }
        if (min != null && v < min) {
            dto.setAlarmOutOfRange(Boolean.TRUE);
            dto.setAlarmBand("LOW");
            return;
        }
        if (max != null && v > max) {
            dto.setAlarmOutOfRange(Boolean.TRUE);
            dto.setAlarmBand("HIGH");
            return;
        }
        dto.setAlarmOutOfRange(Boolean.FALSE);
        dto.setAlarmBand("OK");
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

    private static String trimOrNull(String s) {
        return StringUtils.hasText(s) ? s.trim() : null;
    }
}
