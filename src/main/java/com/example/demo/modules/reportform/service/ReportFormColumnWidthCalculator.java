package com.example.demo.modules.reportform.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.poi.ss.usermodel.Sheet;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.function.Function;

/** 导出时按单元格内容与填报值自动估算列宽（与前端 gridColumnWidths.ts 对齐） */
final class ReportFormColumnWidthCalculator {

    private static final int CELL_PADDING_PX = 16;
    private static final int DEFAULT_COL_PX = 40;
    private static final float PDF_MIN_COL_PT = 28f;
    private static final float PX_TO_PT = 0.75f;
    private static final float PDF_CELL_PADDING_PT = 8f;

    private ReportFormColumnWidthCalculator() {}

    static int[] computeColumnWidthsPx(List<JsonNode> cells, int maxCol,
                                       Function<JsonNode, String> cellText) {
        int[] widths = new int[maxCol];
        Arrays.fill(widths, DEFAULT_COL_PX);

        for (JsonNode cell : cells) {
            String text = cellText.apply(cell);
            if (text == null || text.isBlank()) continue;

            JsonNode style = cell.path("style");
            int fontSize = Math.max(9, style.path("fontSize").asInt(11));
            boolean bold = style.path("bold").asBoolean(false);
            int required = longestLineWidthPx(text, fontSize, bold) + CELL_PADDING_PX;

            int start = cell.path("col").asInt();
            int span = Math.max(1, cell.path("colSpan").asInt(1));
            int end = Math.min(maxCol, start + span);
            if (start >= maxCol) continue;

            if (span == 1) {
                int floor = minColWidth(text, fontSize);
                widths[start] = Math.max(widths[start], Math.max(required, floor));
                continue;
            }

            int spanSum = 0;
            for (int c = start; c < end; c++) spanSum += widths[c];
            if (spanSum >= required) continue;

            int deficit = required - spanSum;
            double addPerCol = (double) deficit / span;
            int floor = minColWidth(text, fontSize);
            for (int c = start; c < end; c++) {
                widths[c] = Math.max((int) Math.ceil(widths[c] + addPerCol), floor);
            }
        }
        return widths;
    }

    /** 读取 theme 中设计器保存的列宽（px），无则 40 — 与 FormGridEditor 一致 */
    static int[] readThemeColumnWidthsPx(JsonNode theme, int maxCol) {
        int[] widths = new int[maxCol];
        JsonNode stored = theme.path("columnWidths");
        for (int c = 0; c < maxCol; c++) {
            widths[c] = stored.has(String.valueOf(c)) ? stored.get(String.valueOf(c)).asInt(40) : DEFAULT_COL_PX;
        }
        return widths;
    }

    /** 设计器布局列宽：静态文本 + 字段标签（不含填报值） */
    static int[] computeLayoutColumnWidthsPx(List<JsonNode> cells, JsonNode layout, int maxCol) {
        return computeColumnWidthsPx(cells, maxCol, cell -> resolveLayoutLabel(cell, layout));
    }

    /**
     * 导出列宽 = max(theme 保存, 设计布局, 填报值)，与前端 mergeColumnWidths 逻辑对齐，
     * 并保证长填报值不会溢出。
     */
    static int[] resolveExportColumnWidthsPx(JsonNode theme, List<JsonNode> cells, JsonNode layout,
                                             int maxCol, Function<JsonNode, String> valueText) {
        int[] themeW = readThemeColumnWidthsPx(theme, maxCol);
        int[] layoutW = computeLayoutColumnWidthsPx(cells, layout, maxCol);
        int[] valueW = computeColumnWidthsPx(cells, maxCol, valueText);
        int[] merged = new int[maxCol];
        for (int c = 0; c < maxCol; c++) {
            merged[c] = Math.max(Math.max(themeW[c], layoutW[c]), valueW[c]);
        }
        return merged;
    }

    private static String resolveLayoutLabel(JsonNode cell, JsonNode layout) {
        String kind = cell.path("kind").asText("static");
        String fk = cell.path("fieldKey").asText("");
        if ("field".equals(kind) && !fk.isEmpty()) {
            String label = layout.path("fields").path(fk).path("label").asText("");
            return label.isEmpty() ? fk : label;
        }
        return cell.path("staticText").asText("");
    }

    /** @deprecated 使用 resolveExportColumnWidthsPx */
    static int[] mergeWithTheme(int[] computed, JsonNode theme, int maxCol) {
        int[] merged = Arrays.copyOf(computed, maxCol);
        JsonNode stored = theme.path("columnWidths");
        for (int c = 0; c < maxCol; c++) {
            if (stored.has(String.valueOf(c))) {
                merged[c] = Math.max(merged[c], stored.get(String.valueOf(c)).asInt(40));
            }
        }
        return merged;
    }

    static float[] toPdfPoints(int[] pxWidths) {
        float[] pt = new float[pxWidths.length];
        for (int i = 0; i < pxWidths.length; i++) {
            pt[i] = Math.max(PDF_MIN_COL_PT, pxWidths[i] * PX_TO_PT);
        }
        return pt;
    }

