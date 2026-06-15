package com.example.demo.modules.reportform.service;

import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.entity.ReportFormSubmission;
import com.example.demo.modules.reportform.mapper.ReportFormDefinitionMapper;
import com.example.demo.modules.reportform.mapper.ReportFormSubmissionMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pdfbox.io.RandomAccessReadBuffer;
import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.apache.poi.xssf.usermodel.XSSFColor;
import org.apache.poi.xssf.usermodel.XSSFFont;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.util.*;

@Service
public class ReportFormExportService {

    private static final Logger log = LoggerFactory.getLogger(ReportFormExportService.class);

    private final ReportFormDefinitionMapper definitionMapper;
    private final ReportFormSubmissionMapper submissionMapper;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ReportFormExportService(ReportFormDefinitionMapper definitionMapper,
                                   ReportFormSubmissionMapper submissionMapper) {
        this.definitionMapper = definitionMapper;
        this.submissionMapper = submissionMapper;
    }

    /** 单条提交：按 layout 网格逆向导出 Excel（保留合并格、样式、列宽） */
    public byte[] exportSingle(Long formId, Long submissionId) throws Exception {
        ReportFormDefinition form = definitionMapper.selectById(formId);
        if (form == null) throw new RuntimeException("报表不存在");

        ReportFormSubmission sub = submissionMapper.selectById(submissionId);
        if (sub == null) throw new RuntimeException("提交记录不存在");

        var layout = objectMapper.readTree(form.getLayoutJson());
        var fieldValues = objectMapper.readTree(sub.getFieldValuesJson() != null ? sub.getFieldValuesJson() : "{}");
        var theme = parseTheme(form.getThemeJson());

        try (Workbook wb = new XSSFWorkbook()) {
            Sheet sheet = wb.createSheet(sanitizeSheetName(form.getName()));
            writeGridToSheet(wb, sheet, layout, fieldValues, theme);
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            wb.write(bos);
            return bos.toByteArray();
        }
    }

    /** 批量：每条提交一个 Sheet；无提交时导出空白模板网格 */
    public byte[] exportBatch(Long formId) throws Exception {
        ReportFormDefinition form = definitionMapper.selectById(formId);
        if (form == null) throw new RuntimeException("报表不存在");

        var layout = objectMapper.readTree(form.getLayoutJson());
        var theme = parseTheme(form.getThemeJson());
        List<ReportFormSubmission> subs = submissionMapper.selectByFormId(formId);

        try (Workbook wb = new XSSFWorkbook()) {
            if (subs.isEmpty()) {
                Sheet sheet = wb.createSheet(sanitizeSheetName(form.getName()));
                writeGridToSheet(wb, sheet, layout, objectMapper.createObjectNode(), theme);
            } else {
                Set<String> usedNames = new HashSet<>();
                for (ReportFormSubmission sub : subs) {
                    String base = "提交-" + sub.getId();
                    String sheetName = uniqueSheetName(base, usedNames);
                    usedNames.add(sheetName);
                    Sheet sheet = wb.createSheet(sheetName);
                    var values = objectMapper.readTree(sub.getFieldValuesJson() != null ? sub.getFieldValuesJson() : "{}");
                    writeGridToSheet(wb, sheet, layout, values, theme);
                }
            }
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            wb.write(bos);
            return bos.toByteArray();
        }
    }

    public byte[] exportSinglePdf(Long formId, Long submissionId) throws Exception {
        ReportFormDefinition form = definitionMapper.selectById(formId);
        if (form == null) throw new RuntimeException("报表不存在");

        ReportFormSubmission sub = submissionMapper.selectById(submissionId);
        if (sub == null) throw new RuntimeException("提交记录不存在");

        var layout = objectMapper.readTree(form.getLayoutJson());
        var fieldValues = objectMapper.readTree(sub.getFieldValuesJson() != null ? sub.getFieldValuesJson() : "{}");
        var theme = parseTheme(form.getThemeJson());

        return renderGridPdf(form.getName(), layout, fieldValues, theme,
                "填写人 #" + sub.getUserId() + "  |  "
                        + (sub.getSubmittedAt() != null ? sub.getSubmittedAt().toString() : "未提交"));
    }

