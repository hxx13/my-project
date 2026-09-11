package com.example.demo.modules.cardprint.service;

import java.util.ArrayList;
import java.util.List;

/**
 * 尺寸引擎 — 只懂几何，不懂业务。
 * 输入页面规格 + 槽位数量，输出每个槽位与二维码块的绝对矩形（pt，原点左上角）。
 * 渲染引擎负责把左上角原点翻转为 PDFBox 的左下角原点。
 */
public final class CardLayoutEngine {

    public static final float MM_TO_PT = 72f / 25.4f;

    private static final java.util.Set<String> ANCHORS = java.util.Set.of(
            "top-left", "top-center", "top-right",
            "middle-left", "middle-center", "middle-right",
            "bottom-left", "bottom-center", "bottom-right");

    private CardLayoutEngine() {}

    /** 单元格为空：label 与 fieldKey 都为 null/空白。 */
    private static boolean isBlank(Cell c) {
        return c == null || (isBlank(c.label()) && isBlank(c.fieldKey()));
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    /**
     * 页面规格。所有长度单位 mm。
     * 布局引擎只消费几何字段（page/margin/offset/lineHeight/qr）；
     * defaultFontSizePt / defaultFontWeight / borderWidthMm / borderColor 与 Slot 是渲染字段，由渲染引擎读取。
     * lineHeightMm 若显式指定，行高会自适应到表格高（装不下时压缩为均分，不溢出）。
     */
    public record Spec(
            float pageWidthMm,
            float pageHeightMm,
            float marginMm,
            float defaultFontSizePt,
            Float lineHeightMm,
            float offsetXMm,
            float offsetYMm,
            float borderWidthMm,
            String borderColor,
            Qr qr,
            Boolean landscape,
            Boolean rotate90,
            Table table,
            Integer defaultFontWeight
    ) {
        /** 二维码块。 */
        public record Qr(boolean enabled, String fieldKey, float sizeMm, float marginMm, String anchor) {}

        /** 表格块。widthMm/heightMm 为 null 表示自动填满剩余空间；anchor 为 null 表示按下方默认规则。
         * colCount/colWidthsMm 为行内列数与各列宽(mm)，null 时按槽位 cells 自动推导 / 等分 tW。 */
        public record Table(Float widthMm, Float heightMm, String anchor,
                            Integer colCount, List<Float> colWidthsMm) {}

        public static Spec defaults() {
            return new Spec(70f, 105f, 2f, 9f, null, 0f, 0f, 0.2f, "#000000",
                    new Qr(true, "__qr__", 33f, 1f, "top-right"),
                    false, false, null, null);
        }

        public Spec withOffsetMm(float dxMm, float dyMm) {
            return new Spec(pageWidthMm, pageHeightMm, marginMm, defaultFontSizePt, lineHeightMm,
                    dxMm, dyMm, borderWidthMm, borderColor, qr, landscape, rotate90, table, defaultFontWeight);
        }

        public Spec withLineHeightMm(Float mm) {
            return new Spec(pageWidthMm, pageHeightMm, marginMm, defaultFontSizePt, mm,
                    offsetXMm, offsetYMm, borderWidthMm, borderColor, qr, landscape, rotate90, table, defaultFontWeight);
        }

        public Spec withQrEnabled(boolean enabled) {
            Qr q = qr == null ? new Qr(enabled, "__qr__", 33f, 1f, "top-right")
                    : new Qr(enabled, qr.fieldKey(), qr.sizeMm(), qr.marginMm(), qr.anchor());
            return new Spec(pageWidthMm, pageHeightMm, marginMm, defaultFontSizePt, lineHeightMm,
                    offsetXMm, offsetYMm, borderWidthMm, borderColor, q, landscape, rotate90, table, defaultFontWeight);
        }

        public Spec withLandscape(boolean enabled) {
            return new Spec(pageWidthMm, pageHeightMm, marginMm, defaultFontSizePt, lineHeightMm,
                    offsetXMm, offsetYMm, borderWidthMm, borderColor, qr, enabled, rotate90, table, defaultFontWeight);
        }

        public Spec withRotate90(boolean enabled) {
            return new Spec(pageWidthMm, pageHeightMm, marginMm, defaultFontSizePt, lineHeightMm,
                    offsetXMm, offsetYMm, borderWidthMm, borderColor, qr, landscape, enabled, table, defaultFontWeight);
        }

        public Spec withTable(Table t) {
            return new Spec(pageWidthMm, pageHeightMm, marginMm, defaultFontSizePt, lineHeightMm,
                    offsetXMm, offsetYMm, borderWidthMm, borderColor, qr, landscape, rotate90, t, defaultFontWeight);
        }
    }

    /** 单元格：一列的内容（前缀文案 + 绑定字段）。colSpan 为跨列数（null 视为 1）。 */
    public record Cell(String label, String fieldKey, Integer colSpan) {
        /** 无跨列的便捷构造（等价 colSpan = null）。 */
        public Cell(String label, String fieldKey) {
            this(label, fieldKey, null);
        }
    }

    /**
     * 槽位定义：一行一个槽位，行内可含 N 列单元格。
     * cells 为新模型；label/fieldKey/rightLabel/rightFieldKey 为旧模型遗留字段（仅用于兼容老模板 JSON）。
     * align / vAlign 为格内九宫格对齐（水平 left/center/right、垂直 top/middle/bottom），由渲染引擎消费；
     * bold 为预留字段（保留兼容老 JSON，渲染不再消费）；fontWeight 为字重，null 时走 spec.defaultFontWeight，再 null 视为 700 加粗。
     * heightMm 为单行高（mm），null 时走均分；行高优先级：全局 lineHeightMm &gt; 单行 heightMm &gt; 均分。
     */
    public record Slot(
            List<Cell> cells,
            String label,
            String fieldKey,
            String rightLabel,
            String rightFieldKey,
            String align,
            Boolean bold,
            Float fontSizePt,
            Float heightMm,
            Integer fontWeight,
            String vAlign
    ) {
        /** 有效列：优先 cells；为空则由旧字段合成（left、right 两列）。 */
        public List<Cell> effectiveCells() {
            if (cells != null && !cells.isEmpty()) return cells;
            List<Cell> out = new ArrayList<>();
            if (label != null || fieldKey != null) out.add(new Cell(label, fieldKey));
            if (rightLabel != null || rightFieldKey != null) out.add(new Cell(rightLabel, rightFieldKey));
            return out;
        }

        /** 新模型：一行 N 列。 */
        public static Slot ofCells(Cell... cells) {
            return new Slot(List.of(cells), null, null, null, null, "left", Boolean.TRUE, null, null, null, null);
        }

        /** 旧模型：单列。保留原签名不变。 */
        public static Slot of(String label, String fieldKey) {
            return new Slot(null, label, fieldKey, null, null, "left", Boolean.TRUE, null, null, null, null);
        }

        /** 旧模型：左右两列。保留原签名不变。 */
        public static Slot pair(String label, String fieldKey, String rightLabel, String rightFieldKey) {
            return new Slot(null, label, fieldKey, rightLabel, rightFieldKey, "left", Boolean.TRUE, null, null, null, null);
        }
    }

    /** 绝对矩形，单位 pt，原点左上角。index 为列序号；二维码块用 -1。 */
    public record Rect(int index, float x, float y, float w, float h) {}

    /** 排版结果。rows.get(j).get(i) = 第 j 行第 i 列的矩形；qrRect 为二维码块。
     * layoutHeightPt 为布局空间高度（渲染引擎用它做 y 翻转），可能不等于 pageHeightPt。 */
    public record Layout(List<List<Rect>> rows, Rect qrRect, float pageWidthPt, float pageHeightPt, float layoutHeightPt) {}

    /**
     * 按页面规格排版槽位与二维码块。
     * <p>纸面尺寸：landscape=true 时物理页面宽高互换；rotate90=true 时布局空间宽高互换（内容整体旋转 90° 落到纸面）。</p>
     * <p>二维码锚点 anchor 取九宫格 {@code <垂直>-<水平>}：垂直 top/middle/bottom，水平 left/center/right。
     * 水平 center 时二维码与槽位区重叠（槽位区占满内容区），仅适用于无槽位的纯二维码卡。</p>
     * <p>表格块 table：widthMm/heightMm 为 null 时自动填满剩余空间；anchor 为 null 时按默认规则
     * （二维码横向为 left 时表格靠右、为 right 时靠左，否则靠左、纵向靠顶）。横向 center 的二维码与默认宽度表格会重叠——
     * 这是允许的（纯二维码卡时槽位为空）。</p>
     */
    public static Layout layout(Spec spec, List<Slot> slots) {
        if (spec == null) throw new IllegalArgumentException("spec 不能为空");
        if (slots == null) throw new IllegalArgumentException("slots 不能为空");
        Spec.Qr qr = spec.qr();
        if (qr != null && qr.enabled() && !ANCHORS.contains(qr.anchor())) {
            throw new IllegalArgumentException("未知的二维码锚点: " + qr.anchor());
        }
        Spec.Table table = spec.table();
        if (table != null && table.anchor() != null && !ANCHORS.contains(table.anchor())) {
            throw new IllegalArgumentException("未知的表格锚点: " + table.anchor());
        }

        boolean landscape = Boolean.TRUE.equals(spec.landscape());
        boolean rotate90 = Boolean.TRUE.equals(spec.rotate90());
        // 纸面尺寸（物理 PDF 页面）
        float paperW = landscape ? spec.pageHeightMm() : spec.pageWidthMm();
        float paperH = landscape ? spec.pageWidthMm() : spec.pageHeightMm();
        // 布局空间尺寸（矩形都算在这个空间里）
        float layoutW = rotate90 ? paperH : paperW;
        float layoutH = rotate90 ? paperW : paperH;

        float mm = MM_TO_PT;
        float contentX = spec.offsetXMm() + spec.marginMm();
        float contentY = spec.offsetYMm() + spec.marginMm();
        float contentW = layoutW - 2 * spec.marginMm();
        float contentH = layoutH - 2 * spec.marginMm();

        boolean qrOn = qr != null && qr.enabled();
        String qrH = null, qrV = null;
        float qrW = 0f;
        if (qrOn) {
            // 横向前缀取 anchor 最后一段（left/center/right），纵向前缀取第一段（top/middle/bottom）。
            qrH = qr.anchor().substring(qr.anchor().indexOf('-') + 1);
            qrV = qr.anchor().substring(0, qr.anchor().indexOf('-'));
            qrW = qr.sizeMm() + qr.marginMm();
        }

        Rect qrRect = null;
        if (qrOn) {
            float qrX = switch (qrH) {
                case "left" -> contentX;
                case "center" -> spec.offsetXMm() + (layoutW - qr.sizeMm()) / 2;
                case "right" -> spec.offsetXMm() + layoutW - spec.marginMm() - qr.sizeMm();
                default -> throw new IllegalArgumentException("未知的二维码锚点: " + qr.anchor());
            };
            float qrY = switch (qrV) {
                case "top" -> contentY;
                case "middle" -> spec.offsetYMm() + (layoutH - qr.sizeMm()) / 2;
                case "bottom" -> spec.offsetYMm() + layoutH - spec.marginMm() - qr.sizeMm();
                default -> throw new IllegalArgumentException("未知的二维码锚点: " + qr.anchor());
            };
            qrRect = new Rect(-1, qrX * mm, qrY * mm, qr.sizeMm() * mm, qr.sizeMm() * mm);
        }

        // 二维码让位后的槽位区：table == null 时它即列排版的可用宽度。
        float slotAreaX = contentX;
        float slotAreaW = contentW;
        if (qrOn) {
            switch (qrH) {
                case "left" -> {
                    slotAreaX = contentX + qrW;
                    slotAreaW = contentW - qrW;
                }
                case "right" -> {
                    slotAreaX = contentX;
                    slotAreaW = contentW - qrW;
                }
                case "center" -> {
                    // 二维码与槽位重叠，仅适用于无槽位的纯二维码卡。
                    slotAreaX = contentX;
                    slotAreaW = contentW;
                }
                default -> throw new IllegalArgumentException("未知的二维码锚点: " + qr.anchor());
            }
        }

        int rowCount = slots.size();
        boolean tableOn = table != null;
        float tW, tH, tableX, tableY;
        if (tableOn) {
            // 默认横向锚点：二维码在左则表格靠右、在右则靠左，否则靠左；默认纵向靠顶。
            String defaultHAlign;
            if (qrOn && "left".equals(qrH)) defaultHAlign = "right";
            else if (qrOn && "right".equals(qrH)) defaultHAlign = "left";
            else defaultHAlign = "left";
            String defaultVAlign = "top";

            String anchor = table.anchor();
            String hAlign, vAlign;
            if (anchor != null) {
                hAlign = anchor.substring(anchor.indexOf('-') + 1);
                vAlign = anchor.substring(0, anchor.indexOf('-'));
            } else {
                hAlign = defaultHAlign;
                vAlign = defaultVAlign;
            }

            // S1：表格块可用区已让开二维码（availX=slotAreaX, availW=slotAreaW），显式宽高钳制在可用区内。
            tW = table.widthMm() != null ? Math.max(1f, Math.min(table.widthMm(), slotAreaW)) : slotAreaW;
            // 表格块高：显式配置钳制在内容区内；未配置时 = 各行高之和（封顶到内容区），使 top/middle/bottom 锚点始终有效。
            float fixedTotal = 0f;
            int autoCount = 0;
            for (Slot s : slots) {
                if (s.heightMm() != null) fixedTotal += s.heightMm();
                else autoCount++;
            }
            // 自动行的自然高度：全局 lineHeightMm 非空时取其与均分较小者，否则均分。
            float autoRowH = spec.lineHeightMm() != null
                    ? Math.min(spec.lineHeightMm(), contentH / Math.max(1, rowCount))
                    : contentH / Math.max(1, rowCount);
            tH = table.heightMm() != null
                    ? Math.max(1f, Math.min(table.heightMm(), contentH))
                    : Math.min(contentH, fixedTotal + autoCount * autoRowH);

            tableX = switch (hAlign) {
                case "left" -> slotAreaX;
                case "center" -> slotAreaX + (slotAreaW - tW) / 2;
                case "right" -> slotAreaX + slotAreaW - tW;
                default -> throw new IllegalArgumentException("未知的表格锚点: " + anchor);
            };
            tableY = switch (vAlign) {
                case "top" -> contentY;
                case "middle" -> contentY + (contentH - tH) / 2;
                case "bottom" -> contentY + contentH - tH;
                default -> throw new IllegalArgumentException("未知的表格锚点: " + anchor);
            };
        } else {
            tW = slotAreaW;
            tH = contentH;
            tableX = slotAreaX;
            tableY = contentY;
        }

        // 列数：优先表格块配置，否则取各行有效列数的最大值。
        int colCount;
        if (table != null && table.colCount() != null) {
            colCount = Math.max(1, table.colCount());
        } else {
            int maxCells = 0;
            for (Slot s : slots) maxCells = Math.max(maxCells, s.effectiveCells().size());
            colCount = Math.max(1, maxCells);
        }

        // 列宽(mm)：配置列宽按索引取用（缺的用均值补、多的截断），再按比例缩放到 tW；否则等分 tW。
        float[] colW = new float[colCount];
        if (table != null && table.colWidthsMm() != null && !table.colWidthsMm().isEmpty()) {
            List<Float> src = table.colWidthsMm();
            // mean = src 中 >0 的值的均值；全 0 则 tW/colCount
            float posSum = 0f;
            int posCount = 0;
            for (float v : src) {
                if (v > 0f) { posSum += v; posCount++; }
            }
            float mean = posCount > 0 ? posSum / posCount : tW / colCount;
            float[] raw = new float[colCount];
            for (int i = 0; i < colCount; i++) {
                float v = i < src.size() ? src.get(i) : mean;
                raw[i] = v > 0f ? v : mean;
            }
            float sum = 0f;
            for (float v : raw) sum += v;
            if (sum <= 0f) sum = colCount;
            for (int i = 0; i < colCount; i++) colW[i] = raw[i] / sum * tW;
        } else {
            for (int i = 0; i < colCount; i++) colW[i] = tW / colCount;
        }

        float[] rowH = rowHeights(spec, slots, tH);

        // 列前缀和：colPrefix[i] = Σ colW[0..i-1]，用于定位第 i 列的 x 与跨列宽。
        float[] colPrefix = new float[colCount + 1];
        for (int i = 0; i < colCount; i++) colPrefix[i + 1] = colPrefix[i] + colW[i];

        List<List<Rect>> rows = new ArrayList<>(rowCount);
        float y = tableY;
        for (int j = 0; j < rowCount; j++) {
            List<Cell> cells = slots.get(j).effectiveCells();
            List<Rect> row = new ArrayList<>();
            int cursor = 0;
            for (int i = 0; i < cells.size() && cursor < colCount; i++) {
                Cell c = cells.get(i);
                int raw = c.colSpan() != null ? c.colSpan() : 1;
                int span = Math.max(1, Math.min(raw, colCount - cursor));
                if (span <= 0) break;
                if (!isBlank(c)) {
                    float x = tableX + colPrefix[cursor];
                    float w = colPrefix[cursor + span] - colPrefix[cursor];
                    row.add(new Rect(i, x * mm, y * mm, w * mm, rowH[j] * mm));
                }
                cursor += span;
            }
            rows.add(row);
            y += rowH[j];
        }
        return new Layout(rows, qrRect, paperW * mm, paperH * mm, layoutH * mm);
    }

    /**
     * 逐行行高（mm）。行高总和恒 ≤ tH，永不溢出。
     * <p>全局 lineHeightMm 非空时所有行等高（装得下就用，装不下压缩到均分）；否则单行 heightMm 非空的行取配置值，
     * 其余行平分「表格高 − 已配置行高之和」；固定行高之和超配时按比例压缩到总和 = tH，auto 行得 0。</p>
     */
    private static float[] rowHeights(Spec spec, List<Slot> slots, float tH) {
        int rowCount = slots.size();
        float[] h = new float[rowCount];
        if (rowCount == 0) return h;
        if (spec.lineHeightMm() != null) {
            // 全局行高也适配：装得下就用，装不下压缩到均分
            float each = rowCount * spec.lineHeightMm() <= tH ? spec.lineHeightMm() : tH / rowCount;
            java.util.Arrays.fill(h, each);
            return h;
        }
        float fixedTotal = 0f;
        int autoCount = 0;
        for (Slot s : slots) {
            if (s.heightMm() != null) fixedTotal += s.heightMm();
            else autoCount++;
        }
        if (fixedTotal > tH) {
            // 超配：固定行等比压缩到总和 = tH；auto 行得 0
            float k = tH / fixedTotal;
            for (int j = 0; j < rowCount; j++) {
                Float v = slots.get(j).heightMm();
                h[j] = v != null ? v * k : 0f;
            }
        } else {
            float autoH = autoCount > 0 ? (tH - fixedTotal) / autoCount : 0f;
            for (int j = 0; j < rowCount; j++) {
                Float v = slots.get(j).heightMm();
                h[j] = v != null ? v : autoH;
            }
        }
        return h;
    }
}
