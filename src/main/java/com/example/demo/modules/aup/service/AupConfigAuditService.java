package com.example.demo.modules.aup.service;

import com.example.demo.modules.aup.entity.AupConfigChangeLog;
import com.example.demo.modules.aup.mapper.AupConfigChangeLogMapper;
import com.example.demo.modules.auth.entity.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * AUP 配置面变更记录统一出口。
 * <p>所有配置写操作（码表/字段/文件夹/模板的 CREATE/UPDATE/DELETE/MOVE/状态机流转）都必须经过本类，
 * 任何 Service 不得私自 insert {@code aup_config_change_log}。
 */
@Service
public class AupConfigAuditService {

    private final AupConfigChangeLogMapper mapper;
    private final ObjectMapper objectMapper;

    public AupConfigAuditService(AupConfigChangeLogMapper mapper, ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
    }

    /** 全参数日志入口（before/after 以 Object 传入，Jackson 序列化）。 */
    public void log(String entity, Long entityId, String entityCode, String entityName, String changeType,
                    Object before, Object after, String operatorId, String operator, String comment) {
        AupConfigChangeLog row = new AupConfigChangeLog();
        row.setEntity(entity);
        row.setEntityId(entityId);
        row.setEntityCode(entityCode);
        row.setEntityName(entityName);
        row.setChangeType(changeType);
        row.setBeforeJson(toJson(before));
        row.setAfterJson(toJson(after));
        row.setOperatorId(parseOperatorId(operatorId));
        row.setOperator(operator);
        row.setComment(comment);
        mapper.insert(row);
    }

    /** 便捷入口：从 {@link User} 解析操作人（operator=name 空则 username，operator_id 数字才落）。 */
    public void log(String entity, Long entityId, String entityCode, String entityName, String changeType,
                    Object before, Object after, User operator, String comment) {
        String operatorId = operator != null ? operator.getId() : null;
        String operatorName = null;
        if (operator != null) {
            operatorName = isBlank(operator.getName()) ? operator.getUsername() : operator.getName();
        }
        log(entity, entityId, entityCode, entityName, changeType, before, after, operatorId, operatorName, comment);
    }

    /** 分页查询 + 按 entity 分组计数（供前端分类 chip）。 */
    public Map<String, Object> query(String entity, String changeType, String operatorId, String keyword,
                                     String dateFrom, String dateTo, int page, int pageSize) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.max(pageSize, 1);
        int offset = (safePage - 1) * safeSize;
        Long operator = parseOperatorId(operatorId);
        LocalDateTime from = parseDate(dateFrom, false);
        LocalDateTime to = parseDate(dateTo, true);

        List<AupConfigChangeLog> items = mapper.listByFilter(entity, changeType, operator, keyword,
                from, to, safeSize, offset);
        int total = mapper.countByFilter(entity, changeType, operator, keyword, from, to);

        List<Map<String, Object>> summaries = new ArrayList<>();
        for (Map<String, Object> m : mapper.summarizeByEntity()) {
            Map<String, Object> s = new HashMap<>();
            s.put("entity", m.get("entity"));
            s.put("count", m.get("cnt"));
            summaries.add(s);
        }

        Map<String, Object> out = new HashMap<>();
        out.put("items", items);
        out.put("total", total);
        out.put("page", safePage);
        out.put("pageSize", safeSize);
        out.put("entitySummaries", summaries);
        return out;
    }

    private Long parseOperatorId(String id) {
        if (id == null || id.isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(id.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private LocalDateTime parseDate(String s, boolean endOfDayExclusive) {
        if (s == null || s.isBlank()) {
            return null;
        }
        try {
            LocalDate d = LocalDate.parse(s.trim());
            return endOfDayExclusive ? d.plusDays(1).atStartOfDay() : d.atStartOfDay();
        } catch (Exception e) {
            return null;
        }
    }

    private String toJson(Object o) {
        if (o == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(o);
        } catch (Exception e) {
            return null;
        }
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
