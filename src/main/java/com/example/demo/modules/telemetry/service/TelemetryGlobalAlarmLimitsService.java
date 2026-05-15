package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.telemetry.dto.watchlist.TelemetryGlobalAlarmLimitsDto;
import com.example.demo.modules.telemetry.entity.TelemetryGlobalAlarmLimitsRow;
import com.example.demo.modules.telemetry.mapper.TelemetryGlobalAlarmLimitsMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 全局报警上下限（{@code telemetry_global_alarm_limits}，单例行）。
 */
@Service
public class TelemetryGlobalAlarmLimitsService {

    private static final Logger log = LoggerFactory.getLogger(TelemetryGlobalAlarmLimitsService.class);

    private final TelemetryGlobalAlarmLimitsMapper mapper;

    public TelemetryGlobalAlarmLimitsService(TelemetryGlobalAlarmLimitsMapper mapper) {
        this.mapper = mapper;
    }

    public TelemetryGlobalAlarmLimitsDto load() {
        try {
            ensureRowExists();
            TelemetryGlobalAlarmLimitsRow row = mapper.selectSingleton();
            if (row == null) {
                return emptyDto();
            }
            return TelemetryGlobalAlarmLimitsDto.builder()
                    .tempMin(trimToNull(row.getTempMin()))
                    .tempMax(trimToNull(row.getTempMax()))
                    .humMin(trimToNull(row.getHumMin()))
                    .humMax(trimToNull(row.getHumMax()))
                    .pressureMin(trimToNull(row.getPressureMin()))
                    .pressureMax(trimToNull(row.getPressureMax()))
                    .build();
        } catch (Exception e) {
            log.warn("[WinCC遥测] 读取全局报警限失败（表是否已执行 telemetry-global-alarm-limits.sql？）: {}", e.getMessage());
            return emptyDto();
        }
    }

    @Transactional
    public TelemetryGlobalAlarmLimitsDto save(TelemetryGlobalAlarmLimitsDto body) {
        ensureRowExists();
        TelemetryGlobalAlarmLimitsDto normalized = normalize(body);
        mapper.updateSingleton(
                normalized.getTempMin(),
                normalized.getTempMax(),
                normalized.getHumMin(),
                normalized.getHumMax(),
                normalized.getPressureMin(),
                normalized.getPressureMax());
        return load();
    }

    private void ensureRowExists() {
        mapper.insertSingletonIfMissing();
    }

    private static TelemetryGlobalAlarmLimitsDto emptyDto() {
        return TelemetryGlobalAlarmLimitsDto.builder().build();
    }

    private static TelemetryGlobalAlarmLimitsDto normalize(TelemetryGlobalAlarmLimitsDto in) {
        if (in == null) {
            return emptyDto();
        }
        return TelemetryGlobalAlarmLimitsDto.builder()
                .tempMin(blankToNull(in.getTempMin()))
                .tempMax(blankToNull(in.getTempMax()))
                .humMin(blankToNull(in.getHumMin()))
                .humMax(blankToNull(in.getHumMax()))
                .pressureMin(blankToNull(in.getPressureMin()))
                .pressureMax(blankToNull(in.getPressureMax()))
                .build();
    }

    private static String blankToNull(String s) {
        return StringUtils.hasText(s) ? s.trim() : null;
    }

    private static String trimToNull(String s) {
        return StringUtils.hasText(s) ? s.trim() : null;
    }
}
