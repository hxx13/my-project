package com.example.demo.modules.reportform.service;

import org.apache.pdfbox.pdmodel.common.PDRectangle;

import java.util.ArrayList;
import java.util.List;

/** PDF 分页与方向：按表格宽高比与 A4 可打印区自动选纵向/横向，并支持 Word 页眉页脚行重复。 */
final class ReportFormPdfPageLayout {

    static final float MARGIN = 36f;
    static final float PAGE_NUM_BAND = 16f;

    private ReportFormPdfPageLayout() {}

    record BodySlice(int startRow, int endRow) {}

    record Plan(
            PDRectangle pageSize,
            boolean landscape,
            float contentWidth,
            float bodyAreaHeight,
            float titleBandFirstPage,
            float titleBandOtherPages,
            float fitScale,
            int headerRowEnd,
            int footerRowStart,
            int maxRow
    ) {}

    static Plan plan(float tableWidthPt, float tableHeightPt, float[] rowHeights,
                       int maxRow, int headerRowEnd, int footerRowStart,
                       boolean hasSubtitle, boolean forcePortrait) {
        float titleFirst = hasSubtitle ? 50f : 0f;
        float titleOther = hasSubtitle ? 14f : 0f;

        float pW = PDRectangle.A4.getWidth() - MARGIN * 2;
        float lW = PDRectangle.A4.getHeight() - MARGIN * 2;

        float headerH = sumRows(rowHeights, 0, headerRowEnd);
        float footerH = sumRows(rowHeights, footerRowStart, maxRow);

        // 纵向分页：仅按页宽缩放，不按整表总高度压缩（避免 Word/长表畸形缩小）
        float scalePortrait = Math.min(1f, pW / Math.max(1f, tableWidthPt));
        float scaleLandscape = Math.min(1f, lW / Math.max(1f, tableWidthPt));

        boolean landscape = forcePortrait ? false : chooseLandscape(
                tableWidthPt, tableHeightPt, headerH, footerH, pW, lW, scalePortrait, scaleLandscape);

        PDRectangle page = landscape
                ? new PDRectangle(PDRectangle.A4.getHeight(), PDRectangle.A4.getWidth())
                : PDRectangle.A4;
        float contentW = page.getWidth() - MARGIN * 2;
        float printableH = page.getHeight() - MARGIN * 2 - PAGE_NUM_BAND;

        // 必须完整落入页宽（类似 WPS「适应页面宽度」），禁止为保字号而放大导致裁切
        float fitScale = Math.min(1f, contentW / Math.max(1f, tableWidthPt));

        float bodyArea = printableH - titleFirst - (headerH + footerH) * fitScale;
        bodyArea = Math.max(48f, bodyArea);

        return new Plan(page, landscape, contentW, bodyArea, titleFirst, titleOther, fitScale,
                headerRowEnd, footerRowStart, maxRow);
    }

    private static boolean chooseLandscape(float tableW, float tableH,
                                           float headerH, float footerH,
                                           float portraitW, float landscapeW,
                                           float scaleP, float scaleL) {
        if (tableW <= portraitW * 0.92f) {
            return false;
        }
        if (tableW > landscapeW && tableW <= portraitW) {
            return true;
        }
        if (scaleL > scaleP * 1.04f) {
            return true;
        }
        if (tableW > portraitW && scaleL >= scaleP) {
            return true;
        }
        float contentH = headerH + footerH + Math.max(1f, tableH - headerH - footerH);
        float aspect = tableW / contentH;
        return aspect > 1.45f && tableW > portraitW * 0.88f;
    }

    /** 仅在正文区（页眉行与页脚行之间）分页，尽量避免拆 rowspan。 */
    static List<BodySlice> sliceBody(float[] scaledRowHeights, float bodyAreaHeight,
                                     int headerEnd, int footerStart, int maxRow,
                                     List<com.fasterxml.jackson.databind.JsonNode> cells) {
        List<BodySlice> slices = new ArrayList<>();
        if (footerStart <= headerEnd) {
            slices.add(new BodySlice(headerEnd, maxRow));
            return slices;
        }
        float maxBodyH = bodyAreaHeight;
        int start = headerEnd;
        float acc = 0;
        while (start < footerStart) {
            int end = start;
            acc = 0;
            while (end < footerStart) {
                float rh = scaledRowHeights[end];
                if (acc + rh > maxBodyH && end > start) {
                    break;
                }
                if (rh > maxBodyH) {
                    end++;
                    break;
                }
                acc += rh;
                end++;
            }
            if (end == start) end = start + 1;
            end = adjustBreakAwayFromRowSpan(start, end, footerStart, cells);
            slices.add(new BodySlice(start, end));
            start = end;
        }
        if (slices.isEmpty()) {
            slices.add(new BodySlice(headerEnd, footerStart));
        }
        return slices;
    }

    private static int adjustBreakAwayFromRowSpan(int start, int end, int footerStart,
                                                  List<com.fasterxml.jackson.databind.JsonNode> cells) {
        if (end >= footerStart || end <= start + 1) return Math.min(end, footerStart);
        for (com.fasterxml.jackson.databind.JsonNode cell : cells) {
            int r = cell.path("row").asInt();
            int rowSpan = Math.max(1, cell.path("rowSpan").asInt(1));
            int cellEnd = r + rowSpan;
            if (rowSpan <= 1 || cellEnd <= start || r >= footerStart) continue;
            if (r < end && cellEnd > end) {
                if (r > start) return r;
                return Math.min(cellEnd, footerStart);
            }
        }
        return end;
    }

    static float sumRows(float[] rowHeights, int from, int to) {
        float s = 0;
        for (int i = from; i < to && i < rowHeights.length; i++) s += rowHeights[i];
        return s;
    }
}