    public byte[] exportBatchPdf(Long formId) throws Exception {
        ReportFormDefinition form = definitionMapper.selectById(formId);
        if (form == null) throw new RuntimeException("报表不存在");

        List<ReportFormSubmission> subs = submissionMapper.selectByFormId(formId);
        if (subs.isEmpty()) {
            var layout = objectMapper.readTree(form.getLayoutJson());
            var theme = parseTheme(form.getThemeJson());
            return renderGridPdf(form.getName(), layout, objectMapper.createObjectNode(), theme, "暂无提交记录");
        }

        ByteArrayOutputStream merged = new ByteArrayOutputStream();
        PDFMergerUtility merger = new PDFMergerUtility();
        merger.setDestinationStream(merged);
        var layout = objectMapper.readTree(form.getLayoutJson());
        var theme = parseTheme(form.getThemeJson());
        for (ReportFormSubmission sub : subs) {
            var fieldValues = objectMapper.readTree(sub.getFieldValuesJson() != null ? sub.getFieldValuesJson() : "{}");
            byte[] singlePdf = renderGridPdf(form.getName(), layout, fieldValues, theme,
                    "提交 #" + sub.getId() + "  |  用户 #" + sub.getUserId());
            merger.addSource(new RandomAccessReadBuffer(singlePdf));
        }
        merger.mergeDocuments(null);
        return merged.toByteArray();
    }

    // ──────────── Excel 网格逆向写入（与 importFromExcel 对称） ────────────

    private void writeGridToSheet(Workbook wb, Sheet sheet, JsonNode layout,
                                  JsonNode fieldValues, JsonNode theme) {
        JsonNode cellsNode = layout.get("cells");
        if (cellsNode == null || !cellsNode.isArray() || cellsNode.isEmpty()) {
            sheet.createRow(0).createCell(0).setCellValue("（空表格）");
            return;
        }

        List<JsonNode> cells = new ArrayList<>();
        cellsNode.forEach(cells::add);
        cells.sort(Comparator
                .comparingInt((JsonNode c) -> c.path("row").asInt())
                .thenComparingInt(c -> c.path("col").asInt()));

        int maxRow = 0;
        int maxCol = 0;
        for (JsonNode cell : cells) {
            maxRow = Math.max(maxRow, cell.path("row").asInt() + cell.path("rowSpan").asInt(1));
            maxCol = Math.max(maxCol, cell.path("col").asInt() + cell.path("colSpan").asInt(1));
        }
        for (int r = 0; r < maxRow; r++) {
            sheet.createRow(r);
        }

        Map<String, CellStyle> styleCache = new HashMap<>();
        List<CellRangeAddress> merges = new ArrayList<>();

        for (JsonNode cell : cells) {
            int r = cell.path("row").asInt();
            int c = cell.path("col").asInt();
            int colSpan = Math.max(1, cell.path("colSpan").asInt(1));
            int rowSpan = Math.max(1, cell.path("rowSpan").asInt(1));
            String text = resolveCellText(cell, layout, fieldValues);

            Row row = sheet.getRow(r);
            if (row == null) row = sheet.createRow(r);
            Cell xlCell = row.createCell(c);
            xlCell.setCellValue(text);
            xlCell.setCellStyle(buildExcelCellStyle(wb, cell.path("style"), styleCache));

            if (colSpan > 1 || rowSpan > 1) {
                merges.add(new CellRangeAddress(r, r + rowSpan - 1, c, c + colSpan - 1));
            }
        }

        for (CellRangeAddress merge : merges) {
            try {
                sheet.addMergedRegion(merge);
            } catch (Exception e) {
                log.warn("[report-form] Excel 合并区域跳过: {} — {}", merge.formatAsString(), e.getMessage());
            }
        }

        java.util.function.Function<JsonNode, String> textOf = cell -> resolveCellText(cell, layout, fieldValues);
        int[] colPx = ReportFormColumnWidthCalculator.resolveExportColumnWidthsPx(
                theme, cells, layout, maxCol, textOf);
        ReportFormColumnWidthCalculator.applyToExcelSheet(sheet, colPx);
        applyExcelRowHeights(sheet, cells, colPx, textOf, maxRow);
    }

