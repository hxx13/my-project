package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.cageshelf.entity.CageFormAuditLog;
import com.example.demo.modules.cageshelf.entity.CageFormTemplateVersion;
import com.example.demo.modules.cageshelf.mapper.CageCellIndexMapper;
import com.example.demo.modules.cageshelf.mapper.CageFormAuditLogMapper;
import com.example.demo.modules.cageshelf.mapper.CageFormTemplateVersionMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 笼位表单审计写入 + 分页查询；发布版本快照。
 */
@Service
public class CageFormAuditService {

    public static final String CATEGORY_DATA = "data";
    public static final String CATEGORY_DICT = "dict";
    public static final String FORM_KEY_DEFAULT = "cage_detail";

    /** 值迁入该笼位的结构性写入。 */
    private static final Set<String> IN_TYPES = Set.of("TRANSFER", "COPY", "DIVIDE", "INHERIT", "BIND");
    /** 值离开该笼位的结构性写入。 */
    private static final Set<String> OUT_TYPES = Set.of("ARCHIVE", "EXIT", "UNBIND", "UNALLOCATE", "TRANSFER_OUT");
    private static final String KIND_EDIT = "EDIT";
    private static final DateTimeFormatter SEC_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private static final ObjectMapper OM = new ObjectMapper();

    private final CageFormAuditLogMapper auditLogMapper;
    private final CageFormTemplateVersionMapper versionMapper;
    private final UserDisplayNameService userDisplayNameService;
    private final CageCellIndexMapper cellIndexMapper;

