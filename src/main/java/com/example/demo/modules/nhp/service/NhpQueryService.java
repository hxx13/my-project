package com.example.demo.modules.nhp.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.entity.CrfConcept;
import com.example.demo.modules.nhp.entity.CrfTodo;
import com.example.demo.modules.nhp.mapper.CrfConceptMapper;
import com.example.demo.modules.nhp.mapper.CrfSeriesQueryMapper;
import com.example.demo.modules.nhp.mapper.CrfSubjectMapper;
import com.example.demo.modules.nhp.mapper.CrfTodoMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.*;

/**
 * NHP 读侧聚合：概念序列 / 待办 / 任务等（22 §6.4 / 29 契约）。
 */
@Service
public class NhpQueryService {

    private final CrfSeriesQueryMapper seriesQueryMapper;
    private final CrfConceptMapper conceptMapper;
    private final CrfSubjectMapper subjectMapper;
    private final CrfTodoMapper todoMapper;
    private final NhpGovernanceQueryService governanceQueryService;

    public NhpQueryService(CrfSeriesQueryMapper seriesQueryMapper,
                           CrfConceptMapper conceptMapper,
                           CrfSubjectMapper subjectMapper,
                           CrfTodoMapper todoMapper,
                           NhpGovernanceQueryService governanceQueryService) {
        this.seriesQueryMapper = seriesQueryMapper;
        this.conceptMapper = conceptMapper;
        this.subjectMapper = subjectMapper;
        this.todoMapper = todoMapper;
        this.governanceQueryService = governanceQueryService;
    }

    /**
     * 序列网格：有 conceptCode → 单指标纵向；无 → 多指标网格 {indicators, rows}。
     * 兼容旧路径：单 concept 时也返回网格形状（一个 indicator）。
     */
    public Result<Map<String, Object>> listSeries(Long subjectId, String conceptCode,
                                                  String from, String to) {
        if (subjectId == null) {
            return Result.fail(400, "subjectId 必填");
        }
        if (subjectMapper.findById(subjectId) == null) {
            return Result.fail(404, "研究对象不存在");
        }

        List<Map<String, Object>> raw;
        if (conceptCode == null || conceptCode.isBlank()) {
            raw = seriesQueryMapper.listSeriesMulti(subjectId);
        } else {
            CrfConcept concept = conceptMapper.findByCode(conceptCode.trim());
            if (concept == null) {
                return Result.fail(404, "概念码不存在: " + conceptCode);
            }
            raw = seriesQueryMapper.listSeries(subjectId, concept.getConceptCode());
        }

        LocalDateTime fromTs = parseTs(from);
        LocalDateTime toTs = parseTs(to);
        List<Map<String, Object>> filtered = new ArrayList<>();
        for (Map<String, Object> row : raw) {
            LocalDateTime at = asDateTime(row.get("observedAt"));
            if (at != null) {
                if (fromTs != null && at.isBefore(fromTs)) continue;
                if (toTs != null && at.isAfter(toTs)) continue;
            }
            filtered.add(row);
        }

        return Result.success(toSeriesGrid(filtered));
    }

