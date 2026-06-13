package com.example.demo.modules.smartsheet.service;

import com.example.demo.modules.smartsheet.entity.SmartsheetDefinition;
import com.example.demo.modules.smartsheet.entity.SmartsheetRow;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.PrintWriter;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class SmartsheetExportService {
    private static final Logger log = LoggerFactory.getLogger(SmartsheetExportService.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    public SmartsheetExportService() {}

    @SuppressWarnings("unchecked")
    public void exportCsv(SmartsheetDefinition sheet, List<SmartsheetRow> rows,
                          HttpServletResponse response) throws IOException {
        String filename = URLEncoder.encode(sheet.getName(), StandardCharsets.UTF_8) + ".csv";
        response.setContentType("text/csv;charset=UTF-8");
        response.setHeader("Content-Disposition", "attachment; filename=\"" + filename + "\"");

        // Write UTF-8 BOM for Excel compatibility
        response.getOutputStream().write(0xEF);
        response.getOutputStream().write(0xBB);
        response.getOutputStream().write(0xBF);

        PrintWriter writer = response.getWriter();

        // Parse columns config
        List<Map<String, Object>> columns = parseColumnsConfig(sheet.getColumnsConfig());

        // Collect column keys and labels
        List<String> colKeys = new ArrayList<>();
        for (Map<String, Object> col : columns) {
            String key = (String) col.get("key");
            String label = (String) col.getOrDefault("label", key);
            if (key != null) {
                colKeys.add(key);
                writer.write(escapeCsv(label));
                if (colKeys.size() < columns.size()) {
                    writer.write(",");
                }
            }
        }
        writer.write("\n");

        // Write data rows
        for (SmartsheetRow r : rows) {
            try {
                Map<String, Object> cellData = objectMapper.readValue(r.getCellData(), Map.class);
                for (int i = 0; i < colKeys.size(); i++) {
                    if (i > 0) writer.write(",");
                    String key = colKeys.get(i);
                    Object val = cellData != null ? cellData.get(key) : null;
                    String strVal;
                    if (val instanceof Map) {
                        Object v = ((Map<?, ?>) val).get("v");
                        strVal = v != null ? v.toString() : "";
                    } else {
                        strVal = val != null ? val.toString() : "";
                    }
                    writer.write(escapeCsv(strVal));
                }
                writer.write("\n");
            } catch (Exception e) {
                log.debug("Skipping row {} during export: {}", r.getId(), e.getMessage());
            }
        }
        writer.flush();
    }

    @SuppressWarnings("unchecked")
    public void exportXlsx(SmartsheetDefinition sheet, List<SmartsheetRow> rows,
                           HttpServletResponse response) throws IOException {
        String filename = URLEncoder.encode(sheet.getName(), StandardCharsets.UTF_8) + ".xlsx";
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"" + filename + "\"");

        // Parse columns config
        List<Map<String, Object>> columns = parseColumnsConfig(sheet.getColumnsConfig());
        List<String> colKeys = new ArrayList<>();
        List<String> colLabels = new ArrayList<>();
        for (Map<String, Object> col : columns) {
            String key = (String) col.get("key");
            if (key != null) {
                colKeys.add(key);
                colLabels.add((String) col.getOrDefault("label", key));
            }
        }

        Workbook workbook = new XSSFWorkbook();
        Sheet xlsxSheet = workbook.createSheet(sheet.getName());

        // Create header style
        CellStyle headerStyle = workbook.createCellStyle();
        Font headerFont = workbook.createFont();
        headerFont.setBold(true);
        headerStyle.setFont(headerFont);
        headerStyle.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
        headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        headerStyle.setBorderBottom(BorderStyle.THIN);

        // Create header row
        Row headerRow = xlsxSheet.createRow(0);
        for (int i = 0; i < colLabels.size(); i++) {
            Cell cell = headerRow.createCell(i);
            cell.setCellValue(colLabels.get(i));
            cell.setCellStyle(headerStyle);
        }

        // Fill data rows
        int rowNum = 1;
        for (SmartsheetRow r : rows) {
            Row dataRow = xlsxSheet.createRow(rowNum++);
            try {
                Map<String, Object> cellData = objectMapper.readValue(r.getCellData(), Map.class);
                for (int i = 0; i < colKeys.size(); i++) {
                    String key = colKeys.get(i);
                    Object val = cellData != null ? cellData.get(key) : null;
                    String strVal;
                    if (val instanceof Map) {
                        Object v = ((Map<?, ?>) val).get("v");
                        strVal = v != null ? v.toString() : "";
                    } else {
                        strVal = val != null ? val.toString() : "";
                    }
                    dataRow.createCell(i).setCellValue(strVal);
                }
            } catch (Exception e) {
                log.debug("Skipping row {} during XLSX export: {}", r.getId(), e.getMessage());
            }
        }

        // Auto-size columns
        for (int i = 0; i < colKeys.size(); i++) {
            xlsxSheet.autoSizeColumn(i);
            // Cap column width to reasonable max
            if (xlsxSheet.getColumnWidth(i) > 50 * 256) {
                xlsxSheet.setColumnWidth(i, 50 * 256);
            }
        }

        workbook.write(response.getOutputStream());
        workbook.close();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parseColumnsConfig(String columnsConfigJson) {
        List<Map<String, Object>> columns = new ArrayList<>();
        if (columnsConfigJson == null || columnsConfigJson.isEmpty()) return columns;
        try {
            List<Map<String, Object>> parsed = objectMapper.readValue(columnsConfigJson, List.class);
            if (parsed != null) columns = parsed;
        } catch (Exception e) {
            log.warn("Failed to parse columns config for export: {}", e.getMessage());
        }
        return columns;
    }

    private String escapeCsv(String value) {
        if (value == null) return "";
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }
}
