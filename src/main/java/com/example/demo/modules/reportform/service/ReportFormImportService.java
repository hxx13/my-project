package com.example.demo.modules.reportform.service;

import com.example.demo.modules.reportform.dto.ReportFormImportResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.*;
import org.apache.poi.xwpf.usermodel.*;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTcPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STMerge;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigInteger;
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
                        String bg = extractBgColor(cs, workbook);
                        if (bg != null) styleNode.put("bg", bg);
                        String fc = extractFontColor(font, workbook);
                        if (fc != null) styleNode.put("color", fc);
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

            String layoutStr = layout.toString();
            int maxCol = 0;
            for (int i = 0; i < cells.size(); i++) {
                var cn = cells.get(i);
                maxCol = Math.max(maxCol, cn.path("col").asInt() + cn.path("colSpan").asInt(1));
            }
            Map<Integer, Integer> columnWidths = new TreeMap<>();
            computeColumnWidthsFromCells(cells, columnWidths, maxCol);
            extractExcelSheetColumnWidths(sheet, columnWidths);

            ReportFormImportResult result = new ReportFormImportResult();
            result.setSource("excel");
            result.setLayoutJson(layoutStr);
            result.setThemeJson(buildThemeWithColumnWidths(columnWidths));
            result.setCellCount(cellId);
            result.setName(name);

            log.info("[report-form] 导入完成: cells={} fields={} layoutJson长度={}", cellId, fields.size(), layoutStr.length());
            return result;
        }
    }

    private void extractExcelSheetColumnWidths(Sheet sheet, Map<Integer, Integer> widths) {
        if (sheet.getRow(0) == null) return;
        int maxCol = sheet.getRow(0).getLastCellNum();
        for (int c = 0; c < maxCol; c++) {
            int px = (int) Math.max(28, sheet.getColumnWidth(c) / 256.0 * 7);
            widths.merge(c, px, Math::max);
        }
    }

    private String extractBgColor(CellStyle cs, Workbook wb) {
        if (!(wb instanceof XSSFWorkbook)) return null;
        try {
            XSSFColor xc = ((XSSFCellStyle) cs).getFillForegroundColorColor();
            if (xc == null) return null;
            byte[] rgb = xc.getRGB();
            if (rgb != null && rgb.length >= 3) return String.format("#%02X%02X%02X", rgb[0] & 0xFF, rgb[1] & 0xFF, rgb[2] & 0xFF);
            String argb = xc.getARGBHex();
            if (argb != null && argb.length() >= 6) return "#" + argb.substring(argb.length() - 6);
        } catch (Exception ignored) {}
        return null;
    }

    private String extractFontColor(Font font, Workbook wb) {
        if (!(wb instanceof XSSFWorkbook) || !(font instanceof XSSFFont xf)) return null;
        try {
            XSSFColor xc = xf.getXSSFColor();
            if (xc == null) return null;
            byte[] rgb = xc.getRGB();
            if (rgb != null && rgb.length >= 3) return String.format("#%02X%02X%02X", rgb[0] & 0xFF, rgb[1] & 0xFF, rgb[2] & 0xFF);
            String argb = xc.getARGBHex();
            if (argb != null && argb.length() >= 6) return "#" + argb.substring(argb.length() - 6);
        } catch (Exception ignored) {}
        return null;
    }

    public ReportFormImportResult importFromWord(MultipartFile file, String name) throws Exception {
        log.info("[report-form] 导入 Word: {} ({} bytes)", file.getOriginalFilename(), file.getSize());
        try (XWPFDocument doc = new XWPFDocument(file.getInputStream())) {
            int docMaxCols = 1;
            for (IBodyElement element : doc.getBodyElements()) {
                if (element instanceof XWPFTable table) {
                    docMaxCols = Math.max(docMaxCols, getTableLogicalCols(table));
                }
            }

            ArrayNode cells = objectMapper.createArrayNode();
            Map<Integer, Integer> columnWidths = new TreeMap<>();
            int currentRow = 0;

            for (IBodyElement element : doc.getBodyElements()) {
                if (element instanceof XWPFParagraph para) {
                    String text = normalizeText(para.getText());
                    if (text.isEmpty()) continue;
                    ObjectNode cellNode = buildStaticCell(
                            "c" + cells.size(), currentRow, 0, docMaxCols, 1, text, mapParagraphStyle(para));
                    cells.add(cellNode);
                    currentRow++;
                } else if (element instanceof XWPFTable table) {
                    currentRow += importWordTable(table, currentRow, cells, columnWidths);
                }
            }

            if (cells.isEmpty()) {
                throw new IllegalArgumentException("Word 文档无有效内容（段落或表格）");
            }

            int maxCol = 0;
            for (int i = 0; i < cells.size(); i++) {
                var cn = (ObjectNode) cells.get(i);
                maxCol = Math.max(maxCol, cn.path("col").asInt() + cn.path("colSpan").asInt(1));
            }
            computeColumnWidthsFromCells(cells, columnWidths, maxCol);

            ObjectNode layout = objectMapper.createObjectNode();
            layout.set("cells", cells);
            layout.set("fields", objectMapper.createObjectNode());
            layout.putArray("mergeGroups");

            ReportFormImportResult result = new ReportFormImportResult();
            result.setSource("word");
            result.setLayoutJson(layout.toString());
            result.setThemeJson(buildThemeWithColumnWidths(columnWidths));
            result.setCellCount(cells.size());
            result.setName(name);
            log.info("[report-form] Word 导入完成: cells={} maxCol={} columnWidths={}",
                    cells.size(), maxCol, columnWidths.size());
            return result;
        }
    }

    /** 按文档顺序导入 Word 表格，识别 gridSpan / vMerge / hMerge */
    private int importWordTable(XWPFTable table, int startRow, ArrayNode cells,
                                  Map<Integer, Integer> columnWidths) {
        int numRows = table.getNumberOfRows();
        if (numRows == 0) return 0;

        int maxCols = getTableLogicalCols(table);
        extractTableGridWidths(table, 0, columnWidths);

        boolean[][] covered = new boolean[numRows][maxCols];

        for (int r = 0; r < numRows; r++) {
            XWPFTableRow row = table.getRow(r);
            if (row == null) continue;

            int logicalCol = 0;
            for (int pc = 0; pc < row.getTableCells().size(); pc++) {
                XWPFTableCell cell = row.getCell(pc);
                if (cell == null) continue;

                if (isHMergeContinue(cell)) continue;

                while (logicalCol < maxCols && covered[r][logicalCol]) {
                    logicalCol++;
                }
                if (logicalCol >= maxCols) break;

                if (isVMergeContinue(cell)) {
                    logicalCol += getGridSpan(cell);
                    continue;
                }

                int colSpan = getGridSpan(cell);
                int rowSpan = 1;
                CTTcPr pr = cell.getCTTc().getTcPr();
                if (pr != null && pr.isSetVMerge() && pr.getVMerge().isSetVal()
                        && pr.getVMerge().getVal() == STMerge.RESTART) {
                    rowSpan = countVerticalSpan(table, r, pc);
                }

                String text = normalizeCellText(cell);
                ObjectNode style = extractWordCellStyle(cell);
                cells.add(buildStaticCell(
                        "c" + cells.size(), startRow + r, logicalCol, colSpan, rowSpan, text, style));

                for (int dr = 0; dr < rowSpan; dr++) {
                    for (int dc = 0; dc < colSpan; dc++) {
                        int rr = r + dr;
                        int cc = logicalCol + dc;
                        if (rr < numRows && cc < maxCols) {
                            covered[rr][cc] = true;
                        }
                    }
                }
                logicalCol += colSpan;
            }
        }
        return numRows;
    }

    private ObjectNode buildStaticCell(String id, int row, int col, int colSpan, int rowSpan,
                                       String text, ObjectNode style) {
        ObjectNode cellNode = objectMapper.createObjectNode();
        cellNode.put("id", id);
        cellNode.put("row", row);
        cellNode.put("col", col);
        cellNode.put("colSpan", colSpan);
        cellNode.put("rowSpan", rowSpan);
        cellNode.put("kind", "static");
        cellNode.put("staticText", text);
        cellNode.set("style", style != null ? style : defaultWordStyle());
        return cellNode;
    }

    private ObjectNode defaultWordStyle() {
        ObjectNode style = objectMapper.createObjectNode();
        style.put("align", "left");
        return style;
    }

    private ObjectNode mapParagraphStyle(XWPFParagraph para) {
        ObjectNode style = defaultWordStyle();
        ParagraphAlignment align = para.getAlignment();
        if (align != null) {
            style.put("align", switch (align) {
                case CENTER -> "center";
                case RIGHT -> "right";
                default -> "left";
            });
        }
        return style;
    }

    private ObjectNode extractWordCellStyle(XWPFTableCell cell) {
        ObjectNode style = objectMapper.createObjectNode();
        style.put("align", "center");
        for (XWPFParagraph para : cell.getParagraphs()) {
            ParagraphAlignment align = para.getAlignment();
            if (align != null) {
                style.put("align", switch (align) {
                    case CENTER -> "center";
                    case RIGHT -> "right";
                    default -> "left";
                });
            }
            for (XWPFRun run : para.getRuns()) {
                if (run.isBold()) style.put("bold", true);
                if (run.getFontSize() > 0) style.put("fontSize", run.getFontSize());
            }
            break;
        }
        return style;
    }

    private int getTableLogicalCols(XWPFTable table) {
        int max = 0;
        for (int r = 0; r < table.getNumberOfRows(); r++) {
            XWPFTableRow row = table.getRow(r);
            if (row == null) continue;
            int cols = 0;
            for (XWPFTableCell cell : row.getTableCells()) {
                if (isHMergeContinue(cell)) continue;
                cols += getGridSpan(cell);
            }
            max = Math.max(max, cols);
        }
        return Math.max(max, 1);
    }

    private boolean isVMergeContinue(XWPFTableCell cell) {
        CTTcPr pr = cell.getCTTc().getTcPr();
        if (pr == null || !pr.isSetVMerge()) return false;
        if (!pr.getVMerge().isSetVal()) return true;
        return pr.getVMerge().getVal() == STMerge.CONTINUE;
    }

    private boolean isHMergeContinue(XWPFTableCell cell) {
        CTTcPr pr = cell.getCTTc().getTcPr();
        if (pr == null || !pr.isSetHMerge()) return false;
        if (!pr.getHMerge().isSetVal()) return true;
        return pr.getHMerge().getVal() == STMerge.CONTINUE;
    }

    private int getGridSpan(XWPFTableCell cell) {
        CTTcPr pr = cell.getCTTc().getTcPr();
        if (pr != null && pr.isSetGridSpan()) {
            return Math.max(1, pr.getGridSpan().getVal().intValue());
        }
        return 1;
    }

    private int countVerticalSpan(XWPFTable table, int rowIdx, int cellIdx) {
        int span = 1;
        for (int r = rowIdx + 1; r < table.getNumberOfRows(); r++) {
            XWPFTableRow row = table.getRow(r);
            if (row == null || cellIdx >= row.getTableCells().size()) break;
            if (!isVMergeContinue(row.getCell(cellIdx))) break;
            span++;
        }
        return span;
    }

    private void extractTableGridWidths(XWPFTable table, int colOffset, Map<Integer, Integer> widths) {
        var tbl = table.getCTTbl();
        if (tbl.getTblGrid() == null) return;
        var gridCols = tbl.getTblGrid().getGridColList();
        for (int i = 0; i < gridCols.size(); i++) {
            Object wObj = gridCols.get(i).getW();
            if (wObj == null) continue;
            BigInteger w = (BigInteger) wObj;
            int px = (int) Math.max(28, w.longValue() / 20.0 * 96.0 / 72.0);
            widths.merge(colOffset + i, px, Math::max);
        }
    }

    private String normalizeText(String text) {
        if (text == null) return "";
        return text.replace('\u00A0', ' ').replaceAll("[ \\t\\r\\f\\x0B]+", " ").trim();
    }

    private String normalizeCellText(XWPFTableCell cell) {
        StringBuilder sb = new StringBuilder();
        for (XWPFParagraph para : cell.getParagraphs()) {
            String line = normalizeText(para.getText());
            if (line.isEmpty()) continue;
            if (sb.length() > 0) sb.append('\n');
            sb.append(line);
        }
        return sb.toString();
    }

    private void computeColumnWidthsFromCells(ArrayNode cells, Map<Integer, Integer> widths, int maxCol) {
        for (int c = 0; c < maxCol; c++) {
            widths.putIfAbsent(c, 40);
        }
        for (int i = 0; i < cells.size(); i++) {
            var cell = cells.get(i);
            String text = cell.path("staticText").asText("");
            if (text.isEmpty()) continue;
            int col = cell.path("col").asInt();
            int colSpan = cell.path("colSpan").asInt(1);
            int fontSize = cell.path("style").path("fontSize").asInt(13);
            boolean bold = cell.path("style").path("bold").asBoolean(false);
            int required = (int) Math.ceil(measureTextWidth(text, fontSize, bold) + 16);
            if (colSpan <= 1) {
                widths.merge(col, Math.max(required, minColWidth(text, fontSize)), Math::max);
            } else {
                int sum = 0;
                for (int c = col; c < col + colSpan; c++) {
                    sum += widths.getOrDefault(c, 40);
                }
                if (sum < required) {
                    int deficit = required - sum;
                    int addPerCol = (int) Math.ceil(deficit / (double) colSpan);
                    for (int c = col; c < col + colSpan; c++) {
                        widths.merge(c, Math.max(minColWidth(text, fontSize), widths.getOrDefault(c, 40) + addPerCol), Math::max);
                    }
                }
            }
        }
    }

    private double measureTextWidth(String text, int fontSize, boolean bold) {
        double width = 0;
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            width += (ch >= 0x4E00 && ch <= 0x9FFF) || (ch >= 0x3400 && ch <= 0x4DBF) ? fontSize : fontSize * 0.55;
        }
        if (bold) width *= 1.05;
        return width;
    }

    private int minColWidth(String text, int fontSize) {
        if (text == null || text.length() <= 3) {
            return Math.max(28, (int) Math.ceil(fontSize * 1.4) + 16);
        }
        return 40;
    }

    private String buildThemeWithColumnWidths(Map<Integer, Integer> columnWidths) throws Exception {
        ObjectNode theme = objectMapper.createObjectNode();
        theme.put("headerBg", "var(--app-color-surface-container)");
        theme.put("headerColor", "var(--app-color-text-primary)");
        theme.put("headerFontSize", 13);
        theme.put("headerBold", true);
        theme.put("headerAlign", "center");
        theme.put("zebraStripe", true);
        theme.put("oddRowBg", "var(--app-color-surface-page)");
        theme.put("evenRowBg", "var(--app-color-surface-container)");
        theme.put("borderWidth", 1);
        theme.put("borderColor", "var(--app-color-border)");
        theme.put("borderRadius", 8);
        theme.put("cellPadding", 8);
        theme.put("defaultFontSize", 13);
        theme.put("defaultAlign", "center");
        ObjectNode cw = objectMapper.createObjectNode();
        for (var entry : columnWidths.entrySet()) {
            cw.put(String.valueOf(entry.getKey()), entry.getValue());
        }
        theme.set("columnWidths", cw);
        theme.set("rowHeights", objectMapper.createObjectNode());
        return theme.toString();
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
