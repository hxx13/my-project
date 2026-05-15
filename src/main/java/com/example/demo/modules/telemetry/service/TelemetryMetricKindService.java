package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.telemetry.dto.watchlist.TelemetryMetricKindDto;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryMetricKindWriteDto;
import com.example.demo.modules.telemetry.entity.TelemetryMetricKindRow;
import com.example.demo.modules.telemetry.mapper.TelemetryMetricKindMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Service
public class TelemetryMetricKindService {

    private final TelemetryMetricKindMapper kindMapper;

    public TelemetryMetricKindService(TelemetryMetricKindMapper kindMapper) {
        this.kindMapper = kindMapper;
    }

    public List<TelemetryMetricKindDto> listAll() {
        List<TelemetryMetricKindRow> rows = kindMapper.selectAllOrderBySort();
        List<TelemetryMetricKindDto> out = new ArrayList<>();
        if (rows != null) {
            for (TelemetryMetricKindRow r : rows) {
                out.add(toDto(r));
            }
        }
        return out;
    }

    @Transactional
    public TelemetryMetricKindDto create(TelemetryMetricKindWriteDto w) {
        String code = normalizeCode(w.getCode());
        if (kindMapper.selectByCode(code) != null) {
            throw new IllegalArgumentException("code 已存在: " + code);
        }
        TelemetryMetricKindRow row = new TelemetryMetricKindRow();
        row.setCode(code);
        row.setLabelZh(w.getLabelZh() == null ? code : w.getLabelZh().trim());
        row.setKindRole(normalizeKindRole(w.getKindRole()));
        row.setSortOrder(w.getSortOrder() != null ? w.getSortOrder() : 100);
        row.setBuiltin(0);
        row.setActive(Boolean.FALSE.equals(w.getActive()) ? 0 : 1);
        kindMapper.insert(row);
        return toDto(kindMapper.selectByCode(code));
    }

    @Transactional
    public TelemetryMetricKindDto update(String code, TelemetryMetricKindWriteDto w) {
        String c = normalizeCode(code);
        TelemetryMetricKindRow existing = kindMapper.selectByCode(c);
        if (existing == null) {
            throw new IllegalArgumentException("未找到指标类型: " + c);
        }
        TelemetryMetricKindRow row = new TelemetryMetricKindRow();
        row.setCode(c);
        row.setLabelZh(StringUtils.hasText(w.getLabelZh()) ? w.getLabelZh().trim() : existing.getLabelZh());
        row.setKindRole(normalizeKindRole(
                StringUtils.hasText(w.getKindRole()) ? w.getKindRole() : existing.getKindRole()));
        row.setSortOrder(w.getSortOrder() != null ? w.getSortOrder() : existing.getSortOrder());
        row.setActive(w.getActive() == null ? existing.getActive() : (Boolean.FALSE.equals(w.getActive()) ? 0 : 1));
        kindMapper.updateByCode(row);
        return toDto(kindMapper.selectByCode(c));
    }

    @Transactional
    public void delete(String code) {
        String c = normalizeCode(code);
        TelemetryMetricKindRow existing = kindMapper.selectByCode(c);
        if (existing == null) {
            return;
        }
        if (existing.getBuiltin() != null && existing.getBuiltin() == 1) {
            throw new IllegalArgumentException("内置指标类型不可删除: " + c);
        }
        kindMapper.deleteByCode(c);
    }

    private static String normalizeCode(String code) {
        if (!StringUtils.hasText(code)) {
            throw new IllegalArgumentException("code 不能为空");
        }
        return code.trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9_]+", "_");
    }

    private static String normalizeKindRole(String raw) {
        if (!StringUtils.hasText(raw)) {
            return "METRIC";
        }
        String u = raw.trim().toUpperCase(Locale.ROOT);
        return switch (u) {
            case "LIMIT_MIN", "LIMIT_MAX", "SWITCH", "SETPOINT", "METRIC" -> u;
            default -> "METRIC";
        };
    }

    private static TelemetryMetricKindDto toDto(TelemetryMetricKindRow r) {
        if (r == null) {
            return null;
        }
        return TelemetryMetricKindDto.builder()
                .id(r.getId())
                .code(r.getCode())
                .labelZh(r.getLabelZh())
                .kindRole(normalizeKindRole(r.getKindRole()))
                .sortOrder(r.getSortOrder())
                .builtin(r.getBuiltin() != null && r.getBuiltin() == 1)
                .active(r.getActive() == null || r.getActive() != 0)
                .build();
    }
}
