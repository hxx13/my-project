package com.example.demo.modules.facilitymaintenance.service;

import com.example.demo.common.excel.ExcelExportColumnAutosizer;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 机房检查维护：站点、选项集、巡查模板、巡查记录、耗材、更换 + Excel 导入导出。
 */
@Service
public class FacilityMaintenanceService {

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public FacilityMaintenanceService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbc = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public static String newId(String prefix) {
        return prefix + UUID.randomUUID().toString().replace("-", "");
    }

    // ---------- Sites ----------

    public List<Map<String, Object>> listSites(boolean includeDisabled) {
        String sql = includeDisabled
                ? "SELECT id, name, code, sort_order sortOrder, disabled FROM fm_site ORDER BY sort_order, name"
                : "SELECT id, name, code, sort_order sortOrder, disabled FROM fm_site WHERE (disabled IS NULL OR disabled = 0) ORDER BY sort_order, name";
        return jdbc.query(sql, rowMapperSimple());
    }

    /** 仅启用机房；兼容历史库 disabled 为 NULL 的行（原先写 disabled=0 会筛空导致当日巡查表无行可填） */
    private static boolean siteRowEnabled(Map<String, Object> siteRow) {
        Object d = siteRow.get("disabled");
        if (d == null) return true;
        if (d instanceof Number n) return n.intValue() == 0;
        return "0".equals(Objects.toString(d, "0"));
    }