    /** 用 PDF 字体精确测量，进一步撑开仍不够的列 */
    static float[] refinePdfColumnWidths(float[] colWidths, List<JsonNode> cells,
                                         Function<JsonNode, String> cellText,
                                         PDFont font, PDFont boldFont) throws IOException {
        float[] widths = Arrays.copyOf(colWidths, colWidths.length);
        for (JsonNode cell : cells) {
            String text = cellText.apply(cell);
            if (text == null || text.isBlank()) continue;

            JsonNode style = cell.path("style");
            float fontSize = pdfFontSize(style);
            PDFont f = style.path("bold").asBoolean(false) ? boldFont : font;

            float maxLineW = 0;
            for (String line : text.split("\\n", -1)) {
                String safe = ReportFormPdfText.sanitize(line);
                if (safe.isEmpty()) continue;
                maxLineW = Math.max(maxLineW, f.getStringWidth(safe) / 1000f * fontSize);
            }
            float required = maxLineW + PDF_CELL_PADDING_PT;

            int start = cell.path("col").asInt();
            int span = Math.max(1, cell.path("colSpan").asInt(1));
            int end = Math.min(widths.length, start + span);
            if (start >= widths.length) continue;

            float spanSum = 0;
            for (int c = start; c < end; c++) spanSum += widths[c];
            if (spanSum >= required) continue;

            float deficit = required - spanSum;
            float add = deficit / span;
            for (int c = start; c < end; c++) {
                widths[c] = Math.max(widths[c] + add, PDF_MIN_COL_PT);
            }
        }
        return widths;
    }

    static void applyToExcelSheet(Sheet sheet, int[] pxWidths) {
        for (int c = 0; c < pxWidths.length; c++) {
            int excelWidth = (int) Math.min(65280, Math.max(2000, pxWidths[c] * 256.0 / 7.0));
            sheet.setColumnWidth(c, excelWidth);
        }
    }

    /** 按列宽估算换行后的行数，用于 Excel 行高 */
    static float[] estimateRowLineCounts(List<JsonNode> cells, int maxRow, int[] colPxWidths,
                                         Function<JsonNode, String> cellText) {
        float[] rowLines = new float[maxRow];
        for (JsonNode cell : cells) {
            int r = cell.path("row").asInt();
            int c = cell.path("col").asInt();
            int colSpan = Math.max(1, cell.path("colSpan").asInt(1));
            int rowSpan = Math.max(1, cell.path("rowSpan").asInt(1));

            String text = cellText.apply(cell);
            if (text == null || text.isBlank()) continue;

            int fontSize = Math.max(9, cell.path("style").path("fontSize").asInt(11));
            int cellWidthPx = sumPx(colPxWidths, c, Math.min(colPxWidths.length, c + colSpan)) - CELL_PADDING_PX;
            cellWidthPx = Math.max(cellWidthPx, fontSize * 2);

            int lines = estimateWrappedLines(text, fontSize, cellWidthPx);
            float perRow = (float) lines / rowSpan;
            for (int dr = 0; dr < rowSpan && r + dr < maxRow; dr++) {
                rowLines[r + dr] = Math.max(rowLines[r + dr], perRow);
            }
        }
        return rowLines;
    }

    private static int estimateWrappedLines(String text, int fontSize, int cellWidthPx) {
        int total = 0;
        for (String paragraph : text.split("\\n", -1)) {
            if (paragraph.isEmpty()) {
                total++;
                continue;
            }
            int lineW = 0;
            int lines = 1;
            for (int i = 0; i < paragraph.length(); i++) {
                char ch = paragraph.charAt(i);
                lineW += charWidthPx(ch, fontSize);
                if (lineW > cellWidthPx) {
                    lines++;
                    lineW = charWidthPx(ch, fontSize);
                }
            }
            total += lines;
        }
        return Math.max(1, total);
    }

    private static int sumPx(int[] widths, int from, int to) {
        int s = 0;
        for (int i = from; i < to && i < widths.length; i++) s += widths[i];
        return s;
    }

    private static int minColWidth(String text, int fontSize) {
        if (text == null || text.length() <= 3) {
            return Math.max(28, (int) Math.ceil(fontSize * 1.4) + CELL_PADDING_PX);
        }
        return 40;
    }

    private static int longestLineWidthPx(String text, int fontSize, boolean bold) {
        int max = 0;
        for (String line : text.split("\\n", -1)) {
            max = Math.max(max, lineWidthPx(line, fontSize, bold));
        }
        return max;
    }

    private static int lineWidthPx(String text, int fontSize, boolean bold) {
        double width = 0;
        for (int i = 0; i < text.length(); i++) {
            width += charWidthPx(text.charAt(i), fontSize);
        }
        if (bold) width *= 1.05;
        return (int) Math.ceil(width);
    }

    private static int charWidthPx(char ch, int fontSize) {
        return isCjk(ch) ? fontSize : (int) Math.ceil(fontSize * 0.55);
    }

    private static boolean isCjk(char ch) {
        return (ch >= 0x4e00 && ch <= 0x9fff)
                || (ch >= 0x3400 && ch <= 0x4dbf)
                || (ch >= 0xff00 && ch <= 0xffef);
    }

    static float pdfFontSize(JsonNode style) {
        int fs = style.path("fontSize").asInt(11);
        return Math.min(24f, Math.max(8f, fs));
    }
}
