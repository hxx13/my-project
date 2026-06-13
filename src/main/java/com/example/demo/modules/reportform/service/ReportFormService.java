package com.example.demo.modules.reportform.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.modules.reportform.dto.ReportFormImportResult;
import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.entity.ReportFormOptionSet;
import com.example.demo.modules.reportform.mapper.ReportFormDefinitionMapper;
import com.example.demo.modules.reportform.mapper.ReportFormOptionSetMapper;
import com.example.demo.modules.reportform.mapper.ReportFormSubmissionMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class ReportFormService {

    private static final Logger log = LoggerFactory.getLogger(ReportFormService.class);

    private final ReportFormDefinitionMapper definitionMapper;
    private final ReportFormOptionSetMapper optionSetMapper;
    private final ReportFormSubmissionMapper submissionMapper;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ReportFormService(ReportFormDefinitionMapper definitionMapper,
                             ReportFormOptionSetMapper optionSetMapper,
                             ReportFormSubmissionMapper submissionMapper) {
        this.definitionMapper = definitionMapper;
        this.optionSetMapper = optionSetMapper;
        this.submissionMapper = submissionMapper;
    }

    public List<ReportFormDefinition> page() {
        return definitionMapper.selectPage();
    }

    public ReportFormDefinition getById(Long id) {
        ReportFormDefinition def = definitionMapper.selectById(id);
        if (def == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.NOT_FOUND, "报表表单不存在");
        }
        log.info("[report-form] 读取表单: id={} name={} layoutLen={}",
                def.getId(), def.getName(),
                def.getLayoutJson() != null ? def.getLayoutJson().length() : 0);
        return def;
    }

    public void update(Long id, Map<String, Object> body, String username) {
        ReportFormDefinition def = definitionMapper.selectById(id);
        if (def == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.NOT_FOUND, "报表不存在");
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
        def.setUpdatedBy(username);
        int rows = definitionMapper.update(def);
        log.info("[report-form] 保存完成: id={} rows={} layoutLen={}",
                id, rows, def.getLayoutJson() != null ? def.getLayoutJson().length() : 0);
        if (rows == 0) {
            throw new RuntimeException("保存失败：未找到匹配记录");
        }
    }

    public ReportFormDefinition createBlank(String username) {
        ReportFormDefinition def = new ReportFormDefinition();
        def.setName("空白报表 " + java.time.LocalDate.now().toString());
        def.setStatus("draft");
        def.setLayoutJson(generateDefaultLayout(5, 5));
        def.setThemeJson(getDefaultTheme());
        def.setFillPolicyJson("{\"mode\":\"shared\",\"submitLabel\":\"提交\",\"allowEditAfterSubmit\":true}");
        def.setPermissionJson("{\"visibleRoles\":[],\"visibleUserIds\":[],\"fieldRoleBindings\":{},\"allowUnboundView\":true}");
        def.setScheduleJson("{\"period\":\"manual\"}");
        def.setCreatedBy(username);
        def.setUpdatedBy(username);
        definitionMapper.insert(def);
        return def;
    }

    public ReportFormDefinition createFromImport(ReportFormImportResult result, String username) {
        ReportFormDefinition def = new ReportFormDefinition();
        def.setName(result.getName());
        def.setStatus("draft");
        def.setLayoutJson(result.getLayoutJson());
        def.setThemeJson(getDefaultTheme());
        def.setFillPolicyJson("{\"mode\":\"shared\",\"submitLabel\":\"提交\",\"allowEditAfterSubmit\":true}");
        def.setPermissionJson("{\"visibleRoles\":[],\"visibleUserIds\":[],\"fieldRoleBindings\":{},\"allowUnboundView\":true}");
        def.setScheduleJson("{\"period\":\"manual\"}");
        def.setCreatedBy(username);
        def.setUpdatedBy(username);
        definitionMapper.insert(def);
        return def;
    }

    public ReportFormDefinition publish(Long id, String username) {
        ReportFormDefinition def = definitionMapper.selectById(id);
        if (def == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.NOT_FOUND, "报表不存在");
        }
        if ("published".equals(def.getStatus())) {
            throw new RuntimeException("报表已发布，无需重复操作");
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
        snapshot.put("publishedAt", java.time.LocalDateTime.now().toString());
        snapshot.put("publishedBy", username);
        ObjectNode snapshotData = objectMapper.createObjectNode();
        snapshotData.put("layoutJson", def.getLayoutJson());
        snapshotData.put("themeJson", def.getThemeJson());
        snapshotData.put("permissionJson", def.getPermissionJson());
        snapshot.set("snapshot", snapshotData);
        snapshotArray.add(snapshot);

        def.setStatus("published");
        def.setPublishedBy(username);
        def.setPublishedAt(java.time.LocalDateTime.now());
        def.setVersionSnapshotsJson(snapshotArray.toString());
        def.setUpdatedBy(username);
        definitionMapper.updateStatus(def);
        return def;
    }

    public void unpublish(Long id, String username) {
        ReportFormDefinition def = definitionMapper.selectById(id);
        if (def == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.NOT_FOUND, "报表不存在");
        }
        if (!"published".equals(def.getStatus())) {
            throw new RuntimeException("报表未发布，无法撤回");
        }
        def.setStatus("draft");
        def.setUpdatedBy(username);
        definitionMapper.updateStatus(def);
    }

    // ──────────────── Archive / Unarchive ────────────────

    public void archive(Long id) {
        ReportFormDefinition def = definitionMapper.selectById(id);
        if (def == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.NOT_FOUND, "报表不存在");
        }
        def.setStatus("archived");
        definitionMapper.updateStatus(def);
    }

    public void unarchive(Long id) {
        ReportFormDefinition def = definitionMapper.selectById(id);
        if (def == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.NOT_FOUND, "报表不存在");
        }
        def.setStatus("draft");
        definitionMapper.updateStatus(def);
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
            throw new RuntimeException("报表不存在");
        }
        ReportFormDefinition template = new ReportFormDefinition();
        template.setName(src.getName() + " (模板)");
        template.setDescription(src.getDescription());
        template.setStatus("draft");
        template.setLayoutJson(src.getLayoutJson());
        template.setThemeJson(src.getThemeJson());
        template.setFillPolicyJson(src.getFillPolicyJson());
        template.setPermissionJson(src.getPermissionJson());
        template.setScheduleJson(src.getScheduleJson());
        template.setCreatedBy(username);
        template.setUpdatedBy(username);
        definitionMapper.insert(template);
        return template;
    }

    public List<ReportFormDefinition> listTemplates() {
        return definitionMapper.selectPage().stream()
            .filter(f -> "draft".equals(f.getStatus()))
            .collect(java.util.stream.Collectors.toList());
    }

    // ──────────────── Delete / Rename / Duplicate ────────────────

    public void deleteForm(Long id) {
        ReportFormDefinition def = definitionMapper.selectById(id);
        if (def == null) {
            throw new RuntimeException("报表不存在");
        }
        definitionMapper.deleteById(id);
    }

    public void renameForm(Long id, String name) {
        ReportFormDefinition def = definitionMapper.selectById(id);
        if (def == null) {
            throw new RuntimeException("报表不存在");
        }
        def.setName(name);
        definitionMapper.update(def);
    }

    public ReportFormDefinition duplicateForm(Long id, String username) {
        ReportFormDefinition src = definitionMapper.selectById(id);
        if (src == null) {
            throw new RuntimeException("报表不存在");
        }
        ReportFormDefinition dup = new ReportFormDefinition();
        dup.setName(src.getName() + " (副本)");
        dup.setDescription(src.getDescription());
        dup.setStatus("draft");
        dup.setLayoutJson(src.getLayoutJson());
        dup.setThemeJson(src.getThemeJson());
        dup.setFillPolicyJson(src.getFillPolicyJson());
        dup.setPermissionJson(src.getPermissionJson());
        dup.setScheduleJson(src.getScheduleJson());
        dup.setCreatedBy(username);
        dup.setUpdatedBy(username);
        definitionMapper.insert(dup);
        return dup;
    }

    // ──────────────── Option Set CRUD ────────────────

    public List<ReportFormOptionSet> listOptionSets() {
        return optionSetMapper.selectByScope(null);
    }

    public ReportFormOptionSet createOptionSet(String name, String scope, Long formId, String itemsJson) {
        ReportFormOptionSet os = new ReportFormOptionSet();
        os.setName(name);
        os.setScope(scope != null ? scope : "global");
        os.setFormId(formId);
        os.setItemsJson(itemsJson);
        optionSetMapper.insert(os);
        return os;
    }

    public void updateOptionSet(Long id, String name, String itemsJson) {
        ReportFormOptionSet os = optionSetMapper.selectById(id);
        if (os == null) {
            throw new RuntimeException("选项集不存在");
        }
        os.setName(name);
        os.setItemsJson(itemsJson);
        optionSetMapper.update(os);
    }

    public void deleteOptionSet(Long id) {
        int refs = optionSetMapper.countFieldRefsByOptionSetId(id);
        if (refs > 0) {
            throw new RuntimeException("该选项集被 " + refs + " 个表单引用，无法删除");
        }
        optionSetMapper.deleteById(id);
    }
}