    private List<Map<String, Object>> listSitesByIdsInOrder(List<String> siteIds) {
        if (siteIds == null || siteIds.isEmpty()) return List.of();
        List<Map<String, Object>> all = listSites(true);
        Map<String, Map<String, Object>> byId = new LinkedHashMap<>();
        for (Map<String, Object> s : all) {
            byId.put(Objects.toString(s.get("id"), ""), s);
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (String id : siteIds) {
            if (id == null || id.isBlank()) continue;
            Map<String, Object> row = byId.get(id);
            if (row != null && siteRowEnabled(row)) {
                out.add(row);
            }
        }
        return out;
    }

    private List<String> loadTemplateSiteLinkIds(String templateId) {
        return jdbc.query(
                "SELECT site_id FROM fm_template_site WHERE template_id=? ORDER BY site_id",
                (rs, i) -> rs.getString(1),
                templateId);
    }

    private void replaceTemplateSiteLinks(String templateId, List<String> siteIds) {
        jdbc.update("DELETE FROM fm_template_site WHERE template_id=?", templateId);
        if (siteIds == null) return;
        for (String sid : siteIds) {
            if (sid == null || sid.isBlank()) continue;
            jdbc.update("INSERT INTO fm_template_site(template_id, site_id) VALUES(?,?)", templateId, sid.trim());
        }
    }

    /**
     * 当日巡查表 / 导出用的机房列：多选（fm_template_site）优先，否则 legacy site_id，否则全部启用机房。
     */
    private List<Map<String, Object>> listSitesForDailyTemplate(String templateId) {
        List<String> linkIds = loadTemplateSiteLinkIds(templateId);
        if (!linkIds.isEmpty()) {
            return listSitesByIdsInOrder(linkIds);
        }
        List<Map<String, Object>> tplRow = jdbc.query(
                "SELECT site_id siteId FROM fm_checklist_template WHERE id=?",
                rowMapperSimple(), templateId);
        if (tplRow.isEmpty()) return listSites(false);
        String sid = tplRow.get(0).get("siteId") == null ? null : Objects.toString(tplRow.get(0).get("siteId"), "").trim();
        if (sid != null && !sid.isEmpty()) {
            List<Map<String, Object>> one = jdbc.query(
                    "SELECT id, name, code, sort_order sortOrder, disabled FROM fm_site WHERE id=?",
                    rowMapperSimple(), sid);
            if (one.isEmpty()) return List.of();
            return siteRowEnabled(one.get(0)) ? one : List.of();
        }
        return listSites(false);
    }

    private void attachResolvedSiteIds(Map<String, Object> templateRow, String templateId) {
        List<String> links = loadTemplateSiteLinkIds(templateId);
        if (!links.isEmpty()) {
            templateRow.put("siteIds", links);
            return;
        }
        Object legacy = templateRow.get("siteId");
        if (legacy != null) {
            String s = Objects.toString(legacy, "").trim();
            if (!s.isEmpty()) {
                templateRow.put("siteIds", List.of(s));
                return;
            }
        }
        templateRow.put("siteIds", List.of());
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createSite(String name, String code, int sortOrder) {
        String id = newId("FM_S_");
        String c = blankToNull(code);
        if (c == null) {
            String suf = id.startsWith("FM_S_") ? id.substring("FM_S_".length()) : id.replace("-", "");
            c = ("S" + suf);
            if (c.length() > 64) c = c.substring(0, 64);
        }
        jdbc.update("INSERT INTO fm_site(id,name,code,sort_order,disabled) VALUES(?,?,?,?,0)",
                id, nullToEmpty(name), c, sortOrder);
        return Map.of("id", id);
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateSite(String id, String name, String code, Integer sortOrder, Integer disabled) {
        List<Object> args = new ArrayList<>();
        StringBuilder sb = new StringBuilder("UPDATE fm_site SET ");
        boolean first = true;
        if (name != null) {
            sb.append(first ? "" : ", ").append("name=?");
            args.add(name);
            first = false;
        }
        if (code != null) {
            sb.append(first ? "" : ", ").append("code=?");
            args.add(blankToNull(code));
            first = false;
        }
        if (sortOrder != null) {
            sb.append(first ? "" : ", ").append("sort_order=?");
            args.add(sortOrder);
            first = false;
        }
        if (disabled != null) {
            sb.append(first ? "" : ", ").append("disabled=?");
            args.add(disabled);
            first = false;
        }
        if (first) return;
        sb.append(" WHERE id=?");
        args.add(id);
        int n = jdbc.update(sb.toString(), args.toArray());
        if (n == 0) throw new IllegalArgumentException("站点不存在");
    }

    @Transactional(rollbackFor = Exception.class)
    public void disableSite(String id) {
        int n = jdbc.update("UPDATE fm_site SET disabled=1 WHERE id=?", id);
        if (n == 0) throw new IllegalArgumentException("站点不存在");
    }

    /** 从库中删除机房行（历史台账等仍可能引用该 site_id，请谨慎操作） */
    @Transactional(rollbackFor = Exception.class)
    public void deleteSitePermanently(String id) {
        int n = jdbc.update("DELETE FROM fm_site WHERE id=?", id);
        if (n == 0) throw new IllegalArgumentException("站点不存在");
    }

    // ---------- Option sets ----------

    public List<Map<String, Object>> listOptionSetsWithItems() {
        List<Map<String, Object>> sets = jdbc.query(
                "SELECT id, name FROM fm_option_set ORDER BY name",
                rowMapperSimple());
        for (Map<String, Object> s : sets) {
            String sid = (String) s.get("id");
            List<Map<String, Object>> items = jdbc.query(
                    "SELECT id, label, sort_order sortOrder FROM fm_option_item WHERE option_set_id=? ORDER BY sort_order, label",
                    rowMapperSimple(), sid);
            s.put("items", items);
        }
        return sets;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createOptionSet(String name, List<Map<String, Object>> items) {
        String id = newId("FM_O_");
        jdbc.update("INSERT INTO fm_option_set(id,name) VALUES(?,?)", id, nullToEmpty(name));
        insertOptionItems(id, items);
        return Map.of("id", id);
    }

    private void insertOptionItems(String optionSetId, List<Map<String, Object>> items) {
        if (items == null) return;
        int order = 0;
        for (Map<String, Object> it : items) {
            String lid = newId("FM_OI_");
            String label = Objects.toString(it.getOrDefault("label", ""), "").trim();
            if (label.isEmpty()) continue;
            Integer so = parseInt(it.get("sortOrder"), order);
            jdbc.update("INSERT INTO fm_option_item(id,option_set_id,label,sort_order) VALUES(?,?,?,?)",
                    lid, optionSetId, label, so);
            order++;
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateOptionSet(String id, String name, List<Map<String, Object>> items) {
        if (name != null) {
            jdbc.update("UPDATE fm_option_set SET name=? WHERE id=?", name, id);
        }
        if (items != null) {
            jdbc.update("DELETE FROM fm_option_item WHERE option_set_id=?", id);
            insertOptionItems(id, items);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void deleteOptionSet(String id) {
        Integer n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM fm_template_item WHERE option_set_id=?",
                Integer.class, id);
        if (n != null && n > 0) {
            throw new IllegalArgumentException("选项集仍被巡查模板引用，无法删除");
        }
        jdbc.update("DELETE FROM fm_option_item WHERE option_set_id=?", id);
        int d = jdbc.update("DELETE FROM fm_option_set WHERE id=?", id);
        if (d == 0) throw new IllegalArgumentException("选项集不存在");
    }

    // ---------- Templates ----------

    public List<Map<String, Object>> listTemplates(String siteIdFilter) {
        List<Map<String, Object>> rows;
        if (siteIdFilter == null || siteIdFilter.isBlank()) {
            rows = jdbc.query(
                    "SELECT id, site_id siteId, name, created_at createdAt FROM fm_checklist_template ORDER BY updated_at DESC",
                    rowMapperSimple());
        } else {
            rows = jdbc.query(
                    """
                            SELECT DISTINCT t.id, t.site_id siteId, t.name, t.created_at createdAt
                            FROM fm_checklist_template t
                            LEFT JOIN fm_template_site ts ON ts.template_id = t.id
                            WHERE t.site_id IS NULL OR t.site_id = ? OR ts.site_id = ?
                            ORDER BY t.updated_at DESC
                            """,
                    rowMapperSimple(), siteIdFilter, siteIdFilter);
        }
        for (Map<String, Object> r : rows) {
            String tid = (String) r.get("id");
            List<Map<String, Object>> its = loadTemplateItems(tid);
            r.put("items", its);
            attachSelectOptionsToTemplateItems(its);
            attachResolvedSiteIds(r, tid);
        }
        return rows;
    }

    public Map<String, Object> getTemplate(String id) {
        List<Map<String, Object>> rows = jdbc.query(
                "SELECT id, site_id siteId, name, created_at createdAt FROM fm_checklist_template WHERE id=?",
                rowMapperSimple(), id);
        if (rows.isEmpty()) throw new IllegalArgumentException("模板不存在");
        Map<String, Object> r = rows.get(0);
        List<Map<String, Object>> its = loadTemplateItems(id);
        r.put("items", its);
        attachSelectOptionsToTemplateItems(its);
        attachResolvedSiteIds(r, id);
        return r;
    }

    private List<Map<String, Object>> loadTemplateItems(String templateId) {
        return jdbc.query("""
                        SELECT id, template_id templateId, label, field_type fieldType, option_set_id optionSetId,
                               required_flag requiredFlag, sort_order sortOrder
                        FROM fm_template_item WHERE template_id=? ORDER BY sort_order, id
                        """,
                rowMapperSimple(), templateId);
    }

    /** 为 SELECT 巡查项挂上 fm_option_item，供 Web/小程序矩阵下拉 */
    private void attachSelectOptionsToTemplateItems(List<Map<String, Object>> items) {
        if (items == null || items.isEmpty()) return;
        for (Map<String, Object> it : items) {
            String ft = Objects.toString(it.get("fieldType"), "TEXT").trim().toUpperCase(Locale.ROOT);
            if (!"SELECT".equals(ft)) continue;
            Object oid = it.get("optionSetId");
            if (oid == null) continue;
            String setId = Objects.toString(oid, "").trim();
            if (setId.isEmpty()) continue;
            List<Map<String, Object>> opts = jdbc.query(
                    "SELECT id, label, sort_order sortOrder FROM fm_option_item WHERE option_set_id=? ORDER BY sort_order, label",
                    rowMapperSimple(), setId);
            it.put("optionItems", opts);
        }
    }

    /**
     * @param explicitSiteIds 非 null 表示使用多机房关联表（可为空列表表示全局）；null 表示沿用单字段 siteId（兼容旧客户端）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createTemplate(String siteId, String name, List<Map<String, Object>> items, List<String> explicitSiteIds) {
        String id = newId("FM_T_");
        String rowSiteId = explicitSiteIds != null ? null : blankToNull(siteId);
        jdbc.update("INSERT INTO fm_checklist_template(id,site_id,name) VALUES(?,?,?)",
                id, rowSiteId, nullToEmpty(name));
        insertTemplateItems(id, items);
        if (explicitSiteIds != null) {
            replaceTemplateSiteLinks(id, explicitSiteIds);
        }
        return Map.of("id", id);
    }

    private void insertTemplateItems(String templateId, List<Map<String, Object>> items) {
        if (items == null) return;
        int order = 0;
        for (Map<String, Object> it : items) {
            String iid = newId("FM_I_");
            String label = Objects.toString(it.getOrDefault("label", ""), "").trim();
            if (label.isEmpty()) continue;
            String fieldType = Objects.toString(it.getOrDefault("fieldType", "TEXT"), "TEXT").trim().toUpperCase(Locale.ROOT);
            String optionSetId = blankToNull(Objects.toString(it.get("optionSetId"), null));
            int req = 0;
            if (it.get("required") instanceof Boolean b) {
                req = b ? 1 : 0;
            } else {
                req = parseInt(it.get("required"), 0) > 0 ? 1 : 0;
            }
            int so = parseInt(it.get("sortOrder"), order);
            jdbc.update("""
                            INSERT INTO fm_template_item(id,template_id,label,field_type,option_set_id,required_flag,sort_order)
                            VALUES(?,?,?,?,?,?,?)
                            """,
                    iid, templateId, label, fieldType, optionSetId, req, so);
            order++;
        }
    }

    /**
     * @param replaceSiteLinks true 且 body 含 siteIds：重写多机房关联并清空 legacy site_id
     * @param legacySiteIdKeyPresent true 表示旧客户端仅改 site_id（无 siteIds）：清空关联表后写单机房/全局
     */
    @Transactional(rollbackFor = Exception.class)
    public void updateTemplate(String id, String siteId, String name, List<Map<String, Object>> items,
                               boolean replaceSiteLinks, List<String> newSiteIds, boolean legacySiteIdKeyPresent) {
        if (replaceSiteLinks) {
            replaceTemplateSiteLinks(id, newSiteIds == null ? List.of() : newSiteIds);
            if (name != null) {
                jdbc.update("UPDATE fm_checklist_template SET site_id=NULL, name=? WHERE id=?", name, id);
            } else {
                jdbc.update("UPDATE fm_checklist_template SET site_id=NULL WHERE id=?", id);
            }
        } else if (legacySiteIdKeyPresent) {
            jdbc.update("DELETE FROM fm_template_site WHERE template_id=?", id);
            jdbc.update("UPDATE fm_checklist_template SET site_id=?, name=COALESCE(?,name) WHERE id=?",
                    blankToNull(siteId), name, id);
        } else if (name != null) {
            jdbc.update("UPDATE fm_checklist_template SET name=? WHERE id=?", name, id);
        }
        if (items != null) {
            jdbc.update("DELETE FROM fm_template_item WHERE template_id=?", id);
            insertTemplateItems(id, items);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void deleteTemplate(String id) {
        jdbc.update("DELETE FROM fm_template_site WHERE template_id=?", id);
        jdbc.update("DELETE FROM fm_template_item WHERE template_id=?", id);
        int n = jdbc.update("DELETE FROM fm_checklist_template WHERE id=?", id);
        if (n == 0) throw new IllegalArgumentException("模板不存在");
    }

    // ---------- Inspection records ----------

    public Map<String, Object> listInspectionRecords(String siteId, int page, int size) {
        int p = Math.max(1, page);
        int s = Math.min(Math.max(size, 1), 200);
        int offset = (p - 1) * s;
        StringBuilder where = new StringBuilder("1=1");
        List<Object> args = new ArrayList<>();
        if (siteId != null && !siteId.isBlank()) {
            where.append(" AND i.site_id=?");
            args.add(siteId);
        }
        Integer total = jdbc.queryForObject(
                "SELECT COUNT(*) FROM fm_inspection_record i WHERE " + where,
                Integer.class, args.toArray());
        args.add(s);
        args.add(offset);
        List<Map<String, Object>> rows = jdbc.query(
                """
                        SELECT i.id, i.site_id siteId, s.name siteName, i.template_id templateId, i.inspected_at inspectedAt,
                               i.operator_user_id operatorUserId, i.operator_name operatorName, i.values_json valuesJson,
                               i.created_at createdAt
                        FROM fm_inspection_record i
                        LEFT JOIN fm_site s ON s.id = i.site_id
                        """ + "WHERE " + where + """
                         ORDER BY i.inspected_at DESC
                         LIMIT ? OFFSET ?
                        """,
                rowMapperSimple(), args.toArray());
        for (Map<String, Object> row : rows) {
            row.put("values", parseJsonMap(row.remove("valuesJson")));
        }
        return Map.of(
                "total", total == null ? 0 : total,
                "page", p,
                "size", s,
                "rows", rows
        );
    }

    public Map<String, Object> getInspectionRecord(String id) {
        List<Map<String, Object>> rows = jdbc.query(
                """
                        SELECT i.id, i.site_id siteId, s.name siteName, i.template_id templateId, i.inspected_at inspectedAt,
                               i.operator_user_id operatorUserId, i.operator_name operatorName, i.values_json valuesJson,
                               i.created_at createdAt
                        FROM fm_inspection_record i
                        LEFT JOIN fm_site s ON s.id = i.site_id
                        WHERE i.id=?
                        """,
                rowMapperSimple(), id);
        if (rows.isEmpty()) throw new IllegalArgumentException("记录不存在");
        Map<String, Object> row = rows.get(0);
        row.put("values", parseJsonMap(row.remove("valuesJson")));
        return row;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createInspectionRecord(String siteId, String templateId, LocalDateTime inspectedAt,
                                                      Map<String, String> values, String operatorUserId, String operatorName) {
        String id = newId("FM_IN_");
        String json = writeJson(values == null ? Map.of() : values);
        jdbc.update("""
                        INSERT INTO fm_inspection_record(id,site_id,template_id,inspected_at,operator_user_id,operator_name,values_json)
                        VALUES(?,?,?,?,?,?,?)
                        """,
                id, siteId, blankToNull(templateId), inspectedAt == null ? LocalDateTime.now() : inspectedAt,
                blankToNull(operatorUserId), blankToNull(operatorName), json);
        return Map.of("id", id);
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateInspectionRecord(String id, String siteId, String templateId, LocalDateTime inspectedAt,
                                       Map<String, String> values, String operatorName) {
        String jsonArg = values != null ? writeJson(values) : null;
        int n = jdbc.update("""
                        UPDATE fm_inspection_record SET
                          site_id=COALESCE(?,site_id),
                          template_id=COALESCE(?,template_id),
                          inspected_at=COALESCE(?,inspected_at),
                          operator_name=COALESCE(?,operator_name),
                          values_json=COALESCE(?,values_json)
                        WHERE id=?
                        """,
                siteId, blankToNull(templateId), inspectedAt, blankToNull(operatorName), jsonArg, id);
        if (n == 0) throw new IllegalArgumentException("记录不存在");
    }

    @Transactional(rollbackFor = Exception.class)
    public void deleteInspectionRecord(String id) {
        int n = jdbc.update("DELETE FROM fm_inspection_record WHERE id=?", id);
        if (n == 0) throw new IllegalArgumentException("记录不存在");
    }

    // ---------- Consumables ----------

    public Map<String, Object> listConsumableLines(String siteId, int page, int size) {
        int p = Math.max(1, page);
        int s = Math.min(Math.max(size, 1), 200);
        int offset = (p - 1) * s;
        StringBuilder where = new StringBuilder("1=1");
        List<Object> args = new ArrayList<>();
        if (siteId != null && !siteId.isBlank()) {
            where.append(" AND c.site_id=?");
            args.add(siteId);
        }
        Integer total = jdbc.queryForObject("SELECT COUNT(*) FROM fm_consumable_line c WHERE " + where, Integer.class, args.toArray());
        args.add(s);
        args.add(offset);
        List<Map<String, Object>> rows = jdbc.query(
                """
                        SELECT c.id, c.site_id siteId, s.name siteName, c.consumable_name consumableName, c.qty, c.unit,
                               c.occurred_at occurredAt, c.note, c.created_by createdBy, c.created_at createdAt,
                               COALESCE(NULLIF(TRIM(u.display_nickname), ''), u.username, c.created_by) createdByName
                        FROM fm_consumable_line c
                        LEFT JOIN fm_site s ON s.id = c.site_id
                        LEFT JOIN sys_user u ON u.id = c.created_by
                        """ + "WHERE " + where + " ORDER BY c.occurred_at DESC LIMIT ? OFFSET ?",
                rowMapperSimple(), args.toArray());
        return Map.of("total", total == null ? 0 : total, "page", p, "size", s, "rows", rows);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createConsumableLine(String siteId, String consumableName, BigDecimal qty, String unit,
                                                    LocalDateTime occurredAt, String note, String createdBy) {
        String id = newId("FM_C_");
        jdbc.update("""
                        INSERT INTO fm_consumable_line(id,site_id,consumable_name,qty,unit,occurred_at,note,created_by)
                        VALUES(?,?,?,?,?,?,?,?)
                        """,
                id, siteId, nullToEmpty(consumableName), qty == null ? BigDecimal.ZERO : qty, blankToNull(unit),
                occurredAt == null ? LocalDateTime.now() : occurredAt, blankToNull(note), blankToNull(createdBy));
        return Map.of("id", id);
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateConsumableLine(String id, String siteId, String consumableName, BigDecimal qty, String unit,
                                     LocalDateTime occurredAt, String note) {
        int n = jdbc.update("""
                        UPDATE fm_consumable_line SET site_id=COALESCE(?,site_id), consumable_name=COALESCE(?,consumable_name),
                        qty=COALESCE(?,qty), unit=COALESCE(?,unit), occurred_at=COALESCE(?,occurred_at), note=COALESCE(?,note)
                        WHERE id=?
                        """,
                siteId, consumableName, qty, blankToNull(unit), occurredAt, blankToNull(note), id);
        if (n == 0) throw new IllegalArgumentException("记录不存在");
    }

    @Transactional(rollbackFor = Exception.class)
    public void deleteConsumableLine(String id) {
        int n = jdbc.update("DELETE FROM fm_consumable_line WHERE id=?", id);
        if (n == 0) throw new IllegalArgumentException("记录不存在");
    }

    // ---------- Replacements ----------

    public Map<String, Object> listReplacementRecords(String siteId, int page, int size) {
        int p = Math.max(1, page);
        int s = Math.min(Math.max(size, 1), 200);
        int offset = (p - 1) * s;
        StringBuilder where = new StringBuilder("1=1");
        List<Object> args = new ArrayList<>();
        if (siteId != null && !siteId.isBlank()) {
            where.append(" AND r.site_id=?");
            args.add(siteId);
        }
        Integer total = jdbc.queryForObject("SELECT COUNT(*) FROM fm_replacement_record r WHERE " + where, Integer.class, args.toArray());
        args.add(s);
        args.add(offset);
        List<Map<String, Object>> rows = jdbc.query(
                """
                        SELECT r.id, r.site_id siteId, s.name siteName, r.filter_type filterType, r.replaced_at replacedAt,
                               r.note, r.created_by createdBy, r.created_at createdAt,
                               COALESCE(NULLIF(TRIM(u.display_nickname), ''), u.username, r.created_by) createdByName
                        FROM fm_replacement_record r
                        LEFT JOIN fm_site s ON s.id = r.site_id
                        LEFT JOIN sys_user u ON u.id = r.created_by
                        """ + "WHERE " + where + " ORDER BY r.replaced_at DESC LIMIT ? OFFSET ?",
                rowMapperSimple(), args.toArray());
        for (Map<String, Object> row : rows) {
            String sid = (String) row.get("siteId");
            String ft = (String) row.get("filterType");
            LocalDateTime cur = toLocalDateTime(row.get("replacedAt"));
            LocalDateTime prev = findPreviousReplacementAt(sid, ft, cur);
            row.put("previousReplacedAt", prev);
            if (prev != null && cur != null) {
                row.put("daysSincePrevious", java.time.Duration.between(prev, cur).toDays());
            } else {
                row.put("daysSincePrevious", null);
            }
        }
        return Map.of("total", total == null ? 0 : total, "page", p, "size", s, "rows", rows);
    }

    private LocalDateTime findPreviousReplacementAt(String siteId, String filterType, LocalDateTime current) {
        if (siteId == null || filterType == null || current == null) return null;
        return jdbc.query(
                "SELECT MAX(replaced_at) FROM fm_replacement_record WHERE site_id=? AND filter_type=? AND replaced_at < ?",
                (ResultSetExtractor<LocalDateTime>) rs -> {
                    if (!rs.next()) return null;
                    java.sql.Timestamp t = rs.getTimestamp(1);
                    return t == null ? null : t.toLocalDateTime();
                },
                siteId, filterType, java.sql.Timestamp.valueOf(current));
    }

    public List<Map<String, Object>> replacementSummaryBySite(String siteId) {
        if (siteId == null || siteId.isBlank()) return List.of();
        return jdbc.query(
                """
                        SELECT filter_type filterType, MAX(replaced_at) lastReplacedAt
                        FROM fm_replacement_record WHERE site_id=?
                        GROUP BY filter_type
                        """,
                rowMapperSimple(), siteId);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createReplacementRecord(String siteId, String filterType, LocalDateTime replacedAt,
                                                       String note, String createdBy) {
        String id = newId("FM_R_");
        jdbc.update("""
                        INSERT INTO fm_replacement_record(id,site_id,filter_type,replaced_at,note,created_by)
                        VALUES(?,?,?,?,?,?)
                        """,
                id, siteId, nullToEmpty(filterType), replacedAt == null ? LocalDateTime.now() : replacedAt,
                blankToNull(note), blankToNull(createdBy));
        return Map.of("id", id);
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateReplacementRecord(String id, String siteId, String filterType, LocalDateTime replacedAt, String note) {
        int n = jdbc.update("""
                        UPDATE fm_replacement_record SET
                          site_id=COALESCE(?,site_id),
                          filter_type=COALESCE(?,filter_type),
                          replaced_at=COALESCE(?,replaced_at),
                          note=COALESCE(?,note)
                        WHERE id=?
                        """,
                siteId, filterType, replacedAt, blankToNull(note), id);
        if (n == 0) throw new IllegalArgumentException("记录不存在");
    }

    @Transactional(rollbackFor = Exception.class)
    public void deleteReplacementRecord(String id) {
        int n = jdbc.update("DELETE FROM fm_replacement_record WHERE id=?", id);
        if (n == 0) throw new IllegalArgumentException("记录不存在");
    }

    // ---------- Excel ----------

    /** 导出单元格：Jdbc rowMapperSimple 对 DATETIME 使用 LocalDateTime，兼容 Timestamp */
    private static String formatDateTimeForExcel(Object v) {
        if (v == null) return null;
        if (v instanceof LocalDateTime ldt) return TS.format(ldt);
        if (v instanceof java.sql.Timestamp ts) return TS.format(ts.toLocalDateTime());
        return null;
    }

    /**
     * @param scope all | sites | inspection | consumables | replacements；台账三页分别导出单 Sheet
     */
    public byte[] exportExcel(String scope) {
        String s = scope == null || scope.isBlank() ? "all" : scope.trim().toLowerCase(Locale.ROOT);
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            switch (s) {
                case "all":
                    writeSitesSheet(wb);
                    writeInspectionSheet(wb);
                    writeConsumableSheet(wb);
                    writeReplacementSheet(wb);
                    break;
                case "sites":
                    writeSitesSheet(wb);
                    break;
                case "inspection":
                    writeInspectionSheet(wb);
                    break;
                case "consumables":
                    writeConsumableSheet(wb);
                    break;
                case "replacements":
                    writeReplacementSheet(wb);
                    break;
                default:
                    throw new IllegalArgumentException("导出范围无效，使用 all / sites / inspection / consumables / replacements");
            }
            wb.write(out);
            return out.toByteArray();
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("导出失败: " + e.getMessage());
        }
    }

    private void writeSitesSheet(Workbook wb) {
        Sheet sh = wb.createSheet("Sites");
        Row h = sh.createRow(0);
        h.createCell(0).setCellValue("机房ID");
        h.createCell(1).setCellValue("名称");
        h.createCell(2).setCellValue("编码");
        h.createCell(3).setCellValue("排序");
        h.createCell(4).setCellValue("停用");
        List<Map<String, Object>> rows = jdbc.query(
                "SELECT id,name,code,sort_order sortOrder,disabled FROM fm_site ORDER BY sort_order,name",
                rowMapperSimple());
        int r = 1;
        for (Map<String, Object> row : rows) {
            Row row1 = sh.createRow(r++);
            row1.createCell(0).setCellValue(Objects.toString(row.get("id"), ""));
            row1.createCell(1).setCellValue(Objects.toString(row.get("name"), ""));
            row1.createCell(2).setCellValue(Objects.toString(row.get("code"), ""));
            row1.createCell(3).setCellValue(((Number) row.getOrDefault("sortOrder", 0)).intValue());
            row1.createCell(4).setCellValue(((Number) row.getOrDefault("disabled", 0)).intValue());
        }
        ExcelExportColumnAutosizer.autoSizeByContentWithHeaderFloorRow0(sh, 0, 4);
    }

    private void writeInspectionSheet(Workbook wb) {
        Sheet sh = wb.createSheet("InspectionRecords");
        Row h = sh.createRow(0);
        h.createCell(0).setCellValue("记录ID");
        h.createCell(1).setCellValue("机房ID");
        h.createCell(2).setCellValue("模板ID");
        h.createCell(3).setCellValue("巡检时间");
        h.createCell(4).setCellValue("操作人用户ID");
        h.createCell(5).setCellValue("操作人姓名");
        h.createCell(6).setCellValue("巡查值JSON");
        List<Map<String, Object>> rows = jdbc.query(
                "SELECT id,site_id,template_id,inspected_at,operator_user_id,operator_name,values_json FROM fm_inspection_record ORDER BY inspected_at DESC",
                rowMapperSimple());
        int r = 1;
        for (Map<String, Object> row : rows) {
            Row row1 = sh.createRow(r++);
            row1.createCell(0).setCellValue(Objects.toString(row.get("id"), ""));
            row1.createCell(1).setCellValue(Objects.toString(row.get("siteId"), ""));
            row1.createCell(2).setCellValue(Objects.toString(row.get("templateId"), ""));
            String inspectedAtStr = formatDateTimeForExcel(row.get("inspectedAt"));
            if (inspectedAtStr != null) {
                row1.createCell(3).setCellValue(inspectedAtStr);
            }
            row1.createCell(4).setCellValue(Objects.toString(row.get("operatorUserId"), ""));
            row1.createCell(5).setCellValue(Objects.toString(row.get("operatorName"), ""));
            row1.createCell(6).setCellValue(Objects.toString(row.get("valuesJson"), ""));
        }
        ExcelExportColumnAutosizer.autoSizeByContentWithHeaderFloorRow0(sh, 0, 6);
    }

    private void writeConsumableSheet(Workbook wb) {
        Sheet sh = wb.createSheet("Consumables");
        Row h = sh.createRow(0);
        String[] cols = {"机房名称", "耗材名称", "数量", "单位", "发生时间", "备注", "创建人"};
        for (int i = 0; i < cols.length; i++) h.createCell(i).setCellValue(cols[i]);
        List<Map<String, Object>> rows = jdbc.query(
                """
                        SELECT s.name siteName, c.consumable_name consumableName, c.qty, c.unit, c.occurred_at occurredAt, c.note,
                               COALESCE(NULLIF(TRIM(u.display_nickname), ''), u.username, c.created_by) createdByName
                        FROM fm_consumable_line c
                        LEFT JOIN fm_site s ON s.id = c.site_id
                        LEFT JOIN sys_user u ON u.id = c.created_by
                        ORDER BY c.occurred_at DESC
                        """,
                rowMapperSimple());
        int r = 1;
        for (Map<String, Object> row : rows) {
            Row row1 = sh.createRow(r++);
            row1.createCell(0).setCellValue(Objects.toString(row.get("siteName"), ""));
            row1.createCell(1).setCellValue(Objects.toString(row.get("consumableName"), ""));
            row1.createCell(2).setCellValue(row.get("qty") != null ? ((BigDecimal) row.get("qty")).doubleValue() : 0);
            row1.createCell(3).setCellValue(Objects.toString(row.get("unit"), ""));
            String occurredAtStr = formatDateTimeForExcel(row.get("occurredAt"));
            if (occurredAtStr != null) {
                row1.createCell(4).setCellValue(occurredAtStr);
            }
            row1.createCell(5).setCellValue(Objects.toString(row.get("note"), ""));
            row1.createCell(6).setCellValue(Objects.toString(row.get("createdByName"), ""));
        }
        ExcelExportColumnAutosizer.autoSizeByContentWithHeaderFloorRow0(sh, 0, cols.length - 1);
    }

    private void writeReplacementSheet(Workbook wb) {
        Sheet sh = wb.createSheet("Replacements");
        Row h = sh.createRow(0);
        String[] cols = {"记录ID", "机房名称", "过滤器类型", "更换时间", "备注", "创建人"};
        for (int i = 0; i < cols.length; i++) h.createCell(i).setCellValue(cols[i]);
        List<Map<String, Object>> rows = jdbc.query(
                """
                        SELECT r.id, s.name siteName, r.filter_type filterType, r.replaced_at replacedAt, r.note,
                               COALESCE(NULLIF(TRIM(u.display_nickname), ''), u.username, r.created_by) createdByName
                        FROM fm_replacement_record r
                        LEFT JOIN fm_site s ON s.id = r.site_id
                        LEFT JOIN sys_user u ON u.id = r.created_by
                        ORDER BY r.replaced_at DESC
                        """,
                rowMapperSimple());
        int r = 1;
        for (Map<String, Object> row : rows) {
            Row row1 = sh.createRow(r++);
            row1.createCell(0).setCellValue(Objects.toString(row.get("id"), ""));
            row1.createCell(1).setCellValue(Objects.toString(row.get("siteName"), ""));
            row1.createCell(2).setCellValue(Objects.toString(row.get("filterType"), ""));
            String replacedAtStr = formatDateTimeForExcel(row.get("replacedAt"));
            if (replacedAtStr != null) {
                row1.createCell(3).setCellValue(replacedAtStr);
            }
            row1.createCell(4).setCellValue(Objects.toString(row.get("note"), ""));
            row1.createCell(5).setCellValue(Objects.toString(row.get("createdByName"), ""));
        }
        ExcelExportColumnAutosizer.autoSizeByContentWithHeaderFloorRow0(sh, 0, cols.length - 1);
    }

    private String resolveSiteIdFromImportCell(String cell) {
        if (cell == null || cell.isBlank()) return "";
        String t = cell.trim();
        List<String> byId = jdbc.query("SELECT id FROM fm_site WHERE id=? LIMIT 1", (rs, i) -> rs.getString(1), t);
        if (!byId.isEmpty()) return byId.get(0);
        List<String> byName = jdbc.query("SELECT id FROM fm_site WHERE name=? LIMIT 1", (rs, i) -> rs.getString(1), t);
        return byName.isEmpty() ? "" : byName.get(0);
    }

    /** 导入「创建人」列：支持 sys_user.id / username / 展示昵称，无匹配则原样写入 */
    private String resolveUserIdFromImportCell(String cell) {
        if (cell == null || cell.isBlank()) return null;
        String t = cell.trim();
        List<String> ids = jdbc.query(
                "SELECT id FROM sys_user WHERE id=? OR username=? OR COALESCE(display_nickname,'')=? LIMIT 1",
                (rs, i) -> rs.getString(1), t, t, t);
        return ids.isEmpty() ? blankToNull(t) : ids.get(0);
    }

    /**
     * @param scope all | sites | inspection | consumables | replacements；按范围只导入对应 Sheet
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> importExcel(MultipartFile file, String scope) throws Exception {
        String s = scope == null || scope.isBlank() ? "all" : scope.trim().toLowerCase(Locale.ROOT);
        int sites = 0, insp = 0, cons = 0, rep = 0;
        try (InputStream in = file.getInputStream(); Workbook wb = WorkbookFactory.create(in)) {
            switch (s) {
                case "all": {
                    Sheet sh = wb.getSheet("Sites");
                    if (sh != null) sites = importSitesSheet(sh);
                    sh = wb.getSheet("InspectionRecords");
                    if (sh != null) insp = importInspectionSheet(sh);
                    sh = wb.getSheet("Consumables");
                    if (sh != null) cons = importConsumableSheet(sh);
                    sh = wb.getSheet("Replacements");
                    if (sh != null) rep = importReplacementSheet(sh);
                    break;
                }
                case "sites": {
                    Sheet sh = wb.getSheet("Sites");
                    if (sh != null) sites = importSitesSheet(sh);
                    break;
                }
                case "inspection": {
                    Sheet sh = wb.getSheet("InspectionRecords");
                    if (sh != null) insp = importInspectionSheet(sh);
                    break;
                }
                case "consumables": {
                    Sheet sh = wb.getSheet("Consumables");
                    if (sh != null) cons = importConsumableSheet(sh);
                    break;
                }
                case "replacements": {
                    Sheet sh = wb.getSheet("Replacements");
                    if (sh != null) rep = importReplacementSheet(sh);
                    break;
                }
                default:
                    throw new IllegalArgumentException("导入范围无效，使用 all / sites / inspection / consumables / replacements");
            }
        }
        return Map.of("sites", sites, "inspectionRecords", insp, "consumables", cons, "replacements", rep);
    }

    private int importSitesSheet(Sheet sh) {
        int cnt = 0;
        for (int r = 1; r <= sh.getLastRowNum(); r++) {
            Row row = sh.getRow(r);
            if (row == null) continue;
            String id = cellStr(row, 0);
            String name = cellStr(row, 1);
            if (name.isEmpty()) continue;
            String code = cellStr(row, 2);
            int sort = (int) cellNum(row, 3);
            int dis = (int) cellNum(row, 4);
            if (id.isEmpty()) id = newId("FM_S_");
            jdbc.update("""
                            INSERT INTO fm_site(id,name,code,sort_order,disabled) VALUES(?,?,?,?,?)
                            ON DUPLICATE KEY UPDATE name=VALUES(name),code=VALUES(code),sort_order=VALUES(sort_order),disabled=VALUES(disabled)
                            """,
                    id, name, blankToNull(code), sort, dis);
            cnt++;
        }
        return cnt;
    }

    private int importInspectionSheet(Sheet sh) {
        int cnt = 0;
        for (int r = 1; r <= sh.getLastRowNum(); r++) {
            Row row = sh.getRow(r);
            if (row == null) continue;
            String id = cellStr(row, 0);
            String siteId = cellStr(row, 1);
            if (siteId.isEmpty()) continue;
            String tplId = cellStr(row, 2);
            LocalDateTime at = parseDateTime(cellStr(row, 3));
            String opId = cellStr(row, 4);
            String opName = cellStr(row, 5);
            String json = cellStr(row, 6);
            if (json.isEmpty()) json = "{}";
            if (id.isEmpty()) id = newId("FM_IN_");
            jdbc.update("""
                            INSERT INTO fm_inspection_record(id,site_id,template_id,inspected_at,operator_user_id,operator_name,values_json)
                            VALUES(?,?,?,?,?,?,?)
                            ON DUPLICATE KEY UPDATE site_id=VALUES(site_id),template_id=VALUES(template_id),inspected_at=VALUES(inspected_at),
                            operator_user_id=VALUES(operator_user_id),operator_name=VALUES(operator_name),values_json=VALUES(values_json)
                            """,
                    id, siteId, blankToNull(tplId), at == null ? LocalDateTime.now() : at, blankToNull(opId), blankToNull(opName), json);
            cnt++;
        }
        return cnt;
    }

    private int importConsumableSheet(Sheet sh) {
        int cnt = 0;
        boolean legacyWithRecordId = consumableImportUsesLegacyRecordIdColumn(sh);
        for (int r = 1; r <= sh.getLastRowNum(); r++) {
            Row row = sh.getRow(r);
            if (row == null) continue;
            String id;
            String siteId;
            String cname;
            BigDecimal qty;
            String unit;
            LocalDateTime at;
            String note;
            String createdBy;
            if (legacyWithRecordId) {
                id = cellStr(row, 0);
                siteId = resolveSiteIdFromImportCell(cellStr(row, 1));
                cname = cellStr(row, 2);
                qty = BigDecimal.valueOf(cellNum(row, 3));
                unit = cellStr(row, 4);
                at = parseDateTime(cellStr(row, 5));
                note = cellStr(row, 6);
                createdBy = resolveUserIdFromImportCell(cellStr(row, 7));
            } else {
                id = "";
                siteId = resolveSiteIdFromImportCell(cellStr(row, 0));
                cname = cellStr(row, 1);
                qty = BigDecimal.valueOf(cellNum(row, 2));
                unit = cellStr(row, 3);
                at = parseDateTime(cellStr(row, 4));
                note = cellStr(row, 5);
                createdBy = resolveUserIdFromImportCell(cellStr(row, 6));
            }
            if (siteId.isEmpty() || cname.isEmpty()) continue;
            if (id.isEmpty()) id = newId("FM_C_");
            jdbc.update("""
                            INSERT INTO fm_consumable_line(id,site_id,consumable_name,qty,unit,occurred_at,note,created_by)
                            VALUES(?,?,?,?,?,?,?,?)
                            ON DUPLICATE KEY UPDATE site_id=VALUES(site_id),consumable_name=VALUES(consumable_name),qty=VALUES(qty),
                            unit=VALUES(unit),occurred_at=VALUES(occurred_at),note=VALUES(note)
                            """,
                    id, siteId, cname, qty, blankToNull(unit), at == null ? LocalDateTime.now() : at, blankToNull(note), createdBy);
            cnt++;
        }
        return cnt;
    }

    /** 旧版导出首列为「记录ID」；新版导出首列为「机房名称」 */
    private static boolean consumableImportUsesLegacyRecordIdColumn(Sheet sh) {
        Row h = sh.getRow(0);
        if (h == null) {
            return false;
        }
        String c0 = cellStr(h, 0);
        return c0.startsWith("记录");
    }

    private int importReplacementSheet(Sheet sh) {
        int cnt = 0;
        for (int r = 1; r <= sh.getLastRowNum(); r++) {
            Row row = sh.getRow(r);
            if (row == null) continue;
            String id = cellStr(row, 0);
            String siteId = resolveSiteIdFromImportCell(cellStr(row, 1));
            String ft = cellStr(row, 2);
            if (siteId.isEmpty() || ft.isEmpty()) continue;
            LocalDateTime at = parseDateTime(cellStr(row, 3));
            String note = cellStr(row, 4);
            String createdBy = resolveUserIdFromImportCell(cellStr(row, 5));
            if (id.isEmpty()) id = newId("FM_R_");
            jdbc.update("""
                            INSERT INTO fm_replacement_record(id,site_id,filter_type,replaced_at,note,created_by)
                            VALUES(?,?,?,?,?,?)
                            ON DUPLICATE KEY UPDATE site_id=VALUES(site_id),filter_type=VALUES(filter_type),replaced_at=VALUES(replaced_at),note=VALUES(note)
                            """,
                    id, siteId, ft, at == null ? LocalDateTime.now() : at, blankToNull(note), createdBy);
            cnt++;
        }
        return cnt;
    }

    private static final DataFormatter CELL_FMT = new DataFormatter();

    private static String cellStr(Row row, int i) {
        Cell c = row.getCell(i);
        if (c == null) return "";
        return CELL_FMT.formatCellValue(c).trim();
    }

    private static double cellNum(Row row, int i) {
        Cell c = row.getCell(i);
        if (c == null) return 0;
        if (c.getCellType() == CellType.NUMERIC) return c.getNumericCellValue();
        try {
            return Double.parseDouble(c.getStringCellValue().trim());
        } catch (Exception e) {
            return 0;
        }
    }

    private LocalDateTime parseDateTime(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return LocalDateTime.parse(s.replace(" ", "T").substring(0, Math.min(s.length(), 19)));
        } catch (Exception e) {
            try {
                return LocalDateTime.parse(s, TS);
            } catch (Exception e2) {
                return null;
            }
        }
    }

    // ---------- Daily inspection sheet（按日协作：机房为行，模板项为列）----------

    private boolean dailySheetCellsAllEmpty(String gridJson) {
        String gj = Objects.toString(gridJson, "{\"cells\":{}}");
        try {
            Map<String, Object> root = objectMapper.readValue(gj, new TypeReference<Map<String, Object>>() {
            });
            Object c = root.get("cells");
            if (!(c instanceof Map<?, ?> m)) {
                return true;
            }
            for (Object v : m.values()) {
                if (v != null && !Objects.toString(v, "").trim().isEmpty()) {
                    return false;
                }
            }
            return true;
        } catch (Exception e) {
            return true;
        }
    }

    public Map<String, Object> getOrCreateDailyInspectionSheet(LocalDate sheetDate, String templateIdParam) {
        if (sheetDate == null) throw new IllegalArgumentException("缺少日期");
        List<Map<String, Object>> rows = jdbc.query(
                """
                        SELECT id, sheet_date sheetDate, template_id templateId, status, grid_json gridJson, version,
                               submitted_at submittedAt, submitted_by_user_id submittedByUserId, submitted_by_name submittedByName
                        FROM fm_daily_inspection_sheet WHERE sheet_date=?
                        """,
                rowMapperSimple(), java.sql.Date.valueOf(sheetDate));
        if (!rows.isEmpty()) {
            Map<String, Object> existing = rows.get(0);
            String reqTid = blankToNull(templateIdParam);
            if (reqTid != null) {
                String storedTid = blankToNull(Objects.toString(existing.get("templateId"), "").trim());
                String st = Objects.toString(existing.get("status"), "DRAFT");
                boolean submitted = "SUBMITTED".equalsIgnoreCase(st);
                boolean cellsEmpty = dailySheetCellsAllEmpty(Objects.toString(existing.get("gridJson"), "{}"));
                if (storedTid != null && !reqTid.equals(storedTid)) {
                    if (cellsEmpty && !submitted) {
                        String sheetId = Objects.toString(existing.get("id"), "").trim();
                        if (!sheetId.isEmpty()) {
                            jdbc.update(
                                    """
                                            UPDATE fm_daily_inspection_sheet SET template_id=?, grid_json=?, version=version+1,
                                                   updated_at=CURRENT_TIMESTAMP WHERE id=?
                                            """,
                                    reqTid, "{\"cells\":{}}", sheetId);
                            List<Map<String, Object>> one = jdbc.query(
                                    """
                                            SELECT id, sheet_date sheetDate, template_id templateId, status, grid_json gridJson, version,
                                                   submitted_at submittedAt, submitted_by_user_id submittedByUserId, submitted_by_name submittedByName
                                            FROM fm_daily_inspection_sheet WHERE id=?
                                            """,
                                    rowMapperSimple(), sheetId);
                            if (!one.isEmpty()) {
                                return enrichDailyInspectionSheetDto(one.get(0));
                            }
                        }
                    } else {
                        if (submitted) {
                            throw new IllegalArgumentException(
                                    "该日协作巡查表已登记。若要换模板请先点「删除当日巡查表」删除该日表后重开。");
                        }
                        throw new IllegalArgumentException(
                                "该日期已使用其他巡查模板且格子中有内容。请先导出备份，再点「删除当日巡查表」后重新选模板打开；或继续使用当前模板。");
                    }
                }
            }
            return enrichDailyInspectionSheetDto(existing);
        }
        String tid = blankToNull(templateIdParam);
        if (tid == null) throw new IllegalArgumentException("当日尚无巡查表，请先选择巡查模板并打开");
        getTemplate(tid);
        String id = newId("FM_DS_");
        String initial = "{\"cells\":{}}";
        jdbc.update("""
                        INSERT INTO fm_daily_inspection_sheet(id, sheet_date, template_id, status, grid_json, version)
                        VALUES(?,?,?,?,?,0)
                        """,
                id, java.sql.Date.valueOf(sheetDate), tid, "DRAFT", initial);
        List<Map<String, Object>> one = jdbc.query(
                """
                        SELECT id, sheet_date sheetDate, template_id templateId, status, grid_json gridJson, version,
                               submitted_at submittedAt, submitted_by_user_id submittedByUserId, submitted_by_name submittedByName
                        FROM fm_daily_inspection_sheet WHERE id=?
                        """,
                rowMapperSimple(), id);
        return enrichDailyInspectionSheetDto(one.get(0));
    }

    /**
     * 历史巡查目录：按业务日倒序列出已有协作表（仅元数据，不含 grid 单元格）。
     */
    public Map<String, Object> listDailyInspectionSheetSummaries(int page, int size) {
        int p = Math.max(1, page);
        int s = Math.min(Math.max(size, 1), 200);
        int offset = (p - 1) * s;
        Integer totalObj = jdbc.queryForObject("SELECT COUNT(*) FROM fm_daily_inspection_sheet", Integer.class);
        int total = totalObj == null ? 0 : totalObj;
        List<Map<String, Object>> rows = jdbc.query(
                """
                        SELECT ds.id AS id,
                               ds.sheet_date AS sheetDate,
                               ds.template_id AS templateId,
                               ds.status AS status,
                               ds.version AS version,
                               ds.submitted_at AS submittedAt,
                               ds.submitted_by_name AS submittedByName,
                               t.name AS templateName
                        FROM fm_daily_inspection_sheet ds
                        LEFT JOIN fm_checklist_template t ON t.id = ds.template_id
                        ORDER BY ds.sheet_date DESC
                        LIMIT ? OFFSET ?
                        """,
                rowMapperSimple(), s, offset);
        List<Map<String, Object>> outRows = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> one = new LinkedHashMap<>();
            one.put("id", row.get("id"));
            Object sd = row.get("sheetDate");
            if (sd instanceof java.sql.Date d) {
                one.put("sheetDate", d.toLocalDate().toString());
            } else {
                one.put("sheetDate", sd == null ? "" : sd.toString());
            }
            one.put("templateId", row.get("templateId"));
            one.put("templateName", Objects.toString(row.get("templateName"), ""));
            one.put("status", row.get("status"));
            one.put("version", ((Number) row.getOrDefault("version", 0)).intValue());
            one.put("submittedAt", row.get("submittedAt"));
            one.put("submittedByName", row.get("submittedByName"));
            outRows.add(one);
        }
        return Map.of(
                "total", total,
                "page", p,
                "size", s,
                "rows", outRows
        );
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> enrichDailyInspectionSheetDto(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.get("id"));
        Object sd = row.get("sheetDate");
        if (sd instanceof java.sql.Date d) {
            out.put("sheetDate", d.toLocalDate().toString());
        } else {
            out.put("sheetDate", sd == null ? null : sd.toString());
        }
        out.put("status", row.get("status"));
        out.put("version", ((Number) row.getOrDefault("version", 0)).intValue());
        out.put("submittedAt", row.get("submittedAt"));
        out.put("submittedByName", row.get("submittedByName"));
        String tid = blankToNull(row.get("templateId") == null ? null : Objects.toString(row.get("templateId"), "").trim());
        out.put("templateId", tid);
        try {
            if (tid == null) {
                throw new IllegalArgumentException("巡查表缺少模板 id");
            }
            out.put("template", getTemplate(tid));
        } catch (Exception e) {
            out.put("template", Map.of("id", tid == null ? "" : tid, "name", "（模板不存在）", "items", List.of()));
        }
        out.put("sites", listSitesForDailyTemplate(tid));
        String gj = Objects.toString(row.get("gridJson"), "{\"cells\":{}}");
        try {
            Map<String, Object> root = objectMapper.readValue(gj, new TypeReference<Map<String, Object>>() {
            });
            Object c = root.get("cells");
            if (c instanceof Map) {
                out.put("cells", c);
            } else {
                out.put("cells", new LinkedHashMap<String, String>());
            }
        } catch (Exception e) {
            out.put("cells", new LinkedHashMap<String, String>());
        }
        return out;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> patchDailyInspectionSheet(String id, Map<String, String> patchCells, int expectedVersion) {
        if (patchCells == null) patchCells = Map.of();
        List<Map<String, Object>> rows = jdbc.query(
                "SELECT id, grid_json gridJson, version FROM fm_daily_inspection_sheet WHERE id=?",
                rowMapperSimple(), id);
        if (rows.isEmpty()) throw new IllegalArgumentException("巡查表不存在");
        Map<String, Object> cur = rows.get(0);
        int ver = ((Number) cur.getOrDefault("version", 0)).intValue();
        if (ver != expectedVersion) throw new IllegalArgumentException("版本冲突，请刷新后重试");
        String gj = Objects.toString(cur.get("gridJson"), "{\"cells\":{}}");
        Map<String, Object> root;
        try {
            root = objectMapper.readValue(gj, new TypeReference<Map<String, Object>>() {
            });
        } catch (Exception e) {
            root = new LinkedHashMap<>();
            root.put("cells", new LinkedHashMap<String, String>());
        }
        Map<String, String> cells = new LinkedHashMap<>();
        Object existing = root.get("cells");
        if (existing instanceof Map<?, ?> em) {
            for (Map.Entry<?, ?> e : em.entrySet()) {
                cells.put(Objects.toString(e.getKey()), Objects.toString(e.getValue(), ""));
            }
        }
        cells.putAll(patchCells);
        root.put("cells", cells);
        String newJson;
        try {
            newJson = objectMapper.writeValueAsString(root);
        } catch (Exception e) {
            throw new IllegalArgumentException("JSON 序列化失败");
        }
        int n = jdbc.update(
                "UPDATE fm_daily_inspection_sheet SET grid_json=?, version=version+1, updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?",
                newJson, id, expectedVersion);
        if (n == 0) throw new IllegalArgumentException("版本冲突，请刷新后重试");
        List<Map<String, Object>> again = jdbc.query(
                """
                        SELECT id, sheet_date sheetDate, template_id templateId, status, grid_json gridJson, version,
                               submitted_at submittedAt, submitted_by_user_id submittedByUserId, submitted_by_name submittedByName
                        FROM fm_daily_inspection_sheet WHERE id=?
                        """,
                rowMapperSimple(), id);
        return enrichDailyInspectionSheetDto(again.get(0));
    }

    @Transactional(rollbackFor = Exception.class)
    public void submitDailyInspectionSheet(String id, String operatorUserId, String operatorName) {
        int n = jdbc.update(
                """
                        UPDATE fm_daily_inspection_sheet SET status='SUBMITTED', submitted_at=?,
                               submitted_by_user_id=?, submitted_by_name=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
                        """,
                LocalDateTime.now(), blankToNull(operatorUserId), blankToNull(operatorName), id);
        if (n == 0) throw new IllegalArgumentException("巡查表不存在");
    }

    /** 删除某日协作表整行，释放 sheet_date 以便重新选模板（与 UNIQUE 业务日一致） */
    @Transactional(rollbackFor = Exception.class)
    public void deleteDailyInspectionSheet(String id) {
        int n = jdbc.update("DELETE FROM fm_daily_inspection_sheet WHERE id=?", id);
        if (n == 0) throw new IllegalArgumentException("巡查表不存在");
    }

    @SuppressWarnings("unchecked")
    public byte[] exportDailyInspectionSheetExcel(String id) {
        List<Map<String, Object>> rows = jdbc.query(
                """
                        SELECT id, sheet_date sheetDate, template_id templateId, status, grid_json gridJson, version
                        FROM fm_daily_inspection_sheet WHERE id=?
                        """,
                rowMapperSimple(), id);
        if (rows.isEmpty()) throw new IllegalArgumentException("巡查表不存在");
        Map<String, Object> sheetRow = rows.get(0);
        String tid = blankToNull(sheetRow.get("templateId") == null ? null : Objects.toString(sheetRow.get("templateId"), "").trim());
        if (tid == null) {
            throw new IllegalArgumentException("巡查表缺少模板，无法导出");
        }
        Map<String, Object> tpl = getTemplate(tid);
        List<Map<String, Object>> items = (List<Map<String, Object>>) tpl.getOrDefault("items", List.of());
        List<Map<String, Object>> sites = listSitesForDailyTemplate(tid);
        Map<String, String> cells = new LinkedHashMap<>();
        try {
            Map<String, Object> root = objectMapper.readValue(Objects.toString(sheetRow.get("gridJson"), "{}"),
                    new TypeReference<Map<String, Object>>() {
                    });
            Object c = root.get("cells");
            if (c instanceof Map<?, ?> cm) {
                for (Map.Entry<?, ?> e : cm.entrySet()) {
                    cells.put(Objects.toString(e.getKey()), Objects.toString(e.getValue(), ""));
                }
            }
        } catch (Exception ignored) {
        }
        Object sdObj = sheetRow.get("sheetDate");
        LocalDate sd;
        if (sdObj instanceof java.sql.Date d) {
            sd = d.toLocalDate();
        } else {
            sd = LocalDate.parse(sdObj.toString().substring(0, Math.min(10, sdObj.toString().length())));
        }

        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sh = wb.createSheet("DailyInspection");
            Row h = sh.createRow(0);
            h.createCell(0).setCellValue("机房");
            int col = 1;
            for (Map<String, Object> it : items) {
                h.createCell(col++).setCellValue(Objects.toString(it.get("label"), ""));
            }
            int r = 1;
            for (Map<String, Object> site : sites) {
                String sid = Objects.toString(site.get("id"), "");
                String sname = Objects.toString(site.get("name"), "");
                Row row1 = sh.createRow(r++);
                row1.createCell(0).setCellValue(sname);
                col = 1;
                for (Map<String, Object> it : items) {
                    String iid = Objects.toString(it.get("id"), "");
                    String key = sid + "|" + iid;
                    row1.createCell(col++).setCellValue(cells.getOrDefault(key, ""));
                }
            }
            Row meta = sh.createRow(r);
            meta.createCell(0).setCellValue("巡查日期");
            meta.createCell(1).setCellValue(sd.toString());
            int lastCol = items.size();
            ExcelExportColumnAutosizer.autoSizeByContentWithHeaderFloor(sh, 0, 0, lastCol);
            wb.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            throw new IllegalArgumentException("导出失败: " + e.getMessage());
        }
    }

    // ---------- Consumable catalog ----------

    public List<Map<String, Object>> listConsumableCatalog(boolean includeDisabled) {
        String sql = includeDisabled
                ? "SELECT id, name, unit, sort_order sortOrder, disabled FROM fm_consumable_catalog ORDER BY sort_order, name"
                : "SELECT id, name, unit, sort_order sortOrder, disabled FROM fm_consumable_catalog WHERE (disabled IS NULL OR disabled = 0) ORDER BY sort_order, name";
        return jdbc.query(sql, rowMapperSimple());
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createConsumableCatalog(String name, String unit, int sortOrder) {
        String id = newId("FM_CC_");
        jdbc.update("INSERT INTO fm_consumable_catalog(id,name,unit,sort_order,disabled) VALUES(?,?,?,?,0)",
                id, nullToEmpty(name), blankToNull(unit), sortOrder);
        return Map.of("id", id);
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateConsumableCatalog(String id, String name, String unit, Integer sortOrder, Integer disabled) {
        List<Object> args = new ArrayList<>();
        StringBuilder sb = new StringBuilder("UPDATE fm_consumable_catalog SET ");
        boolean first = true;
        if (name != null) {
            sb.append(first ? "" : ", ").append("name=?");
            args.add(name);
            first = false;
        }
        if (unit != null) {
            sb.append(first ? "" : ", ").append("unit=?");
            args.add(blankToNull(unit));
            first = false;
        }
        if (sortOrder != null) {
            sb.append(first ? "" : ", ").append("sort_order=?");
            args.add(sortOrder);
            first = false;
        }
        if (disabled != null) {
            sb.append(first ? "" : ", ").append("disabled=?");
            args.add(disabled);
            first = false;
        }
        if (first) return;
        sb.append(" WHERE id=?");
        args.add(id);
        int n = jdbc.update(sb.toString(), args.toArray());
        if (n == 0) throw new IllegalArgumentException("耗材名目不存在");
    }

    @Transactional(rollbackFor = Exception.class)
    public void disableConsumableCatalog(String id) {
        int n = jdbc.update("UPDATE fm_consumable_catalog SET disabled=1 WHERE id=?", id);
        if (n == 0) throw new IllegalArgumentException("耗材名目不存在");
    }

    // ---------- Replacement filter presets ----------

    public List<Map<String, Object>> listReplacementFilterPresets(boolean includeDisabled) {
        String sql = includeDisabled
                ? "SELECT id, label, sort_order sortOrder, disabled FROM fm_replacement_filter_preset ORDER BY sort_order, label"
                : "SELECT id, label, sort_order sortOrder, disabled FROM fm_replacement_filter_preset WHERE disabled=0 ORDER BY sort_order, label";
        return jdbc.query(sql, rowMapperSimple());
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createReplacementFilterPreset(String label, int sortOrder) {
        String id = newId("FM_RP_");
        jdbc.update("INSERT INTO fm_replacement_filter_preset(id,label,sort_order,disabled) VALUES(?,?,?,0)",
                id, nullToEmpty(label), sortOrder);
        return Map.of("id", id);
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateReplacementFilterPreset(String id, String label, Integer sortOrder, Integer disabled) {
        List<Object> args = new ArrayList<>();
        StringBuilder sb = new StringBuilder("UPDATE fm_replacement_filter_preset SET ");
        boolean first = true;
        if (label != null) {
            sb.append(first ? "" : ", ").append("label=?");
            args.add(label);
            first = false;
        }
        if (sortOrder != null) {
            sb.append(first ? "" : ", ").append("sort_order=?");
            args.add(sortOrder);
            first = false;
        }
        if (disabled != null) {
            sb.append(first ? "" : ", ").append("disabled=?");
            args.add(disabled);
            first = false;
        }
        if (first) return;
        sb.append(" WHERE id=?");
        args.add(id);
        int n = jdbc.update(sb.toString(), args.toArray());
        if (n == 0) throw new IllegalArgumentException("更换类型不存在");
    }

    @Transactional(rollbackFor = Exception.class)
    public void disableReplacementFilterPreset(String id) {
        int n = jdbc.update("UPDATE fm_replacement_filter_preset SET disabled=1 WHERE id=?", id);
        if (n == 0) throw new IllegalArgumentException("更换类型不存在");
    }

    // ---------- helpers ----------

    /**
     * 部分 MySQL JDBC / useOldAliasMetadataBehavior 下 getColumnLabel 会把 {@code template_id templateId}
     * 变成全小写 {@code templateid}，导致 Java 侧 {@code row.get("templateId")==null}，当日巡查表嵌套模板退化为「无巡查项」。
     */
    private static String normalizeJdbcColumnLabel(String raw) {
        if (raw == null || raw.isBlank()) {
            return raw;
        }
        if (raw.indexOf('_') >= 0) {
            return snakeToLowerCamel(raw);
        }
        if (!raw.equals(raw.toLowerCase(Locale.ROOT))) {
            return raw;
        }
        return switch (raw) {
            case "templateid" -> "templateId";
            case "sheetdate" -> "sheetDate";
            case "gridjson" -> "gridJson";
            case "submittedat" -> "submittedAt";
            case "submittedbyuserid" -> "submittedByUserId";
            case "submittedbyname" -> "submittedByName";
            case "fieldtype" -> "fieldType";
            case "optionsetid" -> "optionSetId";
            case "requiredflag" -> "requiredFlag";
            case "sortorder" -> "sortOrder";
            case "siteid" -> "siteId";
            case "sitename" -> "siteName";
            case "operatoruserid" -> "operatorUserId";
            case "operatorname" -> "operatorName";
            case "valuesjson" -> "valuesJson";
            case "inspectedat" -> "inspectedAt";
            case "createdat" -> "createdAt";
            case "updatedat" -> "updatedAt";
            case "templatename" -> "templateName";
            case "optionitem" -> "optionItem";
            case "optionset" -> "optionSet";
            case "filtertype" -> "filterType";
            case "replacedat" -> "replacedAt";
            case "occurredat" -> "occurredAt";
            case "consumablename" -> "consumableName";
            case "createdby" -> "createdBy";
            case "createdbyname" -> "createdByName";
            default -> raw;
        };
    }

    private static String snakeToLowerCamel(String s) {
        String[] parts = s.split("_");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            String p = parts[i];
            if (p.isEmpty()) {
                continue;
            }
            if (i == 0) {
                sb.append(p.toLowerCase(Locale.ROOT));
            } else {
                sb.append(Character.toUpperCase(p.charAt(0))).append(p.substring(1).toLowerCase(Locale.ROOT));
            }
        }
        return sb.toString();
    }

    private RowMapper<Map<String, Object>> rowMapperSimple() {
        return (rs, rowNum) -> {
            int cc = rs.getMetaData().getColumnCount();
            Map<String, Object> m = new LinkedHashMap<>();
            for (int i = 1; i <= cc; i++) {
                String col = normalizeJdbcColumnLabel(rs.getMetaData().getColumnLabel(i));
                Object v = rs.getObject(i);
                if (v instanceof java.sql.Timestamp t) {
                    m.put(col, t.toLocalDateTime());
                } else if (v instanceof java.math.BigDecimal bd) {
                    m.put(col, bd);
                } else {
                    m.put(col, v);
                }
            }
            return m;
        };
    }

    private Map<String, String> parseJsonMap(Object json) {
        if (json == null) return Map.of();
        String s = json.toString();
        if (s.isBlank()) return Map.of();
        try {
            return objectMapper.readValue(s, new TypeReference<Map<String, String>>() {});
        } catch (Exception e) {
            return Map.of();
        }
    }

    private String writeJson(Map<String, String> m) {
        try {
            return objectMapper.writeValueAsString(m == null ? Map.of() : m);
        } catch (Exception e) {
            throw new IllegalArgumentException("JSON 序列化失败");
        }
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s.trim();
    }

    private static String blankToNull(String s) {
        if (s == null || s.isBlank()) return null;
        return s.trim();
    }

    private static int parseInt(Object o, int def) {
        if (o == null) return def;
        if (o instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(o.toString().trim());
        } catch (Exception e) {
            return def;
        }
    }

    private static LocalDateTime toLocalDateTime(Object v) {
        if (v == null) return null;
        if (v instanceof LocalDateTime ldt) return ldt;
        if (v instanceof java.sql.Timestamp ts) return ts.toLocalDateTime();
        if (v instanceof java.util.Date d) {
            return java.time.Instant.ofEpochMilli(d.getTime()).atZone(java.time.ZoneId.systemDefault()).toLocalDateTime();
        }
        return null;
    }
}
