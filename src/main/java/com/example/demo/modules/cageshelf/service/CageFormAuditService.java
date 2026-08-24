package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.cageshelf.entity.CageFormAuditLog;
import com.example.demo.modules.cageshelf.entity.CageFormTemplateVersion;
import com.example.demo.modules.cageshelf.mapper.CageFormAuditLogMapper;
import com.example.demo.modules.cageshelf.mapper.CageFormTemplateVersionMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * 笼位表单审计写入 + 分页查询；发布版本快照。
 */
@Service
public class CageFormAuditService {

    public static final String CATEGORY_DATA = "data";
    public static final String CATEGORY_DICT = "dict";
    public static final String FORM_KEY_DEFAULT = "cage_detail";

    private static final ObjectMapper OM = new ObjectMapper();

    private final CageFormAuditLogMapper auditLogMapper;
    private final CageFormTemplateVersionMapper versionMapper;
    private final UserDisplayNameService userDisplayNameService;

    public CageFormAuditService(CageFormAuditLogMapper auditLogMapper,
                                CageFormTemplateVersionMapper versionMapper,
                                UserDisplayNameService userDisplayNameService) {
        this.auditLogMapper = auditLogMapper;
        this.versionMapper = versionMapper;
        this.userDisplayNameService = userDisplayNameService;
    }

    public void logDictChange(String changeType, String entity, Long entityId,
                              String entityCode, String entityName,
                              Object before, Object after, String operatorId) {
        CageFormAuditLog row = base(CATEGORY_DICT, changeType, operatorId);
        row.setEntity(entity);
        row.setEntityId(entityId);
        row.setEntityCode(entityCode);
        row.setEntityName(entityName);
        row.setBeforeJson(toJson(before));
        row.setAfterJson(toJson(after));
        auditLogMapper.insert(row);
    }

    public void logDataChange(String changeType, String entity, Long entityId,
                              String entityCode, String entityName,
                              String targetType, Long targetId, String targetLabel,
                              String fieldCode, String fieldName,
                              String beforeValue, String afterValue,
                              String operatorId) {
        CageFormAuditLog row = base(CATEGORY_DATA, changeType, operatorId);
        row.setEntity(entity);
        row.setEntityId(entityId);
        row.setEntityCode(entityCode);
        row.setEntityName(entityName);
        row.setTargetType(targetType);
        row.setTargetId(targetId);
        row.setTargetLabel(targetLabel);
        row.setFieldCode(fieldCode);
        row.setFieldName(fieldName);
        row.setBeforeValue(truncate(beforeValue, 2000));
        row.setAfterValue(truncate(afterValue, 2000));
        auditLogMapper.insert(row);
    }

    public void logDataJson(String changeType, String entity, Long entityId,
                            String entityCode, String entityName,
                            String targetType, Long targetId, String targetLabel,
                            Object before, Object after, String operatorId) {
        CageFormAuditLog row = base(CATEGORY_DATA, changeType, operatorId);
        row.setEntity(entity);
        row.setEntityId(entityId);
        row.setEntityCode(entityCode);
        row.setEntityName(entityName);
        row.setTargetType(targetType);
        row.setTargetId(targetId);
        row.setTargetLabel(targetLabel);
        row.setBeforeJson(toJson(before));
        row.setAfterJson(toJson(after));
        auditLogMapper.insert(row);
    }

    public CageFormTemplateVersion bumpFormVersion(String formKey, int fieldCount, String operatorId) {
        String key = StringUtils.hasText(formKey) ? formKey : FORM_KEY_DEFAULT;
        CageFormTemplateVersion latest = versionMapper.selectLatest(key);
        int next = latest == null || latest.getVersionNo() == null ? 1 : latest.getVersionNo() + 1;
        CageFormTemplateVersion row = new CageFormTemplateVersion();
        row.setFormKey(key);
        row.setVersionNo(next);
        row.setFieldCount(fieldCount);
        row.setPublishedBy(operatorId);
        versionMapper.insert(row);
        logDictChange("PUBLISH", "form", null, key, "笼位详情表单",
                latest == null ? null : Map.of("versionNo", latest.getVersionNo()),
                Map.of("versionNo", next, "fieldCount", fieldCount),
                operatorId);
        return row;
    }

    public CageFormTemplateVersion getLatestVersion(String formKey) {
        return versionMapper.selectLatest(StringUtils.hasText(formKey) ? formKey : FORM_KEY_DEFAULT);
    }

