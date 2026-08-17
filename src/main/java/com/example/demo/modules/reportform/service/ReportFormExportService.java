package com.example.demo.modules.reportform.service;

import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.entity.ReportFormSubmission;
import com.example.demo.modules.reportform.mapper.ReportFormDefinitionMapper;
import com.example.demo.modules.reportform.mapper.ReportFormSubmissionMapper;
import com.example.demo.common.time.BusinessTimeWindow;
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
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.apache.poi.xssf.usermodel.XSSFColor;
import org.apache.poi.xssf.usermodel.XSSFFont;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.fontbox.ttf.TrueTypeCollection;
import org.apache.fontbox.ttf.TrueTypeFont;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.*;

@Service
public class ReportFormExportService {

    private static final Logger log = LoggerFactory.getLogger(ReportFormExportService.class);

    private static final float PX_TO_PT = 0.75f;

    private final ReportFormDefinitionMapper definitionMapper;
    private final ReportFormSubmissionMapper submissionMapper;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${app.pdf.font-path:}")
    private String appPdfFontPath;

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

    /** 导出空白模板网格（设计列表用，不含填报数据） */
    public byte[] exportTemplate(Long formId) throws Exception {
        ReportFormDefinition form = definitionMapper.selectById(formId);
        if (form == null) throw new RuntimeException("报表不存在");

        var layout = objectMapper.readTree(form.getLayoutJson());
        var theme = parseTheme(form.getThemeJson());

        try (Workbook wb = new XSSFWorkbook()) {
            Sheet sheet = wb.createSheet(sanitizeSheetName(form.getName()));
            writeGridToSheet(wb, sheet, layout, objectMapper.createObjectNode(), theme);
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

        return renderGridPdf(pdfExportTitle(form), layout, fieldValues, theme, pdfExportSubtitle(form, sub, false));
    }

    public byte[] exportBatchPdf(Long formId) throws Exception {
        ReportFormDefinition form = definitionMapper.selectById(formId);
        if (form == null) throw new RuntimeException("报表不存在");

        List<ReportFormSubmission> subs = submissionMapper.selectByFormId(formId);
        if (subs.isEmpty()) {
            var layout = objectMapper.readTree(form.getLayoutJson());
            var theme = parseTheme(form.getThemeJson());
            String subtitle = isWordSourceForm(form) ? "" : "暂无提交记录";
            return renderGridPdf(pdfExportTitle(form), layout, objectMapper.createObjectNode(), theme, subtitle);
        }

        ByteArrayOutputStream merged = new ByteArrayOutputStream();
        PDFMergerUtility merger = new PDFMergerUtility();
        merger.setDestinationStream(merged);
        var layout = objectMapper.readTree(form.getLayoutJson());
        var theme = parseTheme(form.getThemeJson());
        for (ReportFormSubmission sub : subs) {
            var fieldValues = objectMapper.readTree(sub.getFieldValuesJson() != null ? sub.getFieldValuesJson() : "{}");
            byte[] singlePdf = renderGridPdf(pdfExportTitle(form), layout, fieldValues, theme,
                    pdfExportSubtitle(form, sub, true));
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
            xlCell.setCellStyle(buildExcelCellStyle(wb, cell.path("style"), theme, styleCache));

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
            JsonNode fieldDef = fields.path(fk);
            if (fieldDef.has("type") && "STATIC".equals(fieldDef.path("type").asText())) {
                return fieldDef.path("label").asText("");
            }
            if (fk.isEmpty() || fieldValues == null || !fieldValues.has(fk)) return "";
            return ReportFormFieldValueFormatter.format(fieldDef, fieldValues.get(fk));
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

    private CellStyle buildExcelCellStyle(Workbook wb, JsonNode styleNode, JsonNode theme, Map<String, CellStyle> cache) {
        String styleKey = (styleNode == null ? "{}" : styleNode.toString()) + "|" + theme.path("defaultAlign").asText("center");
        if (cache.containsKey(styleKey)) return cache.get(styleKey);

        XSSFCellStyle cs = (XSSFCellStyle) wb.createCellStyle();
        Font font = wb.createFont();
        font.setFontHeightInPoints((short) Math.max(9, styleNode.path("fontSize").asInt(11)));
        if (styleNode.path("bold").asBoolean(false)) font.setBold(true);
        cs.setFont(font);
        cs.setWrapText(true);
        cs.setVerticalAlignment(VerticalAlignment.CENTER);

        String align = resolveCellAlign(styleNode, theme);
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

        cache.put(styleKey, cs);
        return cs;
    }

    private String resolveCellAlign(JsonNode styleNode, JsonNode theme) {
        if (styleNode != null && styleNode.hasNonNull("align")) {
            String align = styleNode.path("align").asText("").trim();
            if (!align.isEmpty()) {
                return align;
            }
        }
        return theme.path("defaultAlign").asText("center");
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

    /** Word 导入报表：模板内已有标题/页眉，PDF 打印不再叠加系统标题与提交元信息 */
    private static boolean isWordSourceForm(ReportFormDefinition form) {
        return form.getSource() != null && "word".equalsIgnoreCase(form.getSource());
    }

    private static String pdfExportTitle(ReportFormDefinition form) {
        return isWordSourceForm(form) ? "" : form.getName();
    }

    private static String pdfExportSubtitle(ReportFormDefinition form, ReportFormSubmission sub, boolean batchMode) {
        if (isWordSourceForm(form)) {
            return "";
        }
        if (batchMode) {
            return "提交 #" + sub.getId() + "  |  用户 #" + sub.getUserId();
        }
        return "填写人 #" + sub.getUserId() + "  |  "
                + (sub.getSubmittedAt() != null
                ? BusinessTimeWindow.toDisplayWallClock(sub.getSubmittedAt())
                : "未提交");
    }

    /** Word 导入报表：PDF 打印页眉/页脚行（与 Word docx 模板分区一致） */
    private int[] resolveWordPrintRegion(JsonNode layout, JsonNode theme, int maxRow) {
        int headerEnd = theme.path("printHeaderRowEnd").asInt(0);
        int footerStart = theme.path("printFooterRowStart").asInt(maxRow);
        if (headerEnd <= 0) {
            headerEnd = layout.path("wordPrintHeaderRowEnd").asInt(0);
        }
        if (layout.has("wordPrintFooterRowStart")) {
            footerStart = layout.path("wordPrintFooterRowStart").asInt(footerStart);
        }
        if (headerEnd <= 0) {
            headerEnd = inferWordHeaderRowEnd(layout, maxRow, footerStart);
        }
        headerEnd = Math.max(0, Math.min(headerEnd, maxRow));
        footerStart = Math.max(headerEnd, Math.min(footerStart, maxRow));
        return new int[]{headerEnd, footerStart};
    }

    /** 首个可填报字段行之前视为 Word 页眉区（兼容旧数据无 printHeaderRowEnd） */
    private int inferWordHeaderRowEnd(JsonNode layout, int maxRow, int footerStart) {
        JsonNode cells = layout.path("cells");
        if (!cells.isArray()) return 0;
        int firstFillRow = maxRow;
        JsonNode fields = layout.path("fields");
        for (JsonNode cell : cells) {
            if (!"field".equals(cell.path("kind").asText())) continue;
            String fk = cell.path("fieldKey").asText("");
            if (fk.isEmpty()) continue;
            JsonNode fieldDef = fields.path(fk);
            String type = fieldDef.path("type").asText("TEXT");
            if ("STATIC".equals(type)) continue;
            if (fieldDef.has("editableInFill") && !fieldDef.path("editableInFill").asBoolean(true)) continue;
            firstFillRow = Math.min(firstFillRow, cell.path("row").asInt());
        }
        if (firstFillRow <= 0 || firstFillRow >= footerStart) return 0;
        return firstFillRow;
    }

    // ──────────── PDF 网格渲染（A4 标准页、适应页宽、完整内容不截断） ────────────

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

        int[] printRegion = resolveWordPrintRegion(layout, theme, maxRow);
        int wordBodyStart = printRegion[0];
        int wordBodyEnd = printRegion[1];
        boolean wordBodyOnlyPrint = theme.path("pageContentWidthPx").asInt(0) > 0;

        // Word 导入：PDF 只打印正文区；页眉/页脚保留在 docx 模板，不重复画进 PDF 表格
        int headerRowEnd = wordBodyOnlyPrint ? 0 : printRegion[0];
        int footerRowStart = wordBodyOnlyPrint ? maxRow : printRegion[1];
        int sliceStartRow = wordBodyOnlyPrint ? wordBodyStart : printRegion[0];
        int sliceEndRow = wordBodyOnlyPrint ? wordBodyEnd : printRegion[1];

        try (PDDocument doc = new PDDocument()) {
            PDFont font = loadCjkFont(doc, false);
            PDFont boldFont = loadCjkFont(doc, true);
            Map<String, PDImageXObject> imageCache = new HashMap<>();

            java.util.function.Function<JsonNode, String> textOf =
                    cell -> resolveCellText(cell, layout, fieldValues);
            int pageContentPx = theme.path("pageContentWidthPx").asInt(0);
            boolean forcePortrait = theme.path("printPortrait").asBoolean(false) || pageContentPx > 0;

            int[] colPx;
            if (pageContentPx > 0) {
                // Word：以导入时页宽为准，避免填报长文本把列撑宽后误判横向
                colPx = ReportFormColumnWidthCalculator.readThemeColumnWidthsPx(theme, maxCol);
                colPx = ReportFormColumnWidthCalculator.capTotalWidthPx(colPx, pageContentPx);
            } else {
                colPx = ReportFormColumnWidthCalculator.resolveExportColumnWidthsPx(
                        theme, cells, layout, maxCol, textOf);
            }
            float[] colWidths = ReportFormColumnWidthCalculator.toPdfPoints(colPx);
            if (pageContentPx <= 0) {
                colWidths = ReportFormColumnWidthCalculator.refinePdfColumnWidths(
                        colWidths, cells, textOf, font, boldFont);
            }

            float[] rowHeights = computePdfRowHeights(
                    theme, cells, layout, fieldValues, colWidths, font, boldFont);
            float tableWidth = sumWidths(colWidths, 0, colWidths.length);
            float tableHeight = wordBodyOnlyPrint
                    ? ReportFormPdfPageLayout.sumRows(rowHeights, sliceStartRow, sliceEndRow)
                    : ReportFormPdfPageLayout.sumRows(rowHeights, 0, maxRow);

            if (pageContentPx > 0) {
                float maxTablePt = pageContentPx * PX_TO_PT;
                if (tableWidth > maxTablePt + 0.5f) {
                    float fix = maxTablePt / tableWidth;
                    colWidths = scaleFloatArray(colWidths, fix);
                    rowHeights = scaleFloatArray(rowHeights, fix);
                    tableWidth = maxTablePt;
                }
            }

            boolean hasTitleBand = (title != null && !title.isBlank())
                    || (subtitle != null && !subtitle.isBlank());
            ReportFormPdfPageLayout.Plan plan = ReportFormPdfPageLayout.plan(
                    tableWidth, tableHeight, rowHeights, maxRow,
                    headerRowEnd, footerRowStart, hasTitleBand, forcePortrait);

            float fitScale = plan.fitScale();
            float[] drawColWidths = scaleFloatArray(colWidths, fitScale);
            float[] drawRowHeights = scaleFloatArray(rowHeights, fitScale);
            float scaledTableWidth = sumWidths(drawColWidths, 0, drawColWidths.length);

            // 二次保险：任何情况下表格不得超出可打印宽度
            if (scaledTableWidth > plan.contentWidth() + 0.5f) {
                float fix = plan.contentWidth() / scaledTableWidth;
                drawColWidths = scaleFloatArray(drawColWidths, fix);
                drawRowHeights = scaleFloatArray(drawRowHeights, fix);
                fitScale *= fix;
                scaledTableWidth = sumWidths(drawColWidths, 0, drawColWidths.length);
            }

            float gridLeft = ReportFormPdfPageLayout.MARGIN
                    + Math.max(0f, (plan.contentWidth() - scaledTableWidth) / 2f);

            List<ReportFormPdfPageLayout.BodySlice> bodySlices = ReportFormPdfPageLayout.sliceBody(
                    drawRowHeights, plan.bodyAreaHeight(),
                    sliceStartRow, sliceEndRow, maxRow, cells);
            int totalPages = bodySlices.size();

            for (int pageIdx = 0; pageIdx < totalPages; pageIdx++) {
                ReportFormPdfPageLayout.BodySlice bodySlice = bodySlices.get(pageIdx);
                PDPage page = new PDPage(plan.pageSize());
                doc.addPage(page);
                float pageHeight = plan.pageSize().getHeight();

                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    float yCursor = pageHeight - ReportFormPdfPageLayout.MARGIN;
                    yCursor = drawPdfTitleBand(cs, font, boldFont, title, subtitle, pageIdx, totalPages, yCursor);

                    if (!wordBodyOnlyPrint) {
                        float headerH = ReportFormPdfPageLayout.sumRows(drawRowHeights, 0, headerRowEnd);
                        if (headerRowEnd > 0) {
                            drawCellRegion(cs, doc, font, boldFont, imageCache, cells, layout, fieldValues, theme,
                                    drawColWidths, drawRowHeights, gridLeft, yCursor,
                                    0, headerRowEnd, 0, headerRowEnd, fitScale);
                            yCursor -= headerH;
                        }
                    }

                    drawCellRegion(cs, doc, font, boldFont, imageCache, cells, layout, fieldValues, theme,
                            drawColWidths, drawRowHeights, gridLeft, yCursor,
                            bodySlice.startRow(), bodySlice.endRow(),
                            bodySlice.startRow(), bodySlice.endRow(), fitScale);

                    if (!wordBodyOnlyPrint && footerRowStart < maxRow) {
                        float footerH = ReportFormPdfPageLayout.sumRows(drawRowHeights, footerRowStart, maxRow);
                        float footerGridTop = ReportFormPdfPageLayout.MARGIN
                                + ReportFormPdfPageLayout.PAGE_NUM_BAND + footerH;
                        drawCellRegion(cs, doc, font, boldFont, imageCache, cells, layout, fieldValues, theme,
                                drawColWidths, drawRowHeights, gridLeft, footerGridTop,
                                footerRowStart, maxRow, footerRowStart, maxRow, fitScale);
                    }

                    if (!wordBodyOnlyPrint || totalPages > 1) {
                        drawPdfPageNumber(cs, font, pageIdx + 1, totalPages, plan.pageSize().getWidth());
                    }
                }
            }

            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            doc.save(bos);
            return bos.toByteArray();
        }
    }

    private float drawPdfTitleBand(PDPageContentStream cs, PDFont font, PDFont boldFont,
                                   String title, String subtitle,
                                   int pageIdx, int totalPages, float yCursor) throws IOException {
        boolean hasTitle = title != null && !title.isBlank();
        boolean hasSub = subtitle != null && !subtitle.isBlank();
        if (!hasTitle && !hasSub) {
            return yCursor;
        }
        if (pageIdx == 0) {
            if (hasTitle) {
                cs.beginText();
                cs.setFont(boldFont, 11);
                cs.newLineAtOffset(ReportFormPdfPageLayout.MARGIN, yCursor);
                cs.showText(ReportFormPdfText.safe(title));
                cs.endText();
                yCursor -= 16;
            }
            if (hasSub) {
                cs.beginText();
                cs.setFont(font, 8);
                cs.newLineAtOffset(ReportFormPdfPageLayout.MARGIN, yCursor);
                cs.showText(ReportFormPdfText.safe(subtitle));
                cs.endText();
                yCursor -= 12;
            }
        } else if (hasTitle) {
            cs.beginText();
            cs.setFont(font, 8);
            cs.newLineAtOffset(ReportFormPdfPageLayout.MARGIN, yCursor);
            cs.showText(ReportFormPdfText.safe(title + "（续 " + (pageIdx + 1) + "/" + totalPages + "）"));
            cs.endText();
            yCursor -= 14;
        }
        return yCursor;
    }

    private void drawPdfPageNumber(PDPageContentStream cs, PDFont font,
                                   int pageNum, int totalPages, float pageWidth) throws IOException {
        String label = "第 " + pageNum + " / " + totalPages + " 页";
        float fontSize = 8f;
        float w = font.getStringWidth(ReportFormPdfText.safe(label)) / 1000f * fontSize;
        cs.beginText();
        cs.setFont(font, fontSize);
        cs.setNonStrokingColor(0.45f, 0.45f, 0.45f);
        cs.newLineAtOffset((pageWidth - w) / 2f, ReportFormPdfPageLayout.MARGIN * 0.35f);
        cs.showText(ReportFormPdfText.safe(label));
        cs.endText();
    }

    /**
     * 绘制行区间 [visibleStart,visibleEnd)；坐标按 sliceStart/sliceEnd 裁剪跨页合并格。
     */
    private void drawCellRegion(PDPageContentStream cs, PDDocument doc,
                                PDFont font, PDFont boldFont,
                                Map<String, PDImageXObject> imageCache,
                                List<JsonNode> cells, JsonNode layout, JsonNode fieldValues,
                                JsonNode theme,
                                float[] colWidths, float[] rowHeights,
                                float gridLeft, float gridTop,
                                int visibleStart, int visibleEnd,
                                int sliceStart, int sliceEnd,
                                float fitScale) throws IOException {
        if (visibleEnd <= visibleStart) return;

        float yOffset = ReportFormPdfPageLayout.sumRows(rowHeights, 0, sliceStart);
        float pad = 3f * fitScale;
        List<JsonNode> inRegion = new ArrayList<>();
        for (JsonNode cell : cells) {
            int r = cell.path("row").asInt();
            int rowSpan = Math.max(1, cell.path("rowSpan").asInt(1));
            if (r + rowSpan <= visibleStart || r >= visibleEnd) continue;
            inRegion.add(cell);
        }

        for (JsonNode cell : inRegion) {
            int r = cell.path("row").asInt();
            int c = cell.path("col").asInt();
            int colSpan = Math.max(1, cell.path("colSpan").asInt(1));
            int rowSpan = Math.max(1, cell.path("rowSpan").asInt(1));
            int cellEndRow = r + rowSpan;

            float x = gridLeft + sumWidths(colWidths, 0, c);
            float w = sumWidths(colWidths, c, c + colSpan);
            float cellTop = gridTop - (ReportFormPdfPageLayout.sumRows(rowHeights, 0, r) - yOffset);
            float h = ReportFormPdfPageLayout.sumRows(rowHeights, r, Math.min(cellEndRow, sliceEnd));
            if (r < sliceStart) {
                cellTop += ReportFormPdfPageLayout.sumRows(rowHeights, r, sliceStart);
                h -= ReportFormPdfPageLayout.sumRows(rowHeights, r, sliceStart);
            }
            if (cellEndRow > sliceEnd) {
                h -= ReportFormPdfPageLayout.sumRows(rowHeights, sliceEnd, cellEndRow);
            }
            float y = cellTop - h;
            if (h < 0.5f || w < 0.5f) continue;

            JsonNode style = cell.path("style");
            fillPdfCellBackground(cs, x, y, w, h, style);
        }

        cs.setLineWidth(Math.max(0.25f, 0.35f * fitScale));
        cs.setStrokingColor(0.55f, 0.55f, 0.55f);
        for (JsonNode cell : inRegion) {
            float[] rect = cellRect(cell, colWidths, rowHeights, gridLeft, gridTop,
                    visibleStart, visibleEnd, sliceStart, sliceEnd);
            if (rect == null) continue;
            cs.addRect(rect[0], rect[1], rect[2], rect[3]);
            cs.stroke();
        }

        for (JsonNode cell : inRegion) {
            float[] rect = cellRect(cell, colWidths, rowHeights, gridLeft, gridTop,
                    visibleStart, visibleEnd, sliceStart, sliceEnd);
            if (rect == null) continue;
            float x = rect[0];
            float y = rect[1];
            float w = rect[2];
            float h = rect[3];

            JsonNode style = cell.path("style");
            String imageSrc = style.path("imageSrc").asText("");
            if (!imageSrc.isBlank()) {
                drawPdfCellImage(cs, doc, imageCache, imageSrc, x + pad, y + pad, w - pad * 2, h - pad * 2);
            }

            String text = resolveCellText(cell, layout, fieldValues);
            if (text.isBlank()) continue;

            float fontSize = pdfFontSize(style) * fitScale;
            PDFont f = style.path("bold").asBoolean(false) ? boldFont : font;
            drawWrappedCellText(cs, f, fontSize, text, x + pad, y + pad, w - pad * 2, h - pad * 2,
                    resolveCellAlign(style, theme), style);
        }
    }

    private float[] cellRect(JsonNode cell, float[] colWidths, float[] rowHeights,
                             float gridLeft, float gridTop,
                             int visibleStart, int visibleEnd,
                             int sliceStart, int sliceEnd) {
        int r = cell.path("row").asInt();
        int c = cell.path("col").asInt();
        int colSpan = Math.max(1, cell.path("colSpan").asInt(1));
        int rowSpan = Math.max(1, cell.path("rowSpan").asInt(1));
        int cellEndRow = r + rowSpan;

        float yOffset = ReportFormPdfPageLayout.sumRows(rowHeights, 0, sliceStart);
        float x = gridLeft + sumWidths(colWidths, 0, c);
        float w = sumWidths(colWidths, c, c + colSpan);
        float cellTop = gridTop - (ReportFormPdfPageLayout.sumRows(rowHeights, 0, r) - yOffset);
        float h = ReportFormPdfPageLayout.sumRows(rowHeights, r, Math.min(cellEndRow, sliceEnd));
        if (r < sliceStart) {
            cellTop += ReportFormPdfPageLayout.sumRows(rowHeights, r, sliceStart);
            h -= ReportFormPdfPageLayout.sumRows(rowHeights, r, sliceStart);
        }
        if (cellEndRow > sliceEnd) {
            h -= ReportFormPdfPageLayout.sumRows(rowHeights, sliceEnd, cellEndRow);
        }
        float y = cellTop - h;
        if (h < 0.5f || w < 0.5f) return null;
        return new float[]{x, y, w, h};
    }

    private void drawPdfCellImage(PDPageContentStream cs, PDDocument doc,
                                  Map<String, PDImageXObject> cache,
                                  String imageSrc, float x, float y, float maxW, float maxH) throws IOException {
        if (maxW < 2 || maxH < 2) return;
        PDImageXObject img = cache.get(imageSrc);
        if (img == null) {
            byte[] bytes = decodeDataUri(imageSrc);
            if (bytes == null || bytes.length == 0) return;
            img = PDImageXObject.createFromByteArray(doc, bytes, "cell-img");
            cache.put(imageSrc, img);
        }
        float iw = img.getWidth();
        float ih = img.getHeight();
        if (iw <= 0 || ih <= 0) return;
        float scale = Math.min(maxW / iw, maxH / ih);
        float dw = iw * scale;
        float dh = ih * scale;
        float dx = x + (maxW - dw) / 2f;
        float dy = y + (maxH - dh) / 2f;
        cs.drawImage(img, dx, dy, dw, dh);
    }

    private byte[] decodeDataUri(String src) {
        if (src == null || src.isBlank()) return null;
        String s = src.trim();
        int comma = s.indexOf(',');
        if (s.startsWith("data:") && comma > 0) {
            s = s.substring(comma + 1);
        }
        try {
            return Base64.getDecoder().decode(s.replaceAll("\\s", ""));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private float[] scaleFloatArray(float[] src, float scale) {
        float[] out = new float[src.length];
        for (int i = 0; i < src.length; i++) {
            out[i] = src[i] * scale;
        }
        return out;
    }

    /** 读取设计器 theme.rowHeights（px）作为 PDF 行高下限 */
    private float[] readThemeRowHeightsPt(JsonNode theme, int maxRow) {
        float[] heights = new float[maxRow];
        Arrays.fill(heights, 18f);
        JsonNode stored = theme.path("rowHeights");
        if (!stored.isObject()) return heights;
        var iter = stored.fields();
        while (iter.hasNext()) {
            var e = iter.next();
            try {
                int r = Integer.parseInt(e.getKey());
                if (r >= 0 && r < maxRow) {
                    heights[r] = Math.max(heights[r], e.getValue().asInt(36) * PX_TO_PT);
                }
            } catch (NumberFormatException ignored) {
                // skip invalid key
            }
        }
        return heights;
    }

    private float[] computePdfRowHeights(JsonNode theme, List<JsonNode> cells, JsonNode layout,
                                           JsonNode fieldValues, float[] colWidths,
                                           PDFont font, PDFont boldFont) throws IOException {
        int maxRow = 0;
        for (JsonNode cell : cells) {
            maxRow = Math.max(maxRow, cell.path("row").asInt() + cell.path("rowSpan").asInt(1));
        }
        float[] rowHeights = readThemeRowHeightsPt(theme, maxRow);

        for (JsonNode cell : cells) {
            int r = cell.path("row").asInt();
            int c = cell.path("col").asInt();
            int colSpan = Math.max(1, cell.path("colSpan").asInt(1));
            int rowSpan = Math.max(1, cell.path("rowSpan").asInt(1));
            float cellW = sumWidths(colWidths, c, c + colSpan) - 6;
            if (cellW < 8) cellW = 8;

            String text = resolveCellText(cell, layout, fieldValues);
            if (text.isBlank()) continue;

            JsonNode style = cell.path("style");
            float fontSize = pdfFontSize(style);
            PDFont f = style.path("bold").asBoolean(false) ? boldFont : font;
            List<String> lines = wrapPdfText(text, f, fontSize, cellW);
            float lineH = fontSize * 1.4f;
            float needed = lines.size() * lineH + 8;
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
        float lineH = fontSize * 1.4f;
        float totalH = lines.size() * lineH;
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
            float lineY = startY - i * lineH;
            if (lineY < y) break;
            float lineW = font.getStringWidth(line) / 1000f * fontSize;
            float tx = switch (align) {
                case "right" -> x + maxW - lineW;
                case "left" -> x;
                default -> x + Math.max(0, (maxW - lineW) / 2);
            };
            cs.beginText();
            cs.setFont(font, fontSize);
            cs.newLineAtOffset(tx, lineY);
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
            PDFont font = loadCjkFont(doc, false);
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

    private PDFont loadCjkFont(PDDocument doc, boolean bold) throws IOException {
        String configured = appPdfFontPath == null ? "" : appPdfFontPath.trim();
        if (!configured.isEmpty()) {
            File f = new File(configured);
            if (f.isFile()) {
                PDFont loaded = loadCjkFontFromFile(doc, f);
                if (loaded != null) return loaded;
            }
        }
        try (InputStream in = getClass().getResourceAsStream("/fonts/NotoSansSC-Regular.ttf")) {
            if (in != null) {
                return PDType0Font.load(doc, in, true);
            }
        }
        String[] candidates = bold
                ? new String[]{
                "C:/Windows/Fonts/msyhbd.ttf",
                "C:/Windows/Fonts/simhei.ttf",
                "C:/Windows/Fonts/msyh.ttc",
                "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
                "/System/Library/Fonts/PingFang.ttc",
        }
                : new String[]{
                "C:/Windows/Fonts/msyh.ttc",
                "C:/Windows/Fonts/msyh.ttf",
                "C:/Windows/Fonts/simsun.ttc",
                "C:/Windows/Fonts/simsun.ttf",
                "C:/Windows/Fonts/simhei.ttf",
                "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
                "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
                "/System/Library/Fonts/PingFang.ttc",
        };

        for (String path : candidates) {
            File f = new File(path);
            if (!f.isFile()) continue;
            PDFont loaded = loadCjkFontFromFile(doc, f);
            if (loaded != null) return loaded;
        }

        throw new IOException("无法加载 PDF 中文字体，请配置 app.pdf.font-path 或安装微软雅黑/思源字体");
    }

    private PDFont loadCjkFontFromFile(PDDocument doc, File file) {
        try {
            String name = file.getName().toLowerCase(Locale.ROOT);
            if (name.endsWith(".ttc")) {
                try (TrueTypeCollection ttc = new TrueTypeCollection(file)) {
                    final TrueTypeFont[] first = new TrueTypeFont[1];
                    ttc.processAllFonts(ttf -> {
                        if (first[0] == null) first[0] = ttf;
                    });
                    if (first[0] != null) {
                        return PDType0Font.load(doc, first[0], true);
                    }
                }
                return null;
            }
            if (name.endsWith(".ttf") || name.endsWith(".otf")) {
                try (FileInputStream in = new FileInputStream(file)) {
                    return PDType0Font.load(doc, in, true);
                }
            }
        } catch (IOException e) {
            log.debug("[report-form] 字体加载失败 {}: {}", file.getAbsolutePath(), e.getMessage());
        }
        return null;
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