    /** 按列宽与换行估算行高 */
    private void applyExcelRowHeights(Sheet sheet, List<JsonNode> cells, int[] colPxWidths,
                                      java.util.function.Function<JsonNode, String> cellText, int maxRow) {
        float[] rowLines = ReportFormColumnWidthCalculator.estimateRowLineCounts(
                cells, maxRow, colPxWidths, cellText);
        for (int r = 0; r < maxRow; r++) {
            Row row = sheet.getRow(r);
            if (row == null) continue;
            row.setHeightInPoints(Math.max(18f, rowLines[r] * 15f));
        }
    }

    private String resolveCellText(JsonNode cell, JsonNode layout, JsonNode fieldValues) {
        String kind = cell.path("kind").asText("static");
        String fk = cell.path("fieldKey").asText("");
        JsonNode fields = layout.path("fields");

        if ("field".equals(kind)) {
            if (fk.isEmpty() || fieldValues == null || !fieldValues.has(fk)) return "";
            return ReportFormFieldValueFormatter.format(fields.path(fk), fieldValues.get(fk));
        }

        // static 格：若有关联 fieldKey 且已填报，写入填报值（兼容 Excel 导入格）
        if (!fk.isEmpty() && fieldValues != null && fieldValues.has(fk) && !fieldValues.get(fk).isNull()) {
            JsonNode v = fieldValues.get(fk);
            if (!isFieldValueEmpty(v)) {
                return ReportFormFieldValueFormatter.format(fields.path(fk), v);
            }
        }
        return cell.path("staticText").asText("");
    }

    private boolean isFieldValueEmpty(JsonNode v) {
        if (v == null || v.isNull()) return true;
        if (v.isTextual()) {
            String s = v.asText("");
            return s.isEmpty() || "null".equalsIgnoreCase(s);
        }
        if (v.isArray()) return v.isEmpty();
        return false;
    }

    private CellStyle buildExcelCellStyle(Workbook wb, JsonNode styleNode, Map<String, CellStyle> cache) {
        String key = styleNode == null ? "{}" : styleNode.toString();
        if (cache.containsKey(key)) return cache.get(key);

        XSSFCellStyle cs = (XSSFCellStyle) wb.createCellStyle();
        Font font = wb.createFont();
        font.setFontHeightInPoints((short) Math.max(9, styleNode.path("fontSize").asInt(11)));
        if (styleNode.path("bold").asBoolean(false)) font.setBold(true);
        cs.setFont(font);
        cs.setWrapText(true);
        cs.setVerticalAlignment(VerticalAlignment.CENTER);

        String align = styleNode.path("align").asText("center");
        cs.setAlignment(switch (align) {
            case "left" -> HorizontalAlignment.LEFT;
            case "right" -> HorizontalAlignment.RIGHT;
            default -> HorizontalAlignment.CENTER;
        });

        String bg = styleNode.path("bg").asText("");
        ReportFormColorParser.Rgb bgRgb = ReportFormColorParser.parse(bg);
        if (bgRgb != null) {
            XSSFColor fill = toXssfColor(bgRgb);
            cs.setFillForegroundColor(fill);
            cs.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        }

        String color = styleNode.path("color").asText("");
        ReportFormColorParser.Rgb fgRgb = ReportFormColorParser.parse(color);
        if (fgRgb != null) {
            XSSFFont colored = (XSSFFont) wb.createFont();
            colored.setFontHeight(font.getFontHeight());
            colored.setBold(font.getBold());
            colored.setColor(toXssfColor(fgRgb));
            cs.setFont(colored);
        }

        cs.setBorderTop(BorderStyle.THIN);
        cs.setBorderBottom(BorderStyle.THIN);
        cs.setBorderLeft(BorderStyle.THIN);
        cs.setBorderRight(BorderStyle.THIN);

        cache.put(key, cs);
        return cs;
    }

