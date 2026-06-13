package com.example.demo.modules.smartsheet.service;

import com.example.demo.modules.smartsheet.entity.SmartsheetChangeLog;
import com.example.demo.modules.smartsheet.entity.SmartsheetRow;
import com.example.demo.modules.smartsheet.mapper.SmartsheetChangeLogMapper;
import com.example.demo.modules.smartsheet.mapper.SmartsheetRowMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class SmartsheetRowService {
    private static final Logger log = LoggerFactory.getLogger(SmartsheetRowService.class);
    private static final int MAX_ROWS = 50000;
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final SmartsheetRowMapper rowMapper;
    private final SmartsheetChangeLogMapper changeLogMapper;

    public SmartsheetRowService(SmartsheetRowMapper rowMapper,
                                SmartsheetChangeLogMapper changeLogMapper) {
        this.rowMapper = rowMapper;
        this.changeLogMapper = changeLogMapper;
    }

    public List<SmartsheetRow> getRowsBySheetId(Long sheetId) {
        return rowMapper.selectBySheetId(sheetId);
    }

    public SmartsheetRow getById(Long id) {
        SmartsheetRow row = rowMapper.selectById(id);
        if (row == null) throw new RuntimeException("数据行不存在");
        return row;
    }

    public SmartsheetRow addRow(Long sheetId, String rowLabel, String rowEntityId) {
        int count = rowMapper.countBySheetId(sheetId);
        if (count >= MAX_ROWS) throw new RuntimeException("超过最大行数限制(" + MAX_ROWS + ")");
        int nextIndex = rowMapper.maxRowIndex(sheetId) + 1;
        SmartsheetRow row = new SmartsheetRow();
        row.setSheetId(sheetId);
        row.setRowIndex(nextIndex);
        row.setRowLabel(rowLabel != null ? rowLabel : "");
        row.setRowEntityId(rowEntityId);
        row.setCellData("{}");
        row.setVersion(0);
        rowMapper.insert(row);
        return row;
    }

    @Transactional
    public SmartsheetRow updateRow(Long id, Object cellData, String rowLabel, Integer version, Long userId, Long sheetId) {
        SmartsheetRow existing = getById(id);
        // Optimistic lock check
        if (version != null && !version.equals(existing.getVersion())) {
            log.warn("[SmartSheet] version conflict sheet={} row={} client={} server={}",
                sheetId, id, version, existing.getVersion());
            throw new RuntimeException("数据已被他人修改，请刷新");
        }
        // Log changes
        String oldData = existing.getCellData();
        String cellDataJson = toJson(cellData);
        existing.setCellData(cellDataJson != null ? cellDataJson : oldData);
        if (rowLabel != null) existing.setRowLabel(rowLabel);
        int updated = rowMapper.update(existing);
        if (updated == 0) throw new RuntimeException("数据已被他人修改，请刷新");
        // Insert change log for each changed cell
        if (cellDataJson != null && userId != null) {
            logCellChanges(sheetId, id, oldData, cellDataJson, userId);
        }
        return getById(id);
    }

    /**
     * Update a single cell value with optimistic locking.
     */
    @Transactional
    public SmartsheetRow updateCell(Long rowId, String columnKey, Object value,
                                     Integer expectedVersion, Long userId, Long sheetId) {
        SmartsheetRow existing = getById(rowId);
        if (expectedVersion != null && !expectedVersion.equals(existing.getVersion())) {
            throw new RuntimeException("数据已被他人修改，请刷新");
        }

        Map<String, Object> cellData;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = objectMapper.readValue(existing.getCellData(), Map.class);
            cellData = parsed;
        } catch (Exception e) {
            cellData = new LinkedHashMap<>();
        }

        Object oldValue = cellData.get(columnKey);
        cellData.put(columnKey, value);
        String newCellDataJson;
        try {
            newCellDataJson = objectMapper.writeValueAsString(cellData);
        } catch (Exception e) {
            throw new RuntimeException("JSON 序列化失败", e);
        }

        int updated = rowMapper.updateCellData(rowId, newCellDataJson, existing.getVersion());
        if (updated == 0) throw new RuntimeException("数据已被他人修改，请刷新");

        if (userId != null) {
            SmartsheetChangeLog log = new SmartsheetChangeLog();
            log.setSheetId(sheetId);
            log.setRowId(rowId);
            log.setColumnKey(columnKey);
            log.setOldValue(oldValue != null ? oldValue.toString() : null);
            log.setNewValue(value != null ? value.toString() : null);
            log.setRowIndex(existing.getRowIndex());
            log.setChangedBy(userId);
            changeLogMapper.insertCellLog(log);
        }

        return rowMapper.selectById(rowId);
    }

    public void deleteRow(Long id) {
        getById(id);
        rowMapper.deleteById(id);
    }

    @Transactional
    public int batchInsert(Long sheetId, List<SmartsheetRow> rows) {
        int existing = rowMapper.countBySheetId(sheetId);
        if (existing + rows.size() > MAX_ROWS) throw new RuntimeException("超过最大行数限制(" + MAX_ROWS + ")");
        int nextIdx = rowMapper.maxRowIndex(sheetId) + 1;
        for (SmartsheetRow r : rows) {
            r.setSheetId(sheetId);
            r.setRowIndex(nextIdx++);
            r.setVersion(0);
            if (r.getCellData() == null) r.setCellData("{}");
        }
        rowMapper.insertBatch(rows);
        log.info("[SmartSheet] import done sheet={} rows={}", sheetId, rows.size());
        return rows.size();
    }

    private void logCellChanges(Long sheetId, Long rowId, String oldJson, String newJson, Long userId) {
        SmartsheetChangeLog logEntry = new SmartsheetChangeLog();
        logEntry.setSheetId(sheetId);
        logEntry.setRowId(rowId);
        logEntry.setColumnKey("*");
        logEntry.setOldValue(oldJson);
        logEntry.setNewValue(newJson);
        logEntry.setChangedBy(userId);
        changeLogMapper.insert(logEntry);
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