    public List<CageFormTemplateVersion> listVersions(String formKey) {
        return versionMapper.selectAllByFormKey(StringUtils.hasText(formKey) ? formKey : FORM_KEY_DEFAULT);
    }

    public Map<String, Object> pageAudit(String category, String keyword, String changeType,
                                         String entity, String operatorId,
                                         String dateFrom, String dateTo,
                                         int page, int pageSize) {
        int p = Math.max(page, 1);
        int sz = Math.min(Math.max(pageSize, 1), 200);
        int offset = (p - 1) * sz;
        String cat = blankToNull(category);
        String kw = blankToNull(keyword);
        String ct = blankToNull(changeType);
        String ent = blankToNull(entity);
        String op = blankToNull(operatorId);
        String df = blankToNull(dateFrom);
        String dt = blankToNull(dateTo);

        long total = auditLogMapper.countFiltered(cat, kw, ct, ent, op, df, dt);
        List<CageFormAuditLog> rows = auditLogMapper.listFiltered(cat, kw, ct, ent, op, df, dt, offset, sz);
        enrichOperatorNames(rows);

        List<Map<String, Object>> items = new ArrayList<>();
        for (CageFormAuditLog row : rows) {
            items.add(toMap(row));
        }

        List<Map<String, Object>> entitySummaries = new ArrayList<>();
        for (Map<String, Object> m : auditLogMapper.countByEntity(cat)) {
            String e = m.get("entity") == null ? null : String.valueOf(m.get("entity"));
            long cnt = m.get("cnt") instanceof Number n ? n.longValue() : 0L;
            Map<String, Object> sm = new LinkedHashMap<>();
            sm.put("entity", e);
            sm.put("label", entityLabel(e));
            sm.put("count", cnt);
            entitySummaries.add(sm);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", total);
        out.put("page", p);
        out.put("pageSize", sz);
        out.put("entitySummaries", entitySummaries);
        return out;
    }

    private Map<String, Object> toMap(CageFormAuditLog row) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", row.getId());
        m.put("category", row.getCategory());
        m.put("changeType", row.getChangeType());
        m.put("entity", row.getEntity());
        m.put("entityId", row.getEntityId());
        m.put("entityCode", row.getEntityCode());
        m.put("entityName", row.getEntityName());
        m.put("targetType", row.getTargetType());
        m.put("targetId", row.getTargetId());
        m.put("targetLabel", row.getTargetLabel());
        m.put("fieldCode", row.getFieldCode());
        m.put("fieldName", row.getFieldName());
        m.put("beforeValue", row.getBeforeValue());
        m.put("afterValue", row.getAfterValue());
        m.put("beforeJson", row.getBeforeJson());
        m.put("afterJson", row.getAfterJson());
        m.put("operatorId", row.getOperatorId());
        m.put("operatorName", row.getOperatorName());
        m.put("operator", displayNameOrId(row.getOperatorName(), row.getOperatorId()));
        m.put("createdAt", row.getCreatedAt());
        return m;
    }

    private void enrichOperatorNames(List<CageFormAuditLog> rows) {
        if (rows == null || rows.isEmpty()) return;
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (CageFormAuditLog r : rows) {
            if (r != null && StringUtils.hasText(r.getOperatorId())) ids.add(r.getOperatorId());
        }
        if (ids.isEmpty()) return;
        Map<String, String> names = userDisplayNameService.resolveDisplayNames(ids);
        for (CageFormAuditLog r : rows) {
            if (r == null || !StringUtils.hasText(r.getOperatorId())) continue;
            String n = names.get(r.getOperatorId());
            if (StringUtils.hasText(n)) r.setOperatorName(n);
        }
    }

    private static CageFormAuditLog base(String category, String changeType, String operatorId) {
        CageFormAuditLog row = new CageFormAuditLog();
        row.setCategory(category);
        row.setChangeType(changeType);
        row.setOperatorId(operatorId);
        return row;
    }

    private static String entityLabel(String entity) {
        if (entity == null) return "—";
        return switch (entity) {
            case "field" -> "字段";
            case "codelist" -> "码表";
            case "form" -> "表单";
            case "claim" -> "认领";
            case "cage_box" -> "笼盒";
            default -> entity;
        };
    }

    private static String displayNameOrId(String name, String id) {
        if (StringUtils.hasText(name)) return name;
        return StringUtils.hasText(id) ? id : "—";
    }

    private static String blankToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }

    private static String toJson(Object o) {
        if (o == null) return null;
        try {
            return OM.writeValueAsString(o);
        } catch (Exception e) {
            return null;
        }
    }
}
