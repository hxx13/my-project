package com.example.demo.modules.smartsheet.service;

import com.example.demo.modules.smartsheet.dto.SmartsheetImportResult;
import com.example.demo.modules.smartsheet.entity.SmartsheetRow;
import com.example.demo.modules.smartsheet.mapper.SmartsheetRowMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Service
public class SmartsheetImportService {
    private static final Logger log = LoggerFactory.getLogger(SmartsheetImportService.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final int BATCH_SIZE = 100;
    private static final int MAX_ROWS = 50000;

    private final SmartsheetRowMapper rowMapper;

    public SmartsheetImportService(SmartsheetRowMapper rowMapper) {
        this.rowMapper = rowMapper;
    }

    public SmartsheetImportResult importFile(Long sheetId, MultipartFile file, List<String> columnKeys) {
        String filename = file.getOriginalFilename();
        if (filename == null) filename = "unknown";

        SmartsheetImportResult result = new SmartsheetImportResult();
        result.setErrors(new ArrayList<>());
        result.setPreview(new ArrayList<>());

        try {
            List<String[]> rows;
            if (filename.toLowerCase().endsWith(".csv")) {
                rows = parseCsv(file);
            } else {
                rows = parseExcel(file);
            }

            if (rows.isEmpty()) {
                result.setTotalRows(0);
                result.setImportedRows(0);
                result.setSkippedRows(0);
                result.getErrors().add("文件中未找到数据行");
                return result;
            }

            String[] headers = rows.get(0);
            List<String[]> dataRows = rows.subList(1, rows.size());

            // Build column index mapping: header position -> columnKey
            Map<Integer, String> columnMapping = buildColumnMapping(headers, columnKeys);

            int existingCount = rowMapper.countBySheetId(sheetId);
            int remainingSlots = MAX_ROWS - existingCount;

            List<SmartsheetRow> batch = new ArrayList<>();
            int imported = 0;
            int skipped = 0;
            int nextRowIndex = rowMapper.maxRowIndex(sheetId) + 1;

            for (int i = 0; i < dataRows.size(); i++) {
                String[] rawRow = dataRows.get(i);
                int lineNumber = i + 2; // 1-indexed, header was line 1

                // Skip fully empty rows
                if (isRowEmpty(rawRow)) {
                    skipped++;
                    continue;
                }

                if (imported >= remainingSlots) {
                    result.getErrors().add("行" + lineNumber + ": 已超过最大行数限制，跳过剩余行");
                    skipped += (dataRows.size() - i);
                    break;
                }

                try {
                    Map<String, Object> cellData = new LinkedHashMap<>();
                    for (Map.Entry<Integer, String> entry : columnMapping.entrySet()) {
                        int colIdx = entry.getKey();
                        String colKey = entry.getValue();
                        String cellValue = colIdx < rawRow.length ? rawRow[colIdx] : "";
                        cellData.put(colKey, parseCellValue(cellValue));
                    }

                    SmartsheetRow row = new SmartsheetRow();
                    row.setSheetId(sheetId);
                    row.setRowIndex(nextRowIndex++);
                    row.setRowLabel("");
                    row.setCellData(objectMapper.writeValueAsString(cellData));
                    row.setVersion(0);
                    batch.add(row);

                    // Store preview for first 10 rows
                    if (result.getPreview().size() < 10) {
                        Map<String, Object> previewRow = new LinkedHashMap<>();
                        previewRow.put("_line", lineNumber);
                        previewRow.putAll(cellData);
                        result.getPreview().add(previewRow);
                    }

                    imported++;

                    // Batch insert
                    if (batch.size() >= BATCH_SIZE) {
                        rowMapper.insertBatch(batch);
                        batch.clear();
                    }
                } catch (Exception e) {
                    result.getErrors().add("行" + lineNumber + ": " + e.getMessage());
                    skipped++;
                }
            }

            // Insert remaining batch
            if (!batch.isEmpty()) {
                rowMapper.insertBatch(batch);
            }

            result.setTotalRows(dataRows.size());
            result.setImportedRows(imported);
            result.setSkippedRows(skipped);

            log.info("[SmartSheet] import file sheet={} total={} imported={} skipped={}",
                    sheetId, dataRows.size(), imported, skipped);

        } catch (Exception e) {
            log.error("[SmartSheet] import failed sheet={}", sheetId, e);
            result.getErrors().add("导入失败: " + e.getMessage());
        }

        return result;
    }

    private List<String[]> parseCsv(MultipartFile file) throws Exception {
        List<String[]> lines = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            // Skip BOM if present
            reader.mark(1);
            int firstChar = reader.read();
            if (firstChar != 0xFEFF) {
                reader.reset();
            }

            String line;
            while ((line = reader.readLine()) != null) {
                if (line.trim().isEmpty()) continue;
                lines.add(parseCsvLine(line));
            }
        }
        return lines;
    }

