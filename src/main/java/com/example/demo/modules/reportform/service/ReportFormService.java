package com.example.demo.modules.reportform.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.modules.reportform.dto.ReportFormImportResult;
import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.entity.ReportFormOptionSet;
import com.example.demo.modules.reportform.entity.ReportFormTemplate;
import com.example.demo.modules.reportform.mapper.ReportFormDefinitionMapper;
import com.example.demo.modules.reportform.mapper.ReportFormOptionSetMapper;
import com.example.demo.modules.reportform.mapper.ReportFormSubmissionMapper;
import com.example.demo.modules.reportform.mapper.ReportFormTemplateMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Service
public class ReportFormService {

    private static final Logger log = LoggerFactory.getLogger(ReportFormService.class);

    private final ReportFormDefinitionMapper definitionMapper;
    private final ReportFormOptionSetMapper optionSetMapper;
    private final ReportFormSubmissionMapper submissionMapper;
    private final ReportFormTemplateMapper templateMapper;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ReportFormService(ReportFormDefinitionMapper definitionMapper,
                             ReportFormOptionSetMapper optionSetMapper,
                             ReportFormSubmissionMapper submissionMapper,
                             ReportFormTemplateMapper templateMapper) {
        this.definitionMapper = definitionMapper;
        this.optionSetMapper = optionSetMapper;
        this.submissionMapper = submissionMapper;
        this.templateMapper = templateMapper;
    }

    /** 管理列表：每个人只看自己创建的 */
    public List<ReportFormDefinition> page(String role, String username) {
        return definitionMapper.selectPageByUser(username);
    }

