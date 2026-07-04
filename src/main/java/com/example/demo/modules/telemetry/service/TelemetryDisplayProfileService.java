package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.telemetry.dto.archive.TelemetryDisplayProfileDto;
import com.example.demo.modules.telemetry.entity.TelemetryDisplayProfileRow;
import com.example.demo.modules.telemetry.mapper.TelemetryDisplayProfileMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class TelemetryDisplayProfileService {

    private static final Logger log = LoggerFactory.getLogger(TelemetryDisplayProfileService.class);

    private final TelemetryDisplayProfileMapper mapper;
    private final ObjectMapper objectMapper;

    public TelemetryDisplayProfileService(TelemetryDisplayProfileMapper mapper, ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
    }

    public List<TelemetryDisplayProfileDto> listAll() {
        try {
            List<TelemetryDisplayProfileRow> rows = mapper.selectAll();
            if (rows == null || rows.isEmpty()) {
                return defaults();
            }
            List<TelemetryDisplayProfileDto> out = new ArrayList<>();
            for (TelemetryDisplayProfileRow r : rows) {
                out.add(toDto(r));
            }
            return out;
        } catch (Exception e) {
            log.warn("[遥测展示档] 读取失败，回退内置默认: {}", e.getMessage());
            return defaults();
        }
    }

    public TelemetryDisplayProfileDto getByCode(String code) {
        String c = normalizeCode(code);
        try {
            TelemetryDisplayProfileRow row = mapper.selectByCode(c);
            if (row != null) {
                return toDto(row);
            }
        } catch (Exception e) {
            log.warn("[遥测展示档] 读取 {} 失败: {}", c, e.getMessage());
        }
        return defaults().stream().filter(p -> c.equals(p.getCode())).findFirst().orElse(defaults().get(0));
    }

    @Transactional
    public TelemetryDisplayProfileDto save(TelemetryDisplayProfileDto body) {
        if (body == null || !StringUtils.hasText(body.getCode())) {
            throw new IllegalArgumentException("code 不能为空");
        }
        String code = normalizeCode(body.getCode());
        String label = StringUtils.hasText(body.getLabel()) ? body.getLabel().trim() : code;
        String configJson = StringUtils.hasText(body.getConfigJson())
                ? body.getConfigJson().trim()
                : defaultConfigJson(code);
        TelemetryDisplayProfileRow row = new TelemetryDisplayProfileRow();
        row.setCode(code);
        row.setLabel(label);
        row.setConfigJson(configJson);
        mapper.upsert(row);
        return getByCode(code);
    }

    public int resolveMaxPoints(String profileCode) {
        Map<String, Object> cfg = parseConfig(profileCode);
        Object mp = cfg.get("maxPoints");
        if (mp instanceof Number n) {
            return Math.min(500, Math.max(2, n.intValue()));
        }
        return "PRESENTATION".equalsIgnoreCase(normalizeCode(profileCode)) ? 120 : 240;
    }

    public Map<String, Object> parseConfig(String profileCode) {
        TelemetryDisplayProfileDto dto = getByCode(profileCode);
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = objectMapper.readValue(dto.getConfigJson(), Map.class);
            return m == null ? Map.of() : m;
        } catch (Exception e) {
            return Map.of();
        }
    }

    private static String normalizeCode(String code) {
        if (!StringUtils.hasText(code)) {
            return "STANDARD";
        }
        return code.trim().toUpperCase();
    }

    private static List<TelemetryDisplayProfileDto> defaults() {
        List<TelemetryDisplayProfileDto> list = new ArrayList<>();
        list.add(TelemetryDisplayProfileDto.builder()
                .code("STANDARD")
                .label("标准监测")
                .configJson(defaultConfigJson("STANDARD"))
                .build());
        list.add(TelemetryDisplayProfileDto.builder()
                .code("PRESENTATION")
                .label("参观展示")
                .configJson(defaultConfigJson("PRESENTATION"))
                .build());
        return list;
    }

    private static String defaultConfigJson(String code) {
        if ("PRESENTATION".equalsIgnoreCase(code)) {
            return "{\"downsample\":\"lttb\",\"smoothing\":\"ema\",\"emaWindow\":5,"
                    + "\"yAxisMode\":\"fixed_compliance\",\"showAlarmBands\":true,\"maxPoints\":120}";
        }
        return "{\"downsample\":\"min_max_bucket\",\"smoothing\":\"none\","
                + "\"yAxisMode\":\"auto_padded\",\"showAlarmBands\":true,\"maxPoints\":240}";
    }

    private TelemetryDisplayProfileDto toDto(TelemetryDisplayProfileRow r) {
        ZoneId z = ZoneId.systemDefault();
        return TelemetryDisplayProfileDto.builder()
                .code(r.getCode())
                .label(r.getLabel())
                .configJson(r.getConfigJson())
                .updateTime(r.getUpdateTime() == null ? null : r.getUpdateTime().atZone(z).toOffsetDateTime().toString())
                .build();
    }
}
