package com.example.demo.modules.smartsheet.service;

import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.modules.smartsheet.entity.SmartsheetDefinition;
import com.example.demo.modules.smartsheet.mapper.SmartsheetDefinitionMapper;
import com.example.demo.modules.smartsheet.mapper.SmartsheetChangeLogMapper;
import com.example.demo.modules.smartsheet.mapper.SmartsheetRowMapper;
import com.example.demo.modules.smartsheet.dto.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

@Service
public class SmartsheetService {
    private static final Logger log = LoggerFactory.getLogger(SmartsheetService.class);
    private static final int MAX_COLUMNS = 100;
    private static final int MAX_ROWS = 500;
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

    public SmartsheetDefinition create(SmartsheetCreateRequest req, Long userId) {
        validateColumnsConfig(req.getColumnsConfig());
        SmartsheetDefinition def = new SmartsheetDefinition();
        def.setName(req.getName());
        def.setDescription(req.getDescription() != null ? req.getDescription() : "");
        def.setLayoutMode(req.getLayoutMode() != null ? req.getLayoutMode() : "table");
        def.setColumnsConfig(req.getColumnsConfig());
        def.setRowEntitySource(req.getRowEntitySource());
        def.setTemplateId(req.getTemplateId());
        def.setCreatedBy(userId);
        def.setUpdatedBy(userId);
        definitionMapper.insert(def);
        log.info("[SmartSheet] sheet created id={} mode={}", def.getId(), def.getLayoutMode());
        return def;
    }

    public SmartsheetDefinition update(Long id, SmartsheetUpdateRequest req, Long userId) {
        SmartsheetDefinition def = getById(id);
        if (req.getColumnsConfig() != null) {
            validateColumnsConfig(req.getColumnsConfig());
        }
        if (req.getName() != null) def.setName(req.getName());
        if (req.getDescription() != null) def.setDescription(req.getDescription());
        if (req.getLayoutMode() != null) def.setLayoutMode(req.getLayoutMode());
        if (req.getColumnsConfig() != null) def.setColumnsConfig(req.getColumnsConfig());
        if (req.getRowEntitySource() != null) def.setRowEntitySource(req.getRowEntitySource());
        def.setUpdatedBy(userId);
        int updated = definitionMapper.update(def);
        if (updated == 0) throw new RuntimeException("更新失败");
        log.info("[SmartSheet] columns updated sheet={}", id);
        return def;
    }

    @Transactional
    public void delete(Long id) {
        getById(id); // ensure exists
        changeLogMapper.deleteBySheetId(id);
        rowMapper.deleteBySheetId(id);
        definitionMapper.deleteById(id);
        log.info("[SmartSheet] sheet deleted id={}", id);
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
}