    public ReportFormDefinition getById(Long id) {
        ReportFormDefinition def = definitionMapper.selectById(id);
        if (def == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "报表表单不存在");
        }
        log.info("[report-form] 读取表单: id={} name={} layoutLen={}",
                def.getId(), def.getName(),
                def.getLayoutJson() != null ? def.getLayoutJson().length() : 0);
        return def;
    }

    public void update(Long id, Map<String, Object> body, String username) {
        ReportFormDefinition def = definitionMapper.selectById(id);
        if (def == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "报表不存在");
        }

        // If the form is published and layout is being changed, log it for audit
        if ("published".equals(def.getStatus()) && body.containsKey("layoutJson")) {
            int submissionCount = submissionMapper.countByFormId(def.getId());
            log.warn("[report-form] 已发布报表 {} ({}) 的结构被 {} 修改 — 已有 {} 条填报记录将自动兼容新结构",
                    def.getId(), def.getName(), username, submissionCount);
        }

        if (body.containsKey("name")) def.setName((String) body.get("name"));
        if (body.containsKey("description")) def.setDescription((String) body.get("description"));
        if (body.containsKey("layoutJson")) def.setLayoutJson((String) body.get("layoutJson"));
        if (body.containsKey("themeJson")) def.setThemeJson((String) body.get("themeJson"));
        if (body.containsKey("fillPolicyJson")) def.setFillPolicyJson((String) body.get("fillPolicyJson"));
        if (body.containsKey("permissionJson")) def.setPermissionJson((String) body.get("permissionJson"));
        if (body.containsKey("scheduleJson")) def.setScheduleJson((String) body.get("scheduleJson"));
        if (body.containsKey("pinned")) def.setPinned((Boolean) body.get("pinned"));
        if (body.containsKey("wordTemplateIdsJson")) def.setWordTemplateIdsJson((String) body.get("wordTemplateIdsJson"));
        def.setUpdatedBy(username);
        touchUpdated(def);
        int rows = definitionMapper.update(def);
        log.info("[report-form] 保存完成: id={} rows={} layoutLen={}",
                id, rows, def.getLayoutJson() != null ? def.getLayoutJson().length() : 0);
        if (rows == 0) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "保存失败：未找到匹配记录");
        }
    }

    public ReportFormDefinition createBlank(String username) {
        ReportFormDefinition def = new ReportFormDefinition();
        def.setName("空白报表 " + java.time.LocalDate.now().toString());
        def.setSource("blank");
        def.setStatus("draft");
        def.setLayoutJson(generateDefaultLayout(5, 5));
        def.setThemeJson(getDefaultTheme());
        def.setFillPolicyJson("{\"mode\":\"shared\",\"submitLabel\":\"提交\",\"allowEditAfterSubmit\":true}");
        def.setPermissionJson("{\"visibleRoles\":[],\"visibleUserIds\":[],\"fieldRoleBindings\":{},\"allowUnboundView\":true}");
        def.setScheduleJson("{\"period\":\"manual\"}");
        def.setCreatedBy(username);
        def.setUpdatedBy(username);
        stampNew(def);
        definitionMapper.insert(def);
        return def;
    }

    public ReportFormDefinition createFromImport(ReportFormImportResult result, String username) {
        ReportFormDefinition def = new ReportFormDefinition();
        def.setName(result.getName());
        def.setSource(result.getSource() != null ? result.getSource() : "excel");
        def.setStatus("draft");
        def.setLayoutJson(result.getLayoutJson());
        def.setThemeJson(result.getThemeJson() != null && !result.getThemeJson().isBlank()
                ? result.getThemeJson() : getDefaultTheme());
        def.setFillPolicyJson("{\"mode\":\"shared\",\"submitLabel\":\"提交\",\"allowEditAfterSubmit\":true}");
        def.setPermissionJson("{\"visibleRoles\":[],\"visibleUserIds\":[],\"fieldRoleBindings\":{},\"allowUnboundView\":true}");
        def.setScheduleJson("{\"period\":\"manual\"}");
        if (result.getWordTemplateBase64() != null && !result.getWordTemplateBase64().isBlank()) {
            try {
                def.setWordTemplateIdsJson(buildWordTemplateBindingJson(result));
            } catch (Exception e) {
                log.warn("[report-form] Word 打印模板自动绑定失败，表单仍已创建: {}", e.getMessage());
            }
        }
        def.setCreatedBy(username);
        def.setUpdatedBy(username);
        stampNew(def);
        definitionMapper.insert(def);
        return def;
    }

    private String buildWordTemplateBindingJson(ReportFormImportResult result) throws Exception {
        String wtId = "wt_" + java.util.UUID.randomUUID().toString().substring(0, 8);
        ObjectNode binding = objectMapper.createObjectNode();
        binding.put("id", wtId);
        String tmplName = result.getWordTemplateName() != null && !result.getWordTemplateName().isBlank()
                ? result.getWordTemplateName() : result.getName();
        binding.put("name", tmplName);
        binding.put("data", result.getWordTemplateBase64());

        if (result.getBookmarksJson() != null && !result.getBookmarksJson().isBlank()) {
            binding.set("bookmarks", objectMapper.readTree(result.getBookmarksJson()));
        } else {
            binding.putArray("bookmarks");
        }

        if (result.getBookmarkMappingJson() != null && !result.getBookmarkMappingJson().isBlank()) {
            binding.set("bookmarkMapping", objectMapper.readTree(result.getBookmarkMappingJson()));
        } else {
            binding.putObject("bookmarkMapping");
        }

        ArrayNode templates = objectMapper.createArrayNode();
        templates.add(binding);
        return templates.toString();
    }

    public ReportFormDefinition publish(Long id, String username) {
        ReportFormDefinition def = definitionMapper.selectById(id);
        if (def == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "报表不存在");
        }
        // 允许重新发布（已发布 / 已归档 → 更新版本快照并恢复为已发布）
        if ("published".equals(def.getStatus())) {
            log.info("[report-form] 重新发布报表 {} — 增量版本快照", id);
        } else if ("archived".equals(def.getStatus())) {
            log.info("[report-form] 从归档状态重新发布报表 {}", id);
        }

        // Build version snapshot
        String snapshots = def.getVersionSnapshotsJson();
        ArrayNode snapshotArray;
        try {
            if (snapshots != null && !snapshots.isEmpty()) {
                snapshotArray = (ArrayNode) objectMapper.readTree(snapshots);
            } else {
                snapshotArray = objectMapper.createArrayNode();
            }
        } catch (Exception e) {
            snapshotArray = objectMapper.createArrayNode();
        }

        int nextVersion = snapshotArray.size() + 1;
        ObjectNode snapshot = objectMapper.createObjectNode();
        snapshot.put("version", nextVersion);
        snapshot.put("publishedAt", com.example.demo.common.time.BusinessTimeWindow.toDisplayWallClock(
                LocalDateTime.now()));
        snapshot.put("publishedBy", username);
        ObjectNode snapshotData = objectMapper.createObjectNode();
        snapshotData.put("layoutJson", def.getLayoutJson());
        snapshotData.put("themeJson", def.getThemeJson());
        snapshotData.put("permissionJson", def.getPermissionJson());
        snapshot.set("snapshot", snapshotData);
        snapshotArray.add(snapshot);

        def.setStatus("published");
        def.setPublishedBy(username);
        def.setPublishedAt(LocalDateTime.now());
        def.setVersionSnapshotsJson(snapshotArray.toString());
        def.setUpdatedBy(username);
        touchUpdated(def);
        definitionMapper.updateStatus(def);

        // 发布保险：自动备份到模板库，源文件删除后模板仍存活
        try {
            ReportFormTemplate t = new ReportFormTemplate();
            t.setName(def.getName());
            t.setDescription(def.getDescription());
            t.setLayoutJson(def.getLayoutJson());
            t.setThemeJson(def.getThemeJson());
            t.setFillPolicyJson(def.getFillPolicyJson());
            t.setPermissionJson(def.getPermissionJson());
            t.setScheduleJson(def.getScheduleJson());
            t.setWordTemplateIdsJson(def.getWordTemplateIdsJson());
            t.setVersionSnapshotsJson(snapshotArray.toString());
            t.setCreatedBy(username);
            stampNew(t);
            templateMapper.insert(t);
            log.info("[report-form] 发布模板备份完成: templateId={} name={}", t.getId(), def.getName());
        } catch (Exception e) {
            log.warn("[report-form] 模板备份失败（不影响发布）: {}", e.getMessage());
        }

        return def;
    }

    public void unpublish(Long id, String username) {
        ReportFormDefinition def = definitionMapper.selectById(id);
        if (def == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "报表不存在");
        }
        if (!"published".equals(def.getStatus())) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_PUBLISHED, "报表未发布，无法撤回");
        }
        def.setStatus("draft");
        def.setUpdatedBy(username);
        touchUpdated(def);
        definitionMapper.updateStatus(def);
    }

    // ──────────────── Archive / Unarchive ────────────────

    public void archive(Long id, String username) {
        ReportFormDefinition def = definitionMapper.selectById(id);
        if (def == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "报表不存在");
        }
        if ("archived".equals(def.getStatus())) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_FIELD_INVALID, "报表已归档");
        }
        def.setStatus("archived");
        def.setUpdatedBy(username);
        touchUpdated(def);
        definitionMapper.updateStatus(def);
    }

    public void unarchive(Long id, String username) {
        ReportFormDefinition def = definitionMapper.selectById(id);
        if (def == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "报表不存在");
        }
        if (!"archived".equals(def.getStatus())) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_FIELD_INVALID, "报表未归档");
        }
        // 曾发布过的模板取消归档后恢复为已发布，避免仍显示为草稿/归档
        if (def.getPublishedAt() != null && def.getPublishedBy() != null && !def.getPublishedBy().isBlank()) {
            def.setStatus("published");
        } else {
            def.setStatus("draft");
        }
        def.setUpdatedBy(username);
        touchUpdated(def);
        definitionMapper.updateStatus(def);
    }

    private void stampNew(ReportFormDefinition def) {
        LocalDateTime now = LocalDateTime.now();
        def.setCreatedAt(now);
        def.setUpdatedAt(now);
    }

    private void touchUpdated(ReportFormDefinition def) {
        def.setUpdatedAt(LocalDateTime.now());
    }

    private void stampNew(ReportFormTemplate template) {
        LocalDateTime now = LocalDateTime.now();
        template.setCreatedAt(now);
        template.setUpdatedAt(now);
    }

    private void stampNew(ReportFormOptionSet os) {
        LocalDateTime now = LocalDateTime.now();
        os.setCreatedAt(now);
        os.setUpdatedAt(now);
    }

    private void touchUpdated(ReportFormOptionSet os) {
        os.setUpdatedAt(LocalDateTime.now());
    }

    private String generateDefaultLayout(int rows, int cols) {
        try {
            ObjectNode layout = objectMapper.createObjectNode();
            ArrayNode cells = objectMapper.createArrayNode();
            ObjectNode fields = objectMapper.createObjectNode();
            ArrayNode mergeGroups = objectMapper.createArrayNode();

            for (int r = 0; r < rows; r++) {
                for (int c = 0; c < cols; c++) {
                    int cellId = r * cols + c;
                    String fieldKey = "f_" + cellId;

                    ObjectNode cellNode = objectMapper.createObjectNode();
                    cellNode.put("id", "c" + cellId);
                    cellNode.put("row", r);
                    cellNode.put("col", c);
                    cellNode.put("colSpan", 1);
                    cellNode.put("rowSpan", 1);
                    cellNode.put("kind", "static");
                    cellNode.put("staticText", "");
                    cellNode.put("fieldKey", fieldKey);

                    ObjectNode styleNode = objectMapper.createObjectNode();
                    styleNode.put("align", "center");
                    cellNode.set("style", styleNode);

                    cells.add(cellNode);

                    ObjectNode fieldNode = objectMapper.createObjectNode();
                    fieldNode.put("type", "TEXT");
                    fieldNode.put("label", "字段" + cellId);
                    fieldNode.put("editableInFill", true);
                    fieldNode.putArray("editableByRoles");
                    fields.set(fieldKey, fieldNode);
                }
            }

            layout.set("cells", cells);
            layout.set("fields", fields);
            layout.set("mergeGroups", mergeGroups);
            return layout.toString();
        } catch (Exception e) {
            log.error("生成默认布局失败", e);
            return "{\"cells\":[],\"fields\":{},\"mergeGroups\":[]}";
        }
    }

    private String getDefaultTheme() {
        return "{\"headerBg\":\"var(--app-color-surface-container)\",\"headerColor\":\"var(--app-color-text-primary)\",\"headerFontSize\":13,\"headerBold\":true,\"headerAlign\":\"center\",\"zebraStripe\":true,\"oddRowBg\":\"var(--app-color-surface-page)\",\"evenRowBg\":\"var(--app-color-surface-container)\",\"borderWidth\":1,\"borderColor\":\"var(--app-color-border)\",\"borderRadius\":8,\"cellPadding\":8,\"defaultFontSize\":13,\"defaultAlign\":\"center\",\"columnWidths\":{},\"rowHeights\":{}}";
    }

    // ──────────────── Template ────────────────

    public ReportFormDefinition saveAsTemplate(Long id, boolean shared, String username) {
        ReportFormDefinition src = definitionMapper.selectById(id);
        if (src == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "报表不存在");
        }
        ReportFormDefinition template = new ReportFormDefinition();
        template.setName(src.getName() + " (模板)");
        template.setDescription(src.getDescription());
        template.setSource("template");
        template.setStatus("draft");
        template.setLayoutJson(src.getLayoutJson());
        template.setThemeJson(src.getThemeJson());
        template.setFillPolicyJson(src.getFillPolicyJson());
        template.setPermissionJson(src.getPermissionJson());
        template.setScheduleJson(src.getScheduleJson());
        template.setCreatedBy(username);
        template.setUpdatedBy(username);
        stampNew(template);
        definitionMapper.insert(template);
        return template;
    }

    public List<ReportFormDefinition> listTemplates() {
        return definitionMapper.selectPage().stream()
            .filter(f -> "draft".equals(f.getStatus()))
            .collect(java.util.stream.Collectors.toList());
    }

    public void togglePin(Long id) {
        ReportFormDefinition def = definitionMapper.selectById(id);
        if (def == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "报表不存在");
        }
        boolean newPinned = def.getPinned() == null || !def.getPinned();
        definitionMapper.updatePinned(id, newPinned);
        log.info("[report-form] 置顶切换: id={} pinned={}", id, newPinned);
    }

    // ──────────────── Delete / Rename / Duplicate ────────────────

    public void deleteForm(Long id) {
        ReportFormDefinition def = definitionMapper.selectById(id);
        if (def == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "报表不存在");
        }
        definitionMapper.deleteById(id);
    }

    public void renameForm(Long id, String name) {
        ReportFormDefinition def = definitionMapper.selectById(id);
        if (def == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "报表不存在");
        }
        def.setName(name);
        touchUpdated(def);
        definitionMapper.update(def);
    }

    public ReportFormDefinition duplicateForm(Long id, String username) {
        ReportFormDefinition src = definitionMapper.selectById(id);
        if (src == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "报表不存在");
        }
        ReportFormDefinition dup = new ReportFormDefinition();
        dup.setName(src.getName() + " (副本)");
        dup.setDescription(src.getDescription());
        dup.setSource(src.getSource() != null ? src.getSource() : "blank");
        dup.setStatus("draft");
        dup.setLayoutJson(src.getLayoutJson());
        dup.setThemeJson(src.getThemeJson());
        dup.setFillPolicyJson(src.getFillPolicyJson());
        dup.setPermissionJson(src.getPermissionJson());
        dup.setScheduleJson(src.getScheduleJson());
        dup.setCreatedBy(username);
        dup.setUpdatedBy(username);
        stampNew(dup);
        definitionMapper.insert(dup);
        return dup;
    }

    // ──────────────── Option Set CRUD ────────────────

    public List<ReportFormOptionSet> listOptionSets(String username, String authProfile, Long formId) {
        return optionSetMapper.selectVisible(username, authProfile, formId);
    }

    public ReportFormOptionSet getOptionSet(Long id) {
        ReportFormOptionSet os = optionSetMapper.selectById(id);
        if (os == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.NOT_FOUND, "选项集不存在");
        }
        return os;
    }

    public ReportFormOptionSet createOptionSet(String name, String scope, Long formId, String itemsJson,
                                               String username, String authProfile) {
        ReportFormOptionSet os = new ReportFormOptionSet();
        os.setName(name);
        String resolvedScope = scope != null ? scope : "user";
        os.setScope(resolvedScope);
        os.setFormId(formId);
        os.setItemsJson(itemsJson);
        os.setCreatedBy(username);
        os.setAuthProfile(authProfile);
        stampNew(os);
        optionSetMapper.insert(os);
        return os;
    }

    public void updateOptionSet(Long id, String name, String itemsJson, String username) {
        ReportFormOptionSet os = optionSetMapper.selectById(id);
        if (os == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.NOT_FOUND, "选项集不存在");
        }
        assertOptionSetWritable(os, username);
        os.setName(name);
        os.setItemsJson(itemsJson);
        touchUpdated(os);
        optionSetMapper.update(os);
    }

    public void deleteOptionSet(Long id, String username) {
        ReportFormOptionSet os = optionSetMapper.selectById(id);
        if (os == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.NOT_FOUND, "选项集不存在");
        }
        assertOptionSetWritable(os, username);
        int refs = optionSetMapper.countFieldRefsByOptionSetId(id);
        if (refs > 0) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_OPTION_SET_IN_USE,
                    "该选项集被 " + refs + " 个表单引用，无法删除");
        }
        optionSetMapper.deleteById(id);
    }

    /** 个人预设仅创建人可改删；无创建人记录的共享预设允许同体系管理员维护 */
    private void assertOptionSetWritable(ReportFormOptionSet os, String username) {
        if (os.getCreatedBy() != null && !os.getCreatedBy().isBlank()
                && !os.getCreatedBy().equals(username)) {
            throw TwinBusinessException.of(ErrorCodeConstants.FORBIDDEN, "只能操作自己保存的预设");
        }
    }
}