    private XSSFColor toXssfColor(ReportFormColorParser.Rgb rgb) {
        return new XSSFColor(new Color(rgb.r(), rgb.g(), rgb.b()), null);
    }

    private String sanitizeSheetName(String name) {
        if (name == null || name.isBlank()) return "Sheet1";
        String s = name.replaceAll("[\\\\/?*\\[\\]:]", "_").trim();
        if (s.length() > 31) s = s.substring(0, 31);
        return s.isEmpty() ? "Sheet1" : s;
    }

    private String uniqueSheetName(String base, Set<String> used) {
        String s = sanitizeSheetName(base);
        if (!used.contains(s)) return s;
        for (int i = 2; i < 100; i++) {
            String candidate = sanitizeSheetName(base + "(" + i + ")");
            if (!used.contains(candidate)) return candidate;
        }
        return sanitizeSheetName(base + "-" + System.currentTimeMillis() % 10000);
    }

    // ──────────── PDF 网格渲染（自定义页宽、动态行高、单元格内换行） ────────────

    private static final float PDF_MARGIN = 28f;
    private static final float PDF_MAX_PAGE_WIDTH_PT = 4000f;
    private static final float PDF_MAX_PAGE_HEIGHT_PT = 1200f;

    private byte[] renderGridPdf(String title, JsonNode layout, JsonNode fieldValues,
                                 JsonNode theme, String subtitle) throws IOException {
        JsonNode cellsNode = layout.get("cells");
        if (cellsNode == null || !cellsNode.isArray() || cellsNode.isEmpty()) {
            return emptyPdf("（空表格）");
        }

        List<JsonNode> cells = new ArrayList<>();
        cellsNode.forEach(cells::add);

        int maxRow = 0;
        int maxCol = 0;
        for (JsonNode cell : cells) {
            maxRow = Math.max(maxRow, cell.path("row").asInt() + cell.path("rowSpan").asInt(1));
            maxCol = Math.max(maxCol, cell.path("col").asInt() + cell.path("colSpan").asInt(1));
        }

        try (PDDocument doc = new PDDocument()) {
            PDFont font = loadSystemFont(doc, false);
            PDFont boldFont = loadSystemFont(doc, true);

            java.util.function.Function<JsonNode, String> textOf =
                    cell -> resolveCellText(cell, layout, fieldValues);
            int[] colPx = ReportFormColumnWidthCalculator.resolveExportColumnWidthsPx(
                    theme, cells, layout, maxCol, textOf);
            float[] colWidths = ReportFormColumnWidthCalculator.toPdfPoints(colPx);
            colWidths = ReportFormColumnWidthCalculator.refinePdfColumnWidths(
                    colWidths, cells, textOf, font, boldFont);

            float[] rowHeights = computePdfRowHeights(cells, layout, fieldValues, colWidths, font, boldFont);
            float tableWidth = sumWidths(colWidths, 0, colWidths.length);
            float tableHeight = sumRowHeights(rowHeights);

            float headerBlock = 36f + (subtitle != null && !subtitle.isBlank() ? 14f : 0f);
            float pageWidth = Math.min(PDF_MAX_PAGE_WIDTH_PT, tableWidth + PDF_MARGIN * 2);
            float pageContentHeight = Math.min(PDF_MAX_PAGE_HEIGHT_PT, tableHeight + headerBlock + PDF_MARGIN);

            // 宽表不压缩列宽，扩展页面宽度；仅当超过上限时才等比缩小
            if (tableWidth + PDF_MARGIN * 2 > PDF_MAX_PAGE_WIDTH_PT) {
                float scale = (PDF_MAX_PAGE_WIDTH_PT - PDF_MARGIN * 2) / tableWidth;
                for (int i = 0; i < colWidths.length; i++) colWidths[i] *= scale;
                tableWidth = sumWidths(colWidths, 0, colWidths.length);
                pageWidth = PDF_MAX_PAGE_WIDTH_PT;
                rowHeights = computePdfRowHeights(cells, layout, fieldValues, colWidths, font, boldFont);
                tableHeight = sumRowHeights(rowHeights);
            }

            List<RowSlice> verticalSlices = sliceRowsByPage(rowHeights, pageContentHeight - headerBlock - PDF_MARGIN);

            for (int sliceIdx = 0; sliceIdx < verticalSlices.size(); sliceIdx++) {
                RowSlice slice = verticalSlices.get(sliceIdx);
                float sliceHeight = sliceHeight(rowHeights, slice);
                PDRectangle pageSize = new PDRectangle(pageWidth, sliceHeight + headerBlock + PDF_MARGIN * 2);
                PDPage page = new PDPage(pageSize);
                doc.addPage(page);

                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    float yCursor = pageSize.getHeight() - PDF_MARGIN;

                    if (sliceIdx == 0) {
                        cs.beginText();
                        cs.setFont(boldFont, 11);
                        cs.newLineAtOffset(PDF_MARGIN, yCursor);
                        cs.showText(ReportFormPdfText.safe(title));
                        cs.endText();
                        yCursor -= 16;

                        if (subtitle != null && !subtitle.isBlank()) {
                            cs.beginText();
                            cs.setFont(font, 8);
                            cs.newLineAtOffset(PDF_MARGIN, yCursor);
                            cs.showText(ReportFormPdfText.safe(subtitle));
                            cs.endText();
                            yCursor -= 12;
                        }
                    } else {
                        cs.beginText();
                        cs.setFont(font, 8);
                        cs.newLineAtOffset(PDF_MARGIN, yCursor);
                        cs.showText(ReportFormPdfText.safe(title + "（续 " + (sliceIdx + 1) + "）"));
                        cs.endText();
                        yCursor -= 14;
                    }

                    float gridTop = yCursor;
                    float gridLeft = PDF_MARGIN;
                    float yOffset = rowTopOffset(rowHeights, slice.startRow);

                    for (JsonNode cell : cells) {
                        int r = cell.path("row").asInt();
                        int c = cell.path("col").asInt();
                        int colSpan = Math.max(1, cell.path("colSpan").asInt(1));
                        int rowSpan = Math.max(1, cell.path("rowSpan").asInt(1));
                        int cellEndRow = r + rowSpan;

                        if (cellEndRow <= slice.startRow || r >= slice.endRow) continue;

                        float x = gridLeft + sumWidths(colWidths, 0, c);
                        float w = sumWidths(colWidths, c, c + colSpan);
                        float cellTop = gridTop - (rowTopOffset(rowHeights, r) - yOffset);
                        float h = sumRowHeights(rowHeights, r, Math.min(cellEndRow, slice.endRow));
                        if (r < slice.startRow) {
                            cellTop += sumRowHeights(rowHeights, r, slice.startRow);
                            h -= sumRowHeights(rowHeights, r, slice.startRow);
                        }
                        if (cellEndRow > slice.endRow) {
                            h -= sumRowHeights(rowHeights, slice.endRow, cellEndRow);
                        }
                        float y = cellTop - h;

                        JsonNode style = cell.path("style");
                        fillPdfCellBackground(cs, x, y, w, h, style);

                        cs.setLineWidth(0.35f);
                        cs.setStrokingColor(0.55f, 0.55f, 0.55f);
                        cs.addRect(x, y, w, h);
                        cs.stroke();

                        String text = resolveCellText(cell, layout, fieldValues);
                        if (text.isBlank()) continue;

                        float fontSize = pdfFontSize(style);
                        PDFont f = style.path("bold").asBoolean(false) ? boldFont : font;
                        drawWrappedCellText(cs, f, fontSize, text, x + 2, y + 2, w - 4, h - 4,
                                style.path("align").asText("center"), style);
                    }
                }
            }

            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            doc.save(bos);
            return bos.toByteArray();
        }
    }

    private record RowSlice(int startRow, int endRow) {}

    private List<RowSlice> sliceRowsByPage(float[] rowHeights, float maxHeight) {
        List<RowSlice> slices = new ArrayList<>();
        int start = 0;
        float acc = 0;
        for (int r = 0; r < rowHeights.length; r++) {
            if (acc + rowHeights[r] > maxHeight && r > start) {
                slices.add(new RowSlice(start, r));
                start = r;
                acc = 0;
            }
            acc += rowHeights[r];
        }
        if (start < rowHeights.length) {
            slices.add(new RowSlice(start, rowHeights.length));
        }
        if (slices.isEmpty()) {
            slices.add(new RowSlice(0, rowHeights.length));
        }
        return slices;
    }

    private float sliceHeight(float[] rowHeights, RowSlice slice) {
        return sumRowHeights(rowHeights, slice.startRow, slice.endRow);
    }

    private float rowTopOffset(float[] rowHeights, int row) {
        return sumRowHeights(rowHeights, 0, row);
    }

    private float sumRowHeights(float[] rowHeights) {
        return sumRowHeights(rowHeights, 0, rowHeights.length);
    }

    private float sumRowHeights(float[] rowHeights, int from, int to) {
        float s = 0;
        for (int i = from; i < to && i < rowHeights.length; i++) s += rowHeights[i];
        return s;
    }

    private float[] computePdfRowHeights(List<JsonNode> cells, JsonNode layout, JsonNode fieldValues,
                                           float[] colWidths, PDFont font, PDFont boldFont) throws IOException {
        int maxRow = 0;
        for (JsonNode cell : cells) {
            maxRow = Math.max(maxRow, cell.path("row").asInt() + cell.path("rowSpan").asInt(1));
        }
        float[] rowHeights = new float[maxRow];
        Arrays.fill(rowHeights, 18f);

        for (JsonNode cell : cells) {
            int r = cell.path("row").asInt();
            int c = cell.path("col").asInt();
            int colSpan = Math.max(1, cell.path("colSpan").asInt(1));
            int rowSpan = Math.max(1, cell.path("rowSpan").asInt(1));
            float cellW = sumWidths(colWidths, c, c + colSpan) - 4;
            if (cellW < 8) cellW = 8;

            String text = resolveCellText(cell, layout, fieldValues);
            if (text.isBlank()) continue;

            JsonNode style = cell.path("style");
            float fontSize = pdfFontSize(style);
            PDFont f = style.path("bold").asBoolean(false) ? boldFont : font;
            List<String> lines = wrapPdfText(text, f, fontSize, cellW);
            float needed = lines.size() * fontSize * 1.35f + 6;
            float perRow = needed / rowSpan;
            for (int dr = 0; dr < rowSpan && r + dr < maxRow; dr++) {
                rowHeights[r + dr] = Math.max(rowHeights[r + dr], perRow);
            }
        }
        return rowHeights;
    }

    private void fillPdfCellBackground(PDPageContentStream cs, float x, float y, float w, float h,
                                       JsonNode style) throws IOException {
        ReportFormColorParser.Rgb bg = ReportFormColorParser.parse(style.path("bg").asText(""));
        if (bg == null) return;
        cs.setNonStrokingColor(bg.rf(), bg.gf(), bg.bf());
        cs.addRect(x, y, w, h);
        cs.fill();
    }

    private void drawWrappedCellText(PDPageContentStream cs, PDFont font, float fontSize, String text,
                                     float x, float y, float maxW, float maxH, String align,
                                     JsonNode style) throws IOException {
        List<String> lines = wrapPdfText(text, font, fontSize, maxW);
        float lineH = fontSize * 1.35f;
        int maxLines = Math.max(1, (int) Math.floor(maxH / lineH));
        if (lines.size() > maxLines) {
            lines = new ArrayList<>(lines.subList(0, maxLines));
            String last = lines.get(maxLines - 1);
            if (last.length() > 1) lines.set(maxLines - 1, last.substring(0, last.length() - 1) + "…");
        }
        float totalH = lines.size() * lineH;
        // PDF 坐标 y 为单元格内边距底边；从顶部向下垂直居中
        float innerTop = y + maxH;
        float startY = innerTop - Math.max(0f, (maxH - totalH) / 2f) - fontSize * 0.75f;

        ReportFormColorParser.Rgb fg = ReportFormColorParser.parse(style.path("color").asText(""));
        if (fg != null) {
            cs.setNonStrokingColor(fg.rf(), fg.gf(), fg.bf());
        } else {
            cs.setNonStrokingColor(0.1f, 0.1f, 0.1f);
        }

        for (int i = 0; i < lines.size(); i++) {
            String line = ReportFormPdfText.sanitize(lines.get(i));
            if (line.isEmpty()) continue;
            float lineW = font.getStringWidth(line) / 1000f * fontSize;
            float tx = switch (align) {
                case "right" -> x + maxW - lineW;
                case "left" -> x;
                default -> x + Math.max(0, (maxW - lineW) / 2);
            };
            cs.beginText();
            cs.setFont(font, fontSize);
            cs.newLineAtOffset(tx, startY - i * lineH);
            cs.showText(line);
            cs.endText();
        }
    }

    private List<String> wrapPdfText(String text, PDFont font, float fontSize, float maxWidth) throws IOException {
        List<String> lines = new ArrayList<>();
        if (text == null || text.isBlank()) {
            lines.add("");
            return lines;
        }
        for (String paragraph : text.split("\\n", -1)) {
            if (paragraph.isEmpty()) {
                lines.add("");
                continue;
            }
            StringBuilder current = new StringBuilder();
            for (int i = 0; i < paragraph.length(); i++) {
                char ch = paragraph.charAt(i);
                String candidate = current.toString() + ch;
                float w = font.getStringWidth(ReportFormPdfText.sanitize(candidate)) / 1000f * fontSize;
                if (w > maxWidth && !current.isEmpty()) {
                    lines.add(current.toString());
                    current = new StringBuilder(String.valueOf(ch));
                } else {
                    current.append(ch);
                }
            }
            if (!current.isEmpty()) lines.add(current.toString());
        }
        return lines.isEmpty() ? List.of("") : lines;
    }

    private float pdfFontSize(JsonNode style) {
        return ReportFormColumnWidthCalculator.pdfFontSize(style);
    }

    private float sumWidths(float[] widths, int from, int to) {
        float s = 0;
        for (int i = from; i < to && i < widths.length; i++) s += widths[i];
        return s;
    }

    private byte[] emptyPdf(String message) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            PDFont font = loadSystemFont(doc, false);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(font, 12);
                cs.newLineAtOffset(50, PDRectangle.A4.getHeight() - 80);
                cs.showText(message);
                cs.endText();
            }
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            doc.save(bos);
            return bos.toByteArray();
        }
    }

    /** PDFBox 3：仅使用 .ttf，避免 .ttc 解析导致 'head' table is mandatory */
    private PDType0Font loadSystemFont(PDDocument doc, boolean bold) throws IOException {
        String[] candidates = bold
                ? new String[]{
                "C:/Windows/Fonts/simhei.ttf",
                "C:/Windows/Fonts/arialbd.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        }
                : new String[]{
                "C:/Windows/Fonts/simhei.ttf",
                "C:/Windows/Fonts/simsun.ttf",
                "C:/Windows/Fonts/arial.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                "/System/Library/Fonts/Supplemental/Arial.ttf",
        };

        for (String path : candidates) {
            File f = new File(path);
            if (!f.exists()) continue;
            try {
                return PDType0Font.load(doc, f);
            } catch (IOException e) {
                log.debug("[report-form] 字体加载失败 {}: {}", f.getAbsolutePath(), e.getMessage());
            }
        }

        throw new IOException("无法加载 PDF 中文字体（请确认 C:/Windows/Fonts/simhei.ttf 存在）");
    }

    private JsonNode parseTheme(String themeJson) {
        if (themeJson == null || themeJson.isBlank()) {
            return objectMapper.createObjectNode();
        }
        try {
            return objectMapper.readTree(themeJson);
        } catch (Exception e) {
            return objectMapper.createObjectNode();
        }
    }
}