    /** 兼容旧调用方：返回纵向列表（仅单 concept）。 */
    public Result<List<Map<String, Object>>> listSeriesLegacy(Long subjectId, String conceptCode,
                                                              String from, String to) {
        Result<Map<String, Object>> grid = listSeries(subjectId, conceptCode, from, to);
        if (!Boolean.TRUE.equals(grid.getSuccess())) {
            return Result.fail(grid.getCode() == null ? 500 : grid.getCode(), grid.getMessage());
        }
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) grid.getData().get("rows");
        List<Map<String, Object>> flat = new ArrayList<>();
        if (rows != null) {
            for (Map<String, Object> r : rows) {
                Map<String, Object> m = new LinkedHashMap<>(r);
                flat.add(m);
            }
        }
        return Result.success(flat);
    }

    public Result<List<CrfConcept>> listConcepts() {
        return Result.success(conceptMapper.list());
    }

    public Result<List<CrfTodo>> listTodoBySubject(Long subjectId) {
        if (subjectId == null) {
            return Result.fail(400, "subjectId 必填");
        }
        List<CrfTodo> todos = todoMapper.listBySubjectId(subjectId);
        // OVERDUE 派生：OPEN + due_date < today（不落库）
        java.time.LocalDate today = java.time.LocalDate.now();
        for (CrfTodo t : todos) {
            if ("OPEN".equalsIgnoreCase(t.getStatus())
                    && t.getDueDate() != null
                    && t.getDueDate().isBefore(today)) {
                t.setStatus("OVERDUE");
            }
        }
        return Result.success(todos);
    }

    public Result<List<Map<String, Object>>> listMyTasks() {
        return Result.success(governanceQueryService.listMyTasks());
    }

    /** 更新待办状态（OPEN/DONE/CANCELLED）；OVERDUE 为派生态不接受写入。 */
    public Result<CrfTodo> updateTodoStatus(Long id, Map<String, Object> body) {
        if (id == null) {
            return Result.fail(400, "id 必填");
        }
        CrfTodo todo = todoMapper.findById(id);
        if (todo == null) {
            return Result.fail(404, "待办不存在");
        }
        String status = str(body == null ? null : body.get("status"));
        if (status == null || !Set.of("OPEN", "DONE", "CANCELLED").contains(status.toUpperCase())) {
            return Result.fail(400, "status 须为 OPEN/DONE/CANCELLED");
        }
        todoMapper.updateStatus(id, status.toUpperCase());
        return Result.success(todoMapper.findById(id));
    }

    private Map<String, Object> toSeriesGrid(List<Map<String, Object>> raw) {
        LinkedHashMap<String, Map<String, Object>> indicators = new LinkedHashMap<>();
        // rowKey = observedAt string → values by concept
        LinkedHashMap<String, Map<String, Object>> rowMap = new LinkedHashMap<>();

        for (Map<String, Object> r : raw) {
            String concept = str(r.get("conceptCode"));
            if (concept == null) continue;
            indicators.computeIfAbsent(concept, c -> {
                Map<String, Object> ind = new LinkedHashMap<>();
                ind.put("code", c);
                String label = str(r.get("nameCn"));
                if (label == null) label = str(r.get("nameEn"));
                if (label == null) label = c;
                ind.put("label", label);
                ind.put("unit", r.get("unit"));
                return ind;
            });

            String at = stringifyTs(r.get("observedAt"));
            String rowId = at != null ? at : ("v" + r.get("valueId"));
            Map<String, Object> row = rowMap.computeIfAbsent(rowId, id -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("rowId", id);
                m.put("recordedAt", at);
                m.put("recordedBy", null);
                m.put("values", new LinkedHashMap<String, Object>());
                return m;
            });
            @SuppressWarnings("unchecked")
            Map<String, Object> values = (Map<String, Object>) row.get("values");
            Object display = r.get("valueDisplay");
            if (display == null) display = r.get("valueDecimal");
            if (display == null) display = r.get("valueInt");
            if (display == null) display = r.get("valueString");
            values.put(concept, display);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("indicators", new ArrayList<>(indicators.values()));
        out.put("rows", new ArrayList<>(rowMap.values()));
        return out;
    }

    private static String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static String stringifyTs(Object v) {
        LocalDateTime at = asDateTime(v);
        return at == null ? (v == null ? null : String.valueOf(v)) : at.toString();
    }

    private static LocalDateTime parseTs(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            String s = raw.trim();
            if (s.length() == 10) {
                return LocalDateTime.parse(s + "T00:00:00");
            }
            return LocalDateTime.parse(s.contains("T") ? s : s.replace(' ', 'T'));
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static LocalDateTime asDateTime(Object v) {
        if (v == null) return null;
        if (v instanceof LocalDateTime ldt) return ldt;
        if (v instanceof java.sql.Timestamp ts) return ts.toLocalDateTime();
        if (v instanceof java.util.Date d) {
            return LocalDateTime.ofInstant(d.toInstant(), java.time.ZoneId.systemDefault());
        }
        return parseTs(String.valueOf(v));
    }
}