    public CageFormAuditService(CageFormAuditLogMapper auditLogMapper,
                                CageFormTemplateVersionMapper versionMapper,
                                UserDisplayNameService userDisplayNameService,
                                CageCellIndexMapper cellIndexMapper) {
        this.auditLogMapper = auditLogMapper;
        this.versionMapper = versionMapper;
        this.userDisplayNameService = userDisplayNameService;
        this.cellIndexMapper = cellIndexMapper;
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
                                         String entity, String operatorId, Long personId,
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

        long total = auditLogMapper.countFiltered(cat, kw, ct, ent, op, personId, df, dt);
        List<CageFormAuditLog> rows = auditLogMapper.listFiltered(cat, kw, ct, ent, op, personId, df, dt, offset, sz);
        enrichOperatorNames(rows);

        List<Map<String, Object>> items = new ArrayList<>();
        for (CageFormAuditLog row : rows) {
            items.add(toMap(row));
        }
        attachCageLabels(items);

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

    /**
     * 某笼位的历史记录 — 按「事件」聚合成时间轴。
     *
     * 同一次操作（同 changeType + 同一秒）的多个字段变化归为一个事件。每个事件带该时刻的整表
     * 快照 before/after（从空表起按时间顺序折叠 after 值得到），前端据此渲染「字段可点开看历史」
     * 或「旧表单 → 箭头 → 新表单」。
     */
    public Map<String, Object> cageHistory(Long animalCageId) {
        List<CageFormAuditLog> rows = auditLogMapper.listByTargetId(animalCageId, CATEGORY_DATA);
        enrichOperatorNames(rows);

        Map<String, String> state = new LinkedHashMap<>();       // fieldCode → 折叠到当前事件为止的值
        Map<String, String> fieldLabels = new LinkedHashMap<>(); // fieldCode → 最后一次已知字段名
        List<Map<String, Object>> events = new ArrayList<>();
        List<Map<String, String>> beforeStates = new ArrayList<>();

        String currentKey = null;
        Map<String, Object> current = null;
        for (CageFormAuditLog r : rows) {
            if (r == null) continue;
            String key = r.getChangeType() + "@" + r.getCreatedAt();
            if (!key.equals(currentKey)) {
                currentKey = key;
                beforeStates.add(new LinkedHashMap<>(state));
                current = newEvent(r);
                events.add(current);
            }
            addChange(current, r);
            String code = r.getFieldCode();
            if (StringUtils.hasText(code)) {
                if (StringUtils.hasText(r.getFieldName())) fieldLabels.put(code, r.getFieldName());
                if (r.getAfterValue() == null) state.remove(code);
                else state.put(code, r.getAfterValue());
            }
        }

        // 事件的 after 快照 = 下一个事件的 before 快照；最后一个 = 折叠终态
        for (int i = 0; i < events.size(); i++) {
            events.get(i).put("beforeState", beforeStates.get(i));
            events.get(i).put("afterState", i + 1 < events.size() ? beforeStates.get(i + 1) : state);
        }

        boolean hasStructural = false;
        for (Map<String, Object> e : events) {
            if (!KIND_EDIT.equals(e.get("kind"))) { hasStructural = true; break; }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("animalCageId", animalCageId);
        out.put("cageLabel", cageLabel(animalCageId));
        out.put("fieldLabels", fieldLabels);
        out.put("current", state);
        out.put("hasStructural", hasStructural);
        out.put("events", events);
        return out;
    }

    /** 笼位位置映射「校区/房间/笼架 A-10」——坐标口径与前端 displayPosition 一致（列转字母、行号取反）。 */
    private String cageLabel(Long animalCageId) {
        if (animalCageId == null) return null;
        try {
            return locationLabel(cellIndexMapper.lookupByAnimalCageId(animalCageId));
        } catch (Exception e) {
            return null;
        }
    }

    private static String locationLabel(Map<String, Object> loc) {
        if (loc == null) return null;
        return String.format("%s/%s/%s %s",
                loc.getOrDefault("campusName", "?"), loc.getOrDefault("roomName", "?"),
                loc.getOrDefault("shelveName", "?"),
                positionDisplay(loc.get("positionX"), loc.get("positionY")));
    }

    /** 展示坐标与网格一致：后端 x/y 是数字网格（左上为 1,1），展示成 A-10 这种列字母 + 反转行号。 */
    private static String positionDisplay(Object x, Object y) {
        if (!(x instanceof Number nx) || !(y instanceof Number ny)) return "?";
        return String.format("%s-%d", (char) ('A' + nx.intValue() - 1), 11 - ny.intValue());
    }

    private Map<String, Object> newEvent(CageFormAuditLog r) {
        String ct = r.getChangeType();
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("changeType", ct);
        e.put("kind", IN_TYPES.contains(ct) ? "IN" : OUT_TYPES.contains(ct) ? "OUT" : KIND_EDIT);
        e.put("at", r.getCreatedAt());
        e.put("operator", displayNameOrId(r.getOperatorName(), r.getOperatorId()));
        e.put("changes", new ArrayList<Map<String, Object>>());
        return e;
    }

    @SuppressWarnings("unchecked")
    private void addChange(Map<String, Object> event, CageFormAuditLog r) {
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("canonical", r.getFieldCode());
        c.put("label", StringUtils.hasText(r.getFieldName()) ? r.getFieldName() : r.getFieldCode());
        c.put("before", r.getBeforeValue());
        c.put("after", r.getAfterValue());
        ((List<Map<String, Object>>) event.get("changes")).add(c);
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

    /**
     * 留痕页（按操作聚合）—— 把字段级碎片按「同笼位 + 同类型 + 同一秒」收成一次操作，
     * 每项带该次操作的全部字段变化。`operatorKind` 在通用条件之上再分「人工 / 系统同步」一层。
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> pageOperations(String category, String changeType, String operatorId,
                                              Long personId, String operatorKind,
                                              String dateFrom, String dateTo, int page, int pageSize) {
        int p = Math.max(page, 1);
        int sz = Math.min(Math.max(pageSize, 1), 200);
        int offset = (p - 1) * sz;
        String cat = blankToNull(category);
        String ct = blankToNull(changeType);
        String op = blankToNull(operatorId);
        String kind = blankToNull(operatorKind);
        String df = blankToNull(dateFrom);
        String dt = blankToNull(dateTo);

        long total = auditLogMapper.countOperationGroups(cat, null, ct, null, op, personId, kind, df, dt);
        List<Map<String, Object>> groups = auditLogMapper.pageOperationGroups(cat, null, ct, null, op, personId, kind, df, dt, offset, sz);

        List<Map<String, Object>> items = new ArrayList<>();
        Map<String, Map<String, Object>> byKey = new LinkedHashMap<>();
        for (Map<String, Object> g : groups) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("targetId", g.get("targetId"));
            item.put("changeType", g.get("changeType"));
            item.put("createdAt", g.get("createdAt"));
            item.put("fieldCount", g.get("fieldCount"));
            item.put("operator", null);
            item.put("changes", new ArrayList<Map<String, Object>>());
            items.add(item);
            byKey.put(operationKey(g.get("targetId"), g.get("changeType"), g.get("createdAt")), item);
        }

        if (!items.isEmpty()) {
            List<CageFormAuditLog> rows = auditLogMapper.listByOperationGroups(cat, null, ct, null, op, personId, kind, df, dt, offset, sz);
            enrichOperatorNames(rows);
            for (CageFormAuditLog r : rows) {
                Map<String, Object> item = byKey.get(operationKey(r.getTargetId(), r.getChangeType(), r.getCreatedAt()));
                if (item == null) continue;
                item.putIfAbsent("operator", displayNameOrId(r.getOperatorName(), r.getOperatorId()));
                addChange(item, r);
            }
        }
        attachCageLabels(items);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", total);
        out.put("page", p);
        out.put("pageSize", sz);
        return out;
    }

    /** 聚合键：笼位 + 类型 + 秒级时间。分组来自 SQL（字符串），明细来自实体（LocalDateTime），两边统一到同一格式。 */
    private static String operationKey(Object targetId, Object changeType, Object createdAt) {
        String at = createdAt instanceof LocalDateTime ldt ? ldt.format(SEC_FMT) : String.valueOf(createdAt);
        return targetId + "|" + changeType + "|" + at;
    }

    /** 给笼位维度的审计行补「校区/房间/笼架 A-10」，记录页不点进去也能定位到具体笼位。 */
    private void attachCageLabels(List<Map<String, Object>> items) {
        LinkedHashSet<Long> ids = new LinkedHashSet<>();
        for (Map<String, Object> m : items) {
            if (m.get("targetId") instanceof Number n) ids.add(n.longValue());
        }
        if (ids.isEmpty()) return;
        Map<Long, String> labels = new HashMap<>();
        try {
            for (Map<String, Object> loc : cellIndexMapper.lookupByAnimalCageIds(new ArrayList<>(ids))) {
                if (!(loc.get("animalCageId") instanceof Number n)) continue;
                labels.put(n.longValue(), locationLabel(loc));
            }
        } catch (Exception e) {
            return; // 位置只是锦上添花，查不到不影响留痕本身
        }
        for (Map<String, Object> m : items) {
            if (m.get("targetId") instanceof Number n) m.put("cageLabel", labels.get(n.longValue()));
        }
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