    private String[] parseCsvLine(String line) {
        List<String> fields = new ArrayList<>();
        StringBuilder sb = new StringBuilder();
        boolean inQuotes = false;

        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (inQuotes) {
                if (c == '"') {
                    if (i + 1 < line.length() && line.charAt(i + 1) == '"') {
                        sb.append('"');
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    sb.append(c);
                }
            } else {
                if (c == '"') {
                    inQuotes = true;
                } else if (c == ',') {
                    fields.add(sb.toString().trim());
                    sb.setLength(0);
                } else {
                    sb.append(c);
                }
            }
        }
        fields.add(sb.toString().trim());
        return fields.toArray(new String[0]);
    }

    private List<String[]> parseExcel(MultipartFile file) throws Exception {
        List<String[]> rows = new ArrayList<>();
        Workbook workbook;
        String filename = file.getOriginalFilename();
        if (filename != null && filename.toLowerCase().endsWith(".xls")) {
            workbook = new HSSFWorkbook(file.getInputStream());
        } else {
            workbook = new XSSFWorkbook(file.getInputStream());
        }

        Sheet sheet = workbook.getSheetAt(0);
        DataFormatter formatter = new DataFormatter();

        for (int i = 0; i <= sheet.getLastRowNum(); i++) {
            Row excelRow = sheet.getRow(i);
            if (excelRow == null) continue;

            List<String> values = new ArrayList<>();
            boolean hasValue = false;

            for (int j = 0; j < excelRow.getLastCellNum(); j++) {
                Cell cell = excelRow.getCell(j);
                String cellValue;
                if (cell == null) {
                    cellValue = "";
                } else {
                    switch (cell.getCellType()) {
                        case STRING:
                            cellValue = cell.getStringCellValue();
                            break;
                        case NUMERIC:
                            if (DateUtil.isCellDateFormatted(cell)) {
                                cellValue = cell.getLocalDateTimeCellValue().toString();
                            } else {
                                // Avoid scientific notation for integers
                                double dv = cell.getNumericCellValue();
                                if (dv == Math.floor(dv) && !Double.isInfinite(dv)) {
                                    cellValue = String.valueOf((long) dv);
                                } else {
                                    cellValue = formatter.formatCellValue(cell);
                                }
                            }
                            break;
                        case BOOLEAN:
                            cellValue = String.valueOf(cell.getBooleanCellValue());
                            break;
                        case FORMULA:
                            try {
                                cellValue = cell.getStringCellValue();
                            } catch (Exception e) {
                                try {
                                    double fv = cell.getNumericCellValue();
                                    if (fv == Math.floor(fv) && !Double.isInfinite(fv)) {
                                        cellValue = String.valueOf((long) fv);
                                    } else {
                                        cellValue = String.valueOf(fv);
                                    }
                                } catch (Exception e2) {
                                    cellValue = formatter.formatCellValue(cell);
                                }
                            }
                            break;
                        default:
                            cellValue = formatter.formatCellValue(cell);
                            break;
                    }
                }
                values.add(cellValue != null ? cellValue.trim() : "");
                if (!cellValue.isEmpty()) hasValue = true;
            }
            if (hasValue) {
                rows.add(values.toArray(new String[0]));
            }
        }
        workbook.close();
        return rows;
    }

    private Map<Integer, String> buildColumnMapping(String[] headers, List<String> columnKeys) {
        Map<Integer, String> mapping = new LinkedHashMap<>();
        for (int i = 0; i < headers.length; i++) {
            String header = headers[i];
            if (header.isEmpty()) continue;
            // Try exact match first, then case-insensitive
            String matchedKey = null;
            for (String key : columnKeys) {
                if (key.equals(header)) {
                    matchedKey = key;
                    break;
                }
            }
            if (matchedKey == null) {
                for (String key : columnKeys) {
                    if (key.equalsIgnoreCase(header)) {
                        matchedKey = key;
                        break;
                    }
                }
            }
            if (matchedKey != null) {
                mapping.put(i, matchedKey);
            }
            // If no match found, skip this column — data in this column won't be imported
        }
        return mapping;
    }

    private Object parseCellValue(String value) {
        if (value == null || value.isEmpty()) return "";
        // Return as string — frontend/vtable handles type coercion
        return value;
    }

    private boolean isRowEmpty(String[] row) {
        for (String s : row) {
            if (s != null && !s.isEmpty()) return false;
        }
        return true;
    }
}
