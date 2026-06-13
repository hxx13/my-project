package com.example.demo.modules.reportform.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.modules.reportform.dto.ReportFormImportResult;
import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.entity.ReportFormOptionSet;
import com.example.demo.modules.reportform.mapper.ReportFormDefinitionMapper;
import com.example.demo.modules.reportform.mapper.ReportFormOptionSetMapper;
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
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ReportFormService(ReportFormDefinitionMapper definitionMapper,
                             ReportFormOptionSetMapper optionSetMapper) {
        this.definitionMapper = definitionMapper;
        this.optionSetMapper = optionSetMapper;
    }

    public List<ReportFormDefinition> page() {
        return definitionMapper.selectPage();
    }

    public ReportFormDefinition getById(Long id) {
        ReportFormDefinition def = definitionMapper.selectById(id);
        if (def == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.NOT_FOUND, "报表表单不存在");
        }
        return def;
    }

    public void update(Long id, Map<String, Object> body, String username) {
        ReportFormDefinition def = definitionMapper.selectById(id);
        if (def == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.NOT_FOUND, "报表不存在");
        }
        if (body.containsKey("name")) def.setName((String) body.get("name"));
        if (body.containsKey("description")) def.setDescription((String) body.get("description"));
        if (body.containsKey("layoutJson")) def.setLayoutJson((String) body.get("layoutJson"));
        if (body.containsKey("themeJson")) def.setThemeJson((String) body.get("themeJson"));
        if (body.containsKey("fillPolicyJson")) def.setFillPolicyJson((String) body.get("fillPolicyJson"));
        if (body.containsKey("permissionJson")) def.setPermissionJson((String) body.get("permissionJson"));
        if (body.containsKey("scheduleJson")) def.setScheduleJson((String) body.get("scheduleJson"));
        def.setUpdatedBy(username);
        definitionMapper.update(def);
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

    private String getDefaultTheme() {
        return "{\"headerBg\":\"var(--app-color-surface-container)\",\"headerColor\":\"var(--app-color-text-primary)\",\"headerFontSize\":13,\"headerBold\":true,\"headerAlign\":\"center\",\"zebraStripe\":true,\"oddRowBg\":\"var(--app-color-surface-page)\",\"evenRowBg\":\"var(--app-color-surface-container)\",\"borderWidth\":1,\"borderColor\":\"var(--app-color-border)\",\"borderRadius\":8,\"cellPadding\":8,\"defaultFontSize\":13,\"defaultAlign\":\"center\",\"columnWidths\":{},\"rowHeights\":{}}";
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
