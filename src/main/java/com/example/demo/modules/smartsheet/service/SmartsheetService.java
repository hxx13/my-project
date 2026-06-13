package com.example.demo.modules.smartsheet.service;

import com.example.demo.modules.smartsheet.entity.SmartsheetDefinition;
import com.example.demo.modules.smartsheet.mapper.SmartsheetDefinitionMapper;
import com.example.demo.modules.smartsheet.mapper.SmartsheetChangeLogMapper;
import com.example.demo.modules.smartsheet.mapper.SmartsheetRowMapper;
import com.example.demo.modules.smartsheet.dto.*;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.demo.modules.smartsheet.entity.SmartsheetRow;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class SmartsheetService {
    private static final Logger log = LoggerFactory.getLogger(SmartsheetService.class);
    private static final int MAX_COLUMNS = 100;
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final SmartsheetDefinitionMapper definitionMapper;
    private final SmartsheetRowMapper rowMapper;
    private final SmartsheetChangeLogMapper changeLogMapper;

    public SmartsheetService(SmartsheetDefinitionMapper definitionMapper,
                             SmartsheetRowMapper rowMapper,
                             SmartsheetChangeLogMapper changeLogMapper) {
        this.definitionMapper = definitionMapper;
        this.rowMapper = rowMapper;
        this.changeLogMapper = changeLogMapper;
    }

    public List<SmartsheetDefinition> getPage(int page, int pageSize) {
        return definitionMapper.selectPage((page - 1) * pageSize, pageSize);
    }

    public int count() { return definitionMapper.count(); }

    public SmartsheetDefinition getById(Long id) {
        SmartsheetDefinition def = definitionMapper.selectById(id);
        if (def == null) throw new RuntimeException("表格不存在");
        return def;
    }

    public SmartsheetDefinition create(SmartsheetSheetRequest req, Long userId) {
        String columnsJson = toJson(req.getColumnsConfig());
        validateColumnsConfig(columnsJson);
        SmartsheetDefinition def = new SmartsheetDefinition();
        def.setName(req.getName());
        def.setDescription(req.getDescription() != null ? req.getDescription() : "");
        def.setLayoutMode(req.getLayoutMode() != null ? req.getLayoutMode() : "table");
        def.setColumnsConfig(columnsJson);
        def.setRowEntitySource(toJson(req.getRowEntitySource()));
        def.setTemplateId(req.getTemplateId() != null ? Long.parseLong(req.getTemplateId()) : null);
        def.setRowLimit(req.getRowLimit() != null ? req.getRowLimit() : 50000);
        def.setThemeConfig(toJson(req.getThemeConfig()));
        def.setIsTemplate(req.getIsTemplate() != null && req.getIsTemplate() ? 1 : 0);
        def.setCreatedBy(userId);
        def.setUpdatedBy(userId);
        definitionMapper.insert(def);
        log.info("[SmartSheet] sheet created id={} mode={}", def.getId(), def.getLayoutMode());
        return def;
    }

    public SmartsheetDefinition update(Long id, SmartsheetSheetRequest req, Long userId) {
        SmartsheetDefinition def = getById(id);
        if (req.getColumnsConfig() != null) {
            String columnsJson = toJson(req.getColumnsConfig());
            validateColumnsConfig(columnsJson);
            def.setColumnsConfig(columnsJson);
        }
        if (req.getName() != null) def.setName(req.getName());
        if (req.getDescription() != null) def.setDescription(req.getDescription());
        if (req.getLayoutMode() != null) def.setLayoutMode(req.getLayoutMode());
        if (req.getRowEntitySource() != null) def.setRowEntitySource(toJson(req.getRowEntitySource()));
        if (req.getRowLimit() != null) def.setRowLimit(req.getRowLimit());
        if (req.getThemeConfig() != null) def.setThemeConfig(toJson(req.getThemeConfig()));
        if (req.getIsTemplate() != null) def.setIsTemplate(req.getIsTemplate() ? 1 : 0);
        def.setUpdatedBy(userId);
        int updated = definitionMapper.update(def);
        if (updated == 0) throw new RuntimeException("更新失败");
        log.info("[SmartSheet] sheet updated id={}", id);
        return def;
    }

    @Transactional
    public void delete(Long id) {
        getById(id);
        changeLogMapper.deleteBySheetId(id);
        rowMapper.deleteBySheetId(id);
        definitionMapper.deleteById(id);
        log.info("[SmartSheet] sheet deleted id={}", id);
    }

    @Transactional
    public int bulkDelete(List<Long> ids) {
        for (Long id : ids) {
            changeLogMapper.deleteBySheetId(id);
            rowMapper.deleteBySheetId(id);
        }
        int count = definitionMapper.deleteByIds(ids);
        log.info("[SmartSheet] bulk deleted {} sheets", count);
        return count;
    }

    public void rename(Long id, String name) {
        getById(id);
        definitionMapper.rename(id, name);
        log.info("[SmartSheet] renamed id={} name={}", id, name);
    }

    @Transactional
    public SmartsheetDefinition duplicate(Long id, boolean withData, Long userId) {
        SmartsheetDefinition src = getById(id);
        SmartsheetDefinition dup = new SmartsheetDefinition();
        dup.setName(src.getName() + " (副本)");
        dup.setDescription(src.getDescription());
        dup.setLayoutMode(src.getLayoutMode());
        dup.setColumnsConfig(src.getColumnsConfig());
        dup.setRowEntitySource(src.getRowEntitySource());
        dup.setCreatedBy(userId);
        dup.setUpdatedBy(userId);
        definitionMapper.insert(dup);
        if (withData) {
            List<SmartsheetRow> rows = rowMapper.selectBySheetId(id);
            List<SmartsheetRow> newRows = new ArrayList<>();
            for (SmartsheetRow r : rows) {
                SmartsheetRow nr = new SmartsheetRow();
                nr.setSheetId(dup.getId());
                nr.setRowIndex(r.getRowIndex());
                nr.setRowLabel(r.getRowLabel());
                nr.setRowEntityId(r.getRowEntityId());
                nr.setCellData(r.getCellData());
                nr.setVersion(0);
                newRows.add(nr);
            }
            if (!newRows.isEmpty()) rowMapper.insertBatch(newRows);
        }
        log.info("[SmartSheet] duplicated id={} -> {} withData={}", id, dup.getId(), withData);
        return dup;
    }

    public void clearData(Long id) {
        getById(id);
        rowMapper.clearBySheetId(id);
        changeLogMapper.deleteBySheetId(id);
        log.info("[SmartSheet] cleared data sheet={}", id);
    }

    public void togglePin(Long id) {
        SmartsheetDefinition def = getById(id);
        int newPin = def.getIsPinned() != null && def.getIsPinned() == 1 ? 0 : 1;
        definitionMapper.updatePin(id, newPin);
        log.info("[SmartSheet] pin id={} pinned={}", id, newPin);
    }

    public List<SmartsheetDefinition> getTemplates() {
        return definitionMapper.selectTemplates();
    }

    public void setTemplateFlag(Long id, boolean isTemplate) {
        getById(id);
        definitionMapper.updateTemplateFlag(id, isTemplate ? 1 : 0);
    }

    public void unsetTemplateFlag(Long id) {
        getById(id);
        definitionMapper.updateTemplateFlag(id, 0);
    }

    @Transactional
    public SmartsheetDefinition createFromTemplate(Long templateId, String name, Long userId) {
        SmartsheetDefinition template = getById(templateId);
        SmartsheetDefinition def = new SmartsheetDefinition();
        def.setName(name);
        def.setDescription(template.getDescription());
        def.setLayoutMode(template.getLayoutMode());
        def.setColumnsConfig(template.getColumnsConfig());
        def.setRowEntitySource(template.getRowEntitySource());
        def.setRowLimit(template.getRowLimit());
        def.setThemeConfig(template.getThemeConfig());
        def.setCreatedBy(userId);
        def.setUpdatedBy(userId);
        definitionMapper.insert(def);
        log.info("[SmartSheet] created from template id={} -> {}", templateId, def.getId());
        return def;
    }

    @SuppressWarnings("unchecked")
    private void validateColumnsConfig(String columnsConfig) {
        try {
            List<Map<String, Object>> columns = objectMapper.readValue(columnsConfig, List.class);
            if (columns.size() > MAX_COLUMNS) {
                throw new RuntimeException("超过最大列数限制(100)");
            }
            for (Map<String, Object> col : columns) {
                String type = (String) col.getOrDefault("type", "text");
                if (!List.of("select","multi-select","date","checkbox","number","text","user").contains(type)) {
                    throw new RuntimeException("不支持的列类型: " + type);
                }
            }
        } catch (RuntimeException e) { throw e; }
        catch (Exception e) { throw new RuntimeException("列定义 JSON 格式不合法"); }
    }

    private String toJson(Object obj) {
        if (obj == null) return null;
        if (obj instanceof String s) return s;
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("JSON 序列化失败", e);
        }
    }
}
