package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.telemetry.dto.archive.TelemetryChartGroupDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryChartGroupVariableMetaDto;
import com.example.demo.modules.telemetry.entity.TelemetryChartGroupRow;
import com.example.demo.modules.telemetry.mapper.TelemetryChartGroupMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Service
public class TelemetryChartGroupService {

    private static final Logger log = LoggerFactory.getLogger(TelemetryChartGroupService.class);

    private final TelemetryChartGroupMapper mapper;
    private final ObjectMapper objectMapper;

    public TelemetryChartGroupService(TelemetryChartGroupMapper mapper, ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
    }

    public List<TelemetryChartGroupDto> listAll() {
        return listAll(false);
    }

    public List<TelemetryChartGroupDto> listAll(boolean debug) {
        List<TelemetryChartGroupRow> rows = mapper.selectAll();
        List<TelemetryChartGroupDto> out = new ArrayList<>();
        if (rows != null) {
            for (TelemetryChartGroupRow r : rows) {
                out.add(toDto(r));
            }
        }
        if (debug) {
            log.info("[telemetry-insights] chart-groups listAll count={}", out.size());
        }
        return out;
    }

    public TelemetryChartGroupDto getById(long id) {
        TelemetryChartGroupRow row = mapper.selectById(id);
        if (row == null) {
            throw new IllegalArgumentException("对比组不存在: " + id);
        }
        return toDto(row);
    }

    @Transactional
    public TelemetryChartGroupDto create(TelemetryChartGroupDto body) {
        TelemetryChartGroupRow row = fromWrite(body);
        row.setId(null);
        if (!StringUtils.hasText(row.getSource())) {
            row.setSource("manual");
        }
        mapper.insert(row);
        return getById(row.getId());
    }

    @Transactional
    public TelemetryChartGroupDto update(long id, TelemetryChartGroupDto body) {
        if (mapper.selectById(id) == null) {
            throw new IllegalArgumentException("对比组不存在: " + id);
        }
        TelemetryChartGroupRow row = fromWrite(body);
        row.setId(id);
        mapper.update(row);
        return getById(id);
    }

    @Transactional
    public void delete(long id) {
        mapper.deleteById(id);
    }

    private TelemetryChartGroupRow fromWrite(TelemetryChartGroupDto body) {
        if (body == null || !StringUtils.hasText(body.getName())) {
            throw new IllegalArgumentException("name 不能为空");
        }
        List<TelemetryChartGroupVariableMetaDto> meta = body.getVariableMetadata() == null
                ? List.of()
                : body.getVariableMetadata();
        List<String> vars = resolveVariableNames(body.getVariableNames(), meta);
        if (vars.isEmpty()) {
            throw new IllegalArgumentException("variableNames 不能为空");
        }
        TelemetryChartGroupRow row = new TelemetryChartGroupRow();
        row.setName(body.getName().trim());
        row.setDescription(StringUtils.hasText(body.getDescription()) ? body.getDescription().trim() : null);
        try {
            row.setVariableNamesJson(objectMapper.writeValueAsString(vars));
            if (!meta.isEmpty()) {
                row.setVariableMetadataJson(objectMapper.writeValueAsString(meta));
            }
        } catch (Exception e) {
            throw new IllegalArgumentException("变量序列化失败");
        }
        row.setLayoutMode(StringUtils.hasText(body.getLayoutMode()) ? body.getLayoutMode().trim() : "small_multiples");
        row.setSource(StringUtils.hasText(body.getSource()) ? body.getSource().trim() : "manual");
        row.setSortOrder(body.getSortOrder() == null ? 0 : body.getSortOrder());
        return row;
    }

    private List<String> resolveVariableNames(List<String> names, List<TelemetryChartGroupVariableMetaDto> meta) {
        Set<String> out = new LinkedHashSet<>();
        if (names != null) {
            for (String n : names) {
                if (StringUtils.hasText(n)) {
                    out.add(n.trim());
                }
            }
        }
        if (meta != null) {
            for (TelemetryChartGroupVariableMetaDto m : meta) {
                if (m != null && StringUtils.hasText(m.getVariableName())) {
                    out.add(m.getVariableName().trim());
                }
            }
        }
        return new ArrayList<>(out);
    }

    private TelemetryChartGroupDto toDto(TelemetryChartGroupRow r) {
        ZoneId z = ZoneId.systemDefault();
        List<String> vars = List.of();
        List<TelemetryChartGroupVariableMetaDto> meta = List.of();
        try {
            if (StringUtils.hasText(r.getVariableNamesJson())) {
                vars = objectMapper.readValue(r.getVariableNamesJson(), new TypeReference<List<String>>() {});
            }
            if (StringUtils.hasText(r.getVariableMetadataJson())) {
                meta = objectMapper.readValue(
                        r.getVariableMetadataJson(),
                        new TypeReference<List<TelemetryChartGroupVariableMetaDto>>() {});
            }
        } catch (Exception ignored) {
            vars = List.of();
            meta = List.of();
        }
        return TelemetryChartGroupDto.builder()
                .id(r.getId())
                .name(r.getName())
                .description(r.getDescription())
                .variableNames(vars)
                .variableMetadata(meta)
                .layoutMode(r.getLayoutMode())
                .source(r.getSource())
                .sortOrder(r.getSortOrder())
                .createTime(r.getCreateTime() == null ? null : r.getCreateTime().atZone(z).toOffsetDateTime().toString())
                .updateTime(r.getUpdateTime() == null ? null : r.getUpdateTime().atZone(z).toOffsetDateTime().toString())
                .build();
    }
}
