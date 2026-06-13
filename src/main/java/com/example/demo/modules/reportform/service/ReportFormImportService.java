package com.example.demo.modules.reportform.service;

import com.example.demo.modules.reportform.dto.ReportFormImportResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.*;

@Service
public class ReportFormImportService {

    private static final Logger log = LoggerFactory.getLogger(ReportFormImportService.class);

    private final ObjectMapper objectMapper = new ObjectMapper();

    public ReportFormImportResult importFromExcel(MultipartFile file, String name) throws Exception {
        log.info("[report-form] 导入 Excel: {} ({} bytes)", file.getOriginalFilename(), file.getSize());
        try (Workbook workbook = new XSSFWorkbook(file.getInputStream())) {
            Sheet sheet = workbook.getSheetAt(0);
            log.info("[report-form] Sheet={} rows={} mergedRegions={}",
                    sheet.getSheetName(), sheet.getLastRowNum() + 1, sheet.getNumMergedRegions());
            if (sheet.getLastRowNum() < 0) {
                throw new IllegalArgumentException("Excel 无有效数据");
            }

            // Collect all merged regions, keyed by top-left anchor
            Map<String, CellRangeAddress> mergeMap = new HashMap<>();
            for (int i = 0; i < sheet.getNumMergedRegions(); i++) {
                CellRangeAddress region = sheet.getMergedRegion(i);
                mergeMap.put(region.getFirstRow() + "," + region.getFirstColumn(), region);
            }

            ArrayNode cells = objectMapper.createArrayNode();
            ObjectNode fields = objectMapper.createObjectNode();
            int cellId = 0;

            for (int r = 0; r <= sheet.getLastRowNum(); r++) {
                Row row = sheet.getRow(r);
                if (row == null) continue;
                int maxCol = Math.max(row.getLastCellNum(), 0);

                for (int c = 0; c < maxCol; c++) {
                    String key = r + "," + c;

                    // Skip cells that are part of a merged region but not the top-left anchor
                    boolean isMergedChild = false;
                    for (Map.Entry<String, CellRangeAddress> entry : mergeMap.entrySet()) {
                        if (entry.getKey().equals(key)) continue;
                        CellRangeAddress region = entry.getValue();
                        if (r >= region.getFirstRow() && r <= region.getLastRow()
                                && c >= region.getFirstColumn() && c <= region.getLastColumn()) {
                            isMergedChild = true;
                            break;
                        }
                    }
                    if (isMergedChild) continue;

                    Cell cell = row.getCell(c);
                    String text = getCellText(cell);
                    String fieldKey = "f_" + cellId;

                    ObjectNode cellNode = objectMapper.createObjectNode();
                    cellNode.put("id", "c" + cellId);
                    cellNode.put("row", r);
                    cellNode.put("col", c);

                    CellRangeAddress merge = mergeMap.get(key);
                    if (merge != null) {
                        cellNode.put("colSpan", merge.getLastColumn() - merge.getFirstColumn() + 1);
                        cellNode.put("rowSpan", merge.getLastRow() - merge.getFirstRow() + 1);
                    } else {
                        cellNode.put("colSpan", 1);
                        cellNode.put("rowSpan", 1);
                    }

                    cellNode.put("kind", "static");
                    cellNode.put("staticText", text);
                    cellNode.put("fieldKey", fieldKey);

                    ObjectNode styleNode = objectMapper.createObjectNode();
                    styleNode.put("align", "center");
                    if (cell != null) {
                        CellStyle cs = cell.getCellStyle();
                        Font font = workbook.getFontAt(cs.getFontIndex());
                        if (font.getBold()) styleNode.put("bold", true);
                        if (font.getFontHeightInPoints() > 0) {
                            styleNode.put("fontSize", font.getFontHeightInPoints());
                        }
                    }
                    cellNode.set("style", styleNode);

                    cells.add(cellNode);

                    ObjectNode fieldNode = objectMapper.createObjectNode();
                    fieldNode.put("type", "TEXT");
                    fieldNode.put("label", text.isEmpty() ? "字段" + cellId : text);
                    fieldNode.put("editableInFill", true);
                    fieldNode.putArray("editableByRoles");
                    fields.set(fieldKey, fieldNode);

                    cellId++;
                }
            }

            ObjectNode layout = objectMapper.createObjectNode();
            layout.set("cells", cells);
            layout.set("fields", fields);
            layout.putArray("mergeGroups");

            ReportFormImportResult result = new ReportFormImportResult();
            String layoutStr = layout.toString();
            result.setLayoutJson(layoutStr);
            result.setCellCount(cellId);
            result.setName(name);

            log.info("[report-form] 导入完成: cells={} fields={} layoutJson长度={}", cellId, fields.size(), layoutStr.length());
            return result;
        }
    }

    private String getCellText(Cell cell) {
        if (cell == null) return "";
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue();
            case NUMERIC -> {
                if (DateUtil.isCellDateFormatted(cell)) {
                    yield cell.getLocalDateTimeCellValue().toLocalDate().toString();
                }
                double v = cell.getNumericCellValue();
                yield v == Math.floor(v) && !Double.isInfinite(v)
                        ? String.valueOf((long) v) : String.valueOf(v);
            }
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            case FORMULA -> {
                try {
                    yield cell.getStringCellValue();
                } catch (Exception e) {
                    yield String.valueOf(cell.getNumericCellValue());
                }
            }
            default -> "";
        };
    }
}
