package com.example.demo.modules.reportform.service;

import com.example.demo.modules.reportform.dto.ReportFormImportResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.*;
import org.apache.poi.xwpf.model.XWPFHeaderFooterPolicy;
import org.apache.poi.xwpf.usermodel.*;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTcPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STMerge;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.math.BigInteger;
import java.util.*;

@Service
public class ReportFormImportService {

    private static final Logger log = LoggerFactory.getLogger(ReportFormImportService.class);

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ReportFormWordService wordService;

    public ReportFormImportService(ReportFormWordService wordService) {
        this.wordService = wordService;
    }

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
            Map<Integer, Integer> rowHeights = new TreeMap<>();
            extractExcelSheetRowHeights(sheet, rowHeights);

            ReportFormImportResult result = new ReportFormImportResult();
            result.setSource("excel");
            result.setLayoutJson(layoutStr);
            result.setThemeJson(buildThemeWithDimensions(columnWidths, rowHeights));
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

    private void extractExcelSheetRowHeights(Sheet sheet, Map<Integer, Integer> heights) {
        for (int r = 0; r <= sheet.getLastRowNum(); r++) {
            Row row = sheet.getRow(r);
            float pts = row != null && row.getHeightInPoints() > 0
                    ? row.getHeightInPoints()
                    : sheet.getDefaultRowHeightInPoints();
            int px = (int) Math.max(24, Math.ceil(pts * 4.0 / 3.0));
            heights.merge(r, px, Math::max);
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
        byte[] docBytes = file.getBytes();
        List<String> docBookmarks = wordService.parseBookmarks(docBytes);

        try (XWPFDocument doc = new XWPFDocument(new ByteArrayInputStream(docBytes))) {
            int docMaxCols = computeDocMaxCols(doc);

            ArrayNode cells = objectMapper.createArrayNode();
            ObjectNode fields = objectMapper.createObjectNode();
            Map<Integer, Integer> columnWidths = new TreeMap<>();
            Map<Integer, Integer> rowHeights = new TreeMap<>();
            Map<String, String> bookmarkMapping = new LinkedHashMap<>();
            int currentRow = 0;
            int headerRowEnd = 0;
            int footerRowStart = -1;

            XWPFHeaderFooterPolicy hfPolicy = doc.getHeaderFooterPolicy();
            if (hfPolicy != null && hfPolicy.getDefaultHeader() != null) {
                currentRow = importWordBodyElements(
                        hfPolicy.getDefaultHeader().getBodyElements(),
                        docMaxCols, currentRow, cells, fields, columnWidths, rowHeights, bookmarkMapping, "header");
            } else if (!doc.getHeaderList().isEmpty()) {
                currentRow = importWordBodyElements(
                        doc.getHeaderList().get(0).getBodyElements(),
                        docMaxCols, currentRow, cells, fields, columnWidths, rowHeights, bookmarkMapping, "header");
            }
            headerRowEnd = currentRow;

            currentRow = importWordBodyElements(
                    doc.getBodyElements(), docMaxCols, currentRow, cells, fields,
                    columnWidths, rowHeights, bookmarkMapping, "body");
            footerRowStart = currentRow;

            if (hfPolicy != null && hfPolicy.getDefaultFooter() != null) {
                currentRow = importWordBodyElements(
                        hfPolicy.getDefaultFooter().getBodyElements(),
                        docMaxCols, currentRow, cells, fields, columnWidths, rowHeights, bookmarkMapping, "footer");
            } else if (!doc.getFooterList().isEmpty()) {
                currentRow = importWordBodyElements(
                        doc.getFooterList().get(0).getBodyElements(),
                        docMaxCols, currentRow, cells, fields, columnWidths, rowHeights, bookmarkMapping, "footer");
            }

            if (cells.isEmpty()) {
                throw new IllegalArgumentException("Word 文档无有效内容（页眉/页脚/段落或表格）");
            }

            int maxCol = 0;
            for (int i = 0; i < cells.size(); i++) {
                var cn = (ObjectNode) cells.get(i);
                maxCol = Math.max(maxCol, cn.path("col").asInt() + cn.path("colSpan").asInt(1));
            }
            computeWordLayoutColumnWidths(cells, fields, columnWidths, maxCol);
            int pageContentPx = extractWordPageContentWidthPx(doc);
            scaleColumnWidthsToTarget(columnWidths, maxCol, pageContentPx);
            ensureWordRowHeightsFromLayout(cells, fields, rowHeights, maxCol);

            ObjectNode layout = objectMapper.createObjectNode();
            layout.set("cells", cells);
            layout.set("fields", fields);
            layout.putArray("mergeGroups");
            if (headerRowEnd > 0) {
                layout.put("wordPrintHeaderRowEnd", headerRowEnd);
            }
            if (footerRowStart >= 0) {
                layout.put("wordPrintFooterRowStart", footerRowStart);
            }

            ReportFormImportResult result = new ReportFormImportResult();
            result.setSource("word");
            result.setLayoutJson(layout.toString());
            result.setThemeJson(buildThemeWithDimensions(
                    columnWidths, rowHeights, pageContentPx, headerRowEnd, footerRowStart));
            result.setCellCount(cells.size());
            result.setName(name);
            result.setWordTemplateBase64(Base64.getEncoder().encodeToString(docBytes));
            result.setWordTemplateName(name);
            result.setBookmarksJson(objectMapper.writeValueAsString(docBookmarks));
            result.setBookmarkMappingJson(objectMapper.writeValueAsString(bookmarkMapping));
            log.info("[report-form] Word 导入完成: cells={} fields={} rowHeights={} colSum={}px page={}px",
                    cells.size(), fields.size(), rowHeights.size(),
                    columnWidths.values().stream().mapToInt(Integer::intValue).sum(), pageContentPx);
            return result;
        }
    }

    private int computeDocMaxCols(XWPFDocument doc) {
        int docMaxCols = 1;
        for (IBodyElement element : doc.getBodyElements()) {
            if (element instanceof XWPFTable table) {
                docMaxCols = Math.max(docMaxCols, getTableLogicalCols(table));
            }
        }
        for (XWPFHeader header : doc.getHeaderList()) {
            for (IBodyElement element : header.getBodyElements()) {
                if (element instanceof XWPFTable table) {
                    docMaxCols = Math.max(docMaxCols, getTableLogicalCols(table));
                }
            }
        }
        for (XWPFFooter footer : doc.getFooterList()) {
            for (IBodyElement element : footer.getBodyElements()) {
                if (element instanceof XWPFTable table) {
                    docMaxCols = Math.max(docMaxCols, getTableLogicalCols(table));
                }
            }
        }
        return docMaxCols;
    }

    /** 顺序导入段落/表格（页眉、正文、页脚共用） */
    private int importWordBodyElements(List<IBodyElement> elements, int docMaxCols, int startRow,
                                       ArrayNode cells, ObjectNode fields,
                                       Map<Integer, Integer> columnWidths,
                                       Map<Integer, Integer> rowHeights,
                                       Map<String, String> bookmarkMapping,
                                       String wordRegion) {
        int currentRow = startRow;
        int tableIdx = 0;
        for (IBodyElement element : elements) {
            if (element instanceof XWPFParagraph para) {
                WordParagraphBlock block = analyzeWordParagraph(para);
                if (block.isEmpty()) continue;
                ObjectNode style = block.style();
                if (block.imageSrc() != null) {
                    style.put("imageSrc", block.imageSrc());
                }
                cells.add(buildStaticCell(
                        "c" + cells.size(), currentRow, 0, docMaxCols, 1, block.text(), style));
                rowHeights.merge(currentRow, block.rowHeightPx(), Math::max);
                currentRow++;
            } else if (element instanceof XWPFTable table) {
                extractWordTableRowHeights(table, currentRow, rowHeights);
                currentRow += importWordTable(
                        table, currentRow, cells, columnWidths, fields, bookmarkMapping, wordRegion, tableIdx);
                tableIdx++;
            }
        }
        return currentRow;
    }

    private record WordParagraphBlock(String text, String imageSrc, ObjectNode style, int rowHeightPx) {
        boolean isEmpty() {
            return (text == null || text.isBlank()) && (imageSrc == null || imageSrc.isBlank());
        }
    }

    private WordParagraphBlock analyzeWordParagraph(XWPFParagraph para) {
        ObjectNode style = mapParagraphStyle(para);
        StringBuilder text = new StringBuilder();
        String imageSrc = null;
        int maxImgPx = 0;
        int fontSize = 13;

        for (XWPFRun run : para.getRuns()) {
            if (run.getFontSize() > 0) {
                fontSize = run.getFontSize();
            }
            String runText = run.getText(0);
            if (runText != null) {
                text.append(runText);
            }
            for (XWPFPicture picture : run.getEmbeddedPictures()) {
                String uri = pictureToDataUri(picture);
                if (uri != null) {
                    imageSrc = uri;
                    maxImgPx = Math.max(maxImgPx, estimatePictureHeightPx(picture));
                }
            }
        }
        if (fontSize > 0) {
            style.put("fontSize", fontSize);
        }

        String normalized = normalizeText(text.toString());
        int lines = normalized.isEmpty() ? 1 : Math.max(1, normalized.split("\n").length);
        int rowH = (int) Math.max(32, Math.ceil(lines * fontSize * 1.4 + 16));
        if (maxImgPx > 0) {
            rowH = Math.max(rowH, maxImgPx + 20);
        }
        return new WordParagraphBlock(normalized, imageSrc, style, rowH);
    }

    private String pictureToDataUri(XWPFPicture picture) {
        try {
            XWPFPictureData data = picture.getPictureData();
            if (data == null) return null;
            String mime = data.getPackagePart() != null
                    ? data.getPackagePart().getContentType()
                    : "image/png";
            if (mime == null || mime.isBlank()) {
                mime = "image/png";
            }
            return "data:" + mime + ";base64," + Base64.getEncoder().encodeToString(data.getData());
        } catch (Exception e) {
            log.debug("[report-form] Word 图片提取失败: {}", e.getMessage());
            return null;
        }
    }

    private int estimatePictureHeightPx(XWPFPicture picture) {
        try {
            double emu = picture.getDepth();
            if (emu <= 0) emu = picture.getWidth();
            return (int) Math.max(48, Math.round(emu * 96.0 / 914400.0));
        } catch (Exception e) {
            return 72;
        }
    }

    private int extractWordPageContentWidthPx(XWPFDocument doc) {
        int pageWidthTwips = 11906;
        int marginLeftTwips = 1800;
        int marginRightTwips = 1800;
        try {
            var body = doc.getDocument().getBody();
            if (body != null && body.isSetSectPr()) {
                var sect = body.getSectPr();
                if (sect.isSetPgSz() && sect.getPgSz().getW() != null) {
                    pageWidthTwips = xmlTwipsToInt(sect.getPgSz().getW(), pageWidthTwips);
                }
                if (sect.isSetPgMar()) {
                    if (sect.getPgMar().getLeft() != null) {
                        marginLeftTwips = xmlTwipsToInt(sect.getPgMar().getLeft(), marginLeftTwips);
                    }
                    if (sect.getPgMar().getRight() != null) {
                        marginRightTwips = xmlTwipsToInt(sect.getPgMar().getRight(), marginRightTwips);
                    }
                }
            }
        } catch (Exception ignored) {
        }
        int contentTwips = Math.max(2000, pageWidthTwips - marginLeftTwips - marginRightTwips);
        return (int) Math.max(560, Math.round(contentTwips * 96.0 / 1440.0));
    }

    /** OOXML twips 字段在 POI 5.x 可能为 BigInteger / Number / String */
    private int xmlTwipsToInt(Object raw, int fallback) {
        if (raw == null) return fallback;
        if (raw instanceof BigInteger bi) return bi.intValue();
        if (raw instanceof Number n) return n.intValue();
        if (raw instanceof String s) {
            try {
                return Integer.parseInt(s.trim());
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }

    private int twipsToPx(int twips) {
        return (int) Math.max(32, Math.round(twips * 96.0 / 1440.0));
    }

    private void scaleColumnWidthsToTarget(Map<Integer, Integer> widths, int maxCol, int targetTotalPx) {
        if (maxCol <= 0 || targetTotalPx <= 0) return;
        int sum = 0;
        for (int c = 0; c < maxCol; c++) {
            sum += widths.getOrDefault(c, 72);
        }
        if (sum <= 0) return;
        if (sum == targetTotalPx) return;

        double factor = (double) targetTotalPx / sum;
        for (int c = 0; c < maxCol; c++) {
            int w = widths.getOrDefault(c, 72);
            widths.put(c, (int) Math.max(48, Math.round(w * factor)));
        }

        int newSum = 0;
        for (int c = 0; c < maxCol; c++) {
            newSum += widths.getOrDefault(c, 72);
        }
        if (newSum != targetTotalPx && maxCol > 0) {
            int last = maxCol - 1;
            widths.put(last, Math.max(48, widths.getOrDefault(last, 72) + (targetTotalPx - newSum)));
        }
    }

    private void computeWordLayoutColumnWidths(ArrayNode cells, ObjectNode fields,
                                               Map<Integer, Integer> widths, int maxCol) {
        for (int c = 0; c < maxCol; c++) {
            widths.putIfAbsent(c, 72);
        }
        for (int i = 0; i < cells.size(); i++) {
            var cell = cells.get(i);
            String text = cell.path("staticText").asText("");
            if (text.isEmpty() && cell.has("fieldKey")) {
                String fk = cell.path("fieldKey").asText("");
                if (fields.has(fk)) {
                    text = fields.path(fk).path("label").asText(fk);
                }
            }
            if (text.isEmpty() && cell.path("style").has("imageSrc")) {
                text = "页眉图片";
            }
            if (text.isEmpty()) continue;

            int col = cell.path("col").asInt();
            int colSpan = cell.path("colSpan").asInt(1);
            int fontSize = cell.path("style").path("fontSize").asInt(13);
            boolean bold = cell.path("style").path("bold").asBoolean(false);
            int required = (int) Math.ceil(measureTextWidth(text, fontSize, bold) + 16);
            if (colSpan <= 1) {
                widths.merge(col, Math.max(required, minColWidth(text, fontSize)), Math::max);
            } else {
                int spanSum = 0;
                for (int c = col; c < col + colSpan; c++) {
                    spanSum += widths.getOrDefault(c, 72);
                }
                if (spanSum < required) {
                    int deficit = required - spanSum;
                    int addPerCol = (int) Math.ceil(deficit / (double) colSpan);
                    for (int c = col; c < col + colSpan; c++) {
                        widths.merge(c, Math.max(minColWidth(text, fontSize),
                                widths.getOrDefault(c, 72) + addPerCol), Math::max);
                    }
                }
            }
        }
    }

    private void extractWordTableRowHeights(XWPFTable table, int startRow, Map<Integer, Integer> rowHeights) {
        for (int r = 0; r < table.getNumberOfRows(); r++) {
            XWPFTableRow row = table.getRow(r);
            if (row == null) continue;
            rowHeights.merge(startRow + r, resolveWordTableRowHeightPx(row), Math::max);
        }
    }

    private int resolveWordTableRowHeightPx(XWPFTableRow row) {
        int twips = row.getHeight();
        if (twips > 0) {
            return twipsToPx(twips);
        }
        int max = 36;
        for (XWPFTableCell cell : row.getTableCells()) {
            max = Math.max(max, estimateWordCellHeightPx(cell));
        }
        return max;
    }

    private int estimateWordCellHeightPx(XWPFTableCell cell) {
        int max = 36;
        for (XWPFParagraph para : cell.getParagraphs()) {
            WordParagraphBlock block = analyzeWordParagraph(para);
            max = Math.max(max, block.rowHeightPx());
        }
        return max;
    }

    /** 表格行未显式高度时，按单元格内容补全 rowHeights */
    private void ensureWordRowHeightsFromLayout(ArrayNode cells, ObjectNode fields,
                                                Map<Integer, Integer> rowHeights, int maxCol) {
        int maxRow = 0;
        for (int i = 0; i < cells.size(); i++) {
            var cell = cells.get(i);
            maxRow = Math.max(maxRow, cell.path("row").asInt() + cell.path("rowSpan").asInt(1));
        }
        for (int r = 0; r < maxRow; r++) {
            rowHeights.putIfAbsent(r, 36);
        }
        for (int i = 0; i < cells.size(); i++) {
            var cell = cells.get(i);
            int required = estimateLayoutCellRowHeight(cell, fields);
            int span = Math.max(1, cell.path("rowSpan").asInt(1));
            int start = cell.path("row").asInt();
            if (span == 1) {
                rowHeights.merge(start, required, Math::max);
                continue;
            }
            int spanSum = 0;
            for (int r = start; r < start + span; r++) {
                spanSum += rowHeights.getOrDefault(r, 36);
            }
            if (spanSum >= required) continue;
            int deficit = required - spanSum;
            int addPerRow = (int) Math.ceil(deficit / (double) span);
            for (int r = start; r < start + span; r++) {
                rowHeights.merge(r, rowHeights.getOrDefault(r, 36) + addPerRow, Math::max);
            }
        }
    }

    private int estimateLayoutCellRowHeight(com.fasterxml.jackson.databind.JsonNode cell, ObjectNode fields) {
        if (cell.path("style").has("imageSrc")) {
            return 88;
        }
        String text = cell.path("staticText").asText("");
        if (text.isEmpty() && cell.has("fieldKey")) {
            String fk = cell.path("fieldKey").asText("");
            if (fields.has(fk)) {
                text = fields.path(fk).path("label").asText(fk);
            }
        }
        int fontSize = cell.path("style").path("fontSize").asInt(13);
        int lines = text.isEmpty() ? 1 : Math.max(1, text.split("\n").length);
        if (cell.has("fieldKey")) {
            return Math.max(36, (int) Math.ceil(lines * fontSize * 1.35 + 16));
        }
        return Math.max(32, (int) Math.ceil(lines * fontSize * 1.4 + 16));
    }

    /** 按文档顺序导入 Word 表格，识别 gridSpan / vMerge / hMerge；含书签的单元格生成为可编辑字段 */
    private int importWordTable(XWPFTable table, int startRow, ArrayNode cells,
                                  Map<Integer, Integer> columnWidths,
                                  ObjectNode fields,
                                  Map<String, String> bookmarkMapping,
                                  String wordRegion,
                                  int tableIdx) {
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
                String cellImage = extractFirstPictureFromCell(cell);
                if (cellImage != null) {
                    style.put("imageSrc", cellImage);
                }
                List<String> cellBookmarks = collectBookmarksInCell(cell);
                if (!cellBookmarks.isEmpty()) {
                    String fieldKey = cellBookmarks.get(0);
                    for (String bm : cellBookmarks) {
                        bookmarkMapping.put(bm, fieldKey);
                    }
                    ObjectNode wordAnchor = objectMapper.createObjectNode();
                    wordAnchor.put("region", wordRegion);
                    wordAnchor.put("tableIdx", tableIdx);
                    wordAnchor.put("tr", r);
                    wordAnchor.put("tc", logicalCol);
                    cells.add(buildFieldCell(
                            "c" + cells.size(), startRow + r, logicalCol, colSpan, rowSpan,
                            fieldKey, text, style, fields, wordAnchor));
                } else {
                    cells.add(buildStaticCell(
                            "c" + cells.size(), startRow + r, logicalCol, colSpan, rowSpan, text, style));
                }

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

    private ObjectNode buildFieldCell(String id, int row, int col, int colSpan, int rowSpan,
                                      String fieldKey, String label, ObjectNode style,
                                      ObjectNode fields, ObjectNode wordAnchor) {
        ObjectNode cellNode = objectMapper.createObjectNode();
        cellNode.put("id", id);
        cellNode.put("row", row);
        cellNode.put("col", col);
        cellNode.put("colSpan", colSpan);
        cellNode.put("rowSpan", rowSpan);
        cellNode.put("kind", "field");
        cellNode.put("fieldKey", fieldKey);
        cellNode.set("style", style != null ? style : defaultWordStyle());
        if (wordAnchor != null) {
            cellNode.set("wordAnchor", wordAnchor);
        }

        if (!fields.has(fieldKey)) {
            ObjectNode fieldNode = objectMapper.createObjectNode();
            fieldNode.put("type", "TEXT");
            String fieldLabel = label != null && !label.isBlank() ? label : fieldKey;
            fieldNode.put("label", fieldLabel);
            fieldNode.put("editableInFill", true);
            fieldNode.putArray("editableByRoles");
            fields.set(fieldKey, fieldNode);
        }
        return cellNode;
    }

    private String extractFirstPictureFromCell(XWPFTableCell cell) {
        for (XWPFParagraph para : cell.getParagraphs()) {
            for (XWPFRun run : para.getRuns()) {
                for (XWPFPicture picture : run.getEmbeddedPictures()) {
                    String uri = pictureToDataUri(picture);
                    if (uri != null) return uri;
                }
            }
        }
        return null;
    }

    private List<String> collectBookmarksInCell(XWPFTableCell cell) {
        List<String> names = new ArrayList<>();
        for (XWPFParagraph para : cell.getParagraphs()) {
            for (var bm : para.getCTP().getBookmarkStartList()) {
                String name = bm.getName();
                if (name == null || name.isEmpty() || isInternalBookmark(name)) continue;
                if (!names.contains(name)) {
                    names.add(name);
                }
            }
        }
        return names;
    }

    private boolean isInternalBookmark(String name) {
        return name.startsWith("_");
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

    private String buildThemeWithDimensions(Map<Integer, Integer> columnWidths,
                                            Map<Integer, Integer> rowHeights) throws Exception {
        return buildThemeWithDimensions(columnWidths, rowHeights, 0, 0, -1);
    }

    private String buildThemeWithDimensions(Map<Integer, Integer> columnWidths,
                                            Map<Integer, Integer> rowHeights,
                                            int pageContentWidthPx,
                                            int headerRowEnd,
                                            int footerRowStart) throws Exception {
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
        ObjectNode rh = objectMapper.createObjectNode();
        for (var entry : rowHeights.entrySet()) {
            rh.put(String.valueOf(entry.getKey()), entry.getValue());
        }
        theme.set("rowHeights", rh);
        if (pageContentWidthPx > 0) {
            theme.put("pageContentWidthPx", pageContentWidthPx);
            theme.put("printPortrait", true);
        }
        if (headerRowEnd > 0) {
            theme.put("printHeaderRowEnd", headerRowEnd);
        }
        if (footerRowStart >= 0) {
            theme.put("printFooterRowStart", footerRowStart);
        }
        return theme.toString();
    }

    /** @deprecated 使用 {@link #buildThemeWithDimensions} */
    private String buildThemeWithColumnWidths(Map<Integer, Integer> columnWidths) throws Exception {
        return buildThemeWithDimensions(columnWidths, new TreeMap<>());
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
