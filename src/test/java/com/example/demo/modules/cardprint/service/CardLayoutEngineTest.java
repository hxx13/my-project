package com.example.demo.modules.cardprint.service;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** 尺寸引擎纯函数契约：页尺寸、二维码占位、行高均分、走纸偏移。 */
class CardLayoutEngineTest {

    private static final float MM = 72f / 25.4f;

    private static List<CardLayoutEngine.Slot> slots(int n) {
        List<CardLayoutEngine.Slot> out = new java.util.ArrayList<>(n);
        for (int i = 0; i < n; i++) out.add(CardLayoutEngine.Slot.of("L" + i, "F" + i));
        return out;
    }

    @Test
    void defaultSpecProduces70x105Page() {
        var layout = CardLayoutEngine.layout(CardLayoutEngine.Spec.defaults(), slots(9));
        assertEquals(70 * MM, layout.pageWidthPt(), 0.01f);
        assertEquals(105 * MM, layout.pageHeightPt(), 0.01f);
    }

    @Test
    void qrTakesRightColumnAndSlotsUseRemainingWidth() {
        // 默认：margin 2mm，qr 33mm，qr.margin 1mm，anchor top-right
        var layout = CardLayoutEngine.layout(CardLayoutEngine.Spec.defaults(), slots(9));
        assertEquals(33 * MM, layout.qrRect().w(), 0.01f);
        assertEquals(33 * MM, layout.qrRect().h(), 0.01f);
        // 槽位区 = 内容区宽(70-4) - 二维码区(34) = 32mm
        assertEquals(32 * MM, layout.rows().get(0).get(0).w(), 0.01f);
        assertEquals(2 * MM, layout.rows().get(0).get(0).x(), 0.01f);
    }

    @Test
    void slotsSplitContentHeightEvenlyWithoutLineHeight() {
        var layout = CardLayoutEngine.layout(CardLayoutEngine.Spec.defaults(), slots(10));
        float contentH = (105 - 4) * MM;
        assertEquals(contentH / 10, layout.rows().get(0).get(0).h(), 0.01f);
        assertEquals(2 * MM, layout.rows().get(0).get(0).y(), 0.01f);
        assertEquals(2 * MM + 3 * (contentH / 10), layout.rows().get(3).get(0).y(), 0.01f);
    }

    @Test
    void explicitLineHeightWinsOverEvenSplit() {
        var spec = CardLayoutEngine.Spec.defaults().withLineHeightMm(8f);
        var layout = CardLayoutEngine.layout(spec, slots(5));
        assertEquals(8 * MM, layout.rows().get(0).get(0).h(), 0.01f);
        assertEquals(2 * MM + 2 * 8 * MM, layout.rows().get(2).get(0).y(), 0.01f);
    }

    @Test
    void offsetsShiftEverything() {
        var base = CardLayoutEngine.layout(CardLayoutEngine.Spec.defaults(), slots(5));
        var shifted = CardLayoutEngine.layout(
                CardLayoutEngine.Spec.defaults().withOffsetMm(0.5f, -0.3f), slots(5));
        assertEquals(0.5f * MM, shifted.rows().get(0).get(0).x() - base.rows().get(0).get(0).x(), 0.01f);
        assertEquals(-0.3f * MM, shifted.rows().get(0).get(0).y() - base.rows().get(0).get(0).y(), 0.01f);
    }

    @Test
    void qrDisabledGivesFullContentWidth() {
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false);
        var layout = CardLayoutEngine.layout(spec, slots(5));
        assertEquals(66 * MM, layout.rows().get(0).get(0).w(), 0.01f);
    }

    @Test
    void qrTopLeftAnchorsToContentLeftEdge() {
        // 左右锚点必须对称：都贴内容区边缘（页边距 2mm），而不是贴页边 1mm
        var b = CardLayoutEngine.Spec.defaults();
        var spec = new CardLayoutEngine.Spec(b.pageWidthMm(), b.pageHeightMm(), b.marginMm(),
                b.defaultFontSizePt(), b.lineHeightMm(), b.offsetXMm(), b.offsetYMm(),
                b.borderWidthMm(), b.borderColor(),
                new CardLayoutEngine.Spec.Qr(true, "__qr__", 33f, 1f, "top-left"), false, false, null);
        var layout = CardLayoutEngine.layout(spec, slots(5));
        assertEquals(2 * MM, layout.qrRect().x(), 0.01f);
        assertEquals(2 * MM + 34 * MM, layout.rows().get(0).get(0).x(), 0.01f);
    }

    @Test
    void rejectsNullSpecAndNullSlots() {
        assertThrows(IllegalArgumentException.class, () -> CardLayoutEngine.layout(null, List.of()));
        assertThrows(IllegalArgumentException.class,
                () -> CardLayoutEngine.layout(CardLayoutEngine.Spec.defaults(), null));
    }

    @Test
    void rejectsUnknownQrAnchor() {
        var b = CardLayoutEngine.Spec.defaults();
        var spec = new CardLayoutEngine.Spec(b.pageWidthMm(), b.pageHeightMm(), b.marginMm(),
                b.defaultFontSizePt(), b.lineHeightMm(), b.offsetXMm(), b.offsetYMm(),
                b.borderWidthMm(), b.borderColor(),
                new CardLayoutEngine.Spec.Qr(true, "__qr__", 33f, 1f, "left-top"), false, false, null);
        assertThrows(IllegalArgumentException.class, () -> CardLayoutEngine.layout(spec, slots(3)));
    }

    @Test
    void qrMiddleCenterIsCenteredOnPage() {
        var b = CardLayoutEngine.Spec.defaults();
        var spec = new CardLayoutEngine.Spec(b.pageWidthMm(), b.pageHeightMm(), b.marginMm(),
                b.defaultFontSizePt(), b.lineHeightMm(), b.offsetXMm(), b.offsetYMm(),
                b.borderWidthMm(), b.borderColor(),
                new CardLayoutEngine.Spec.Qr(true, "__qr__", 33f, 1f, "middle-center"), false, false, null);
        var layout = CardLayoutEngine.layout(spec, slots(5));
        assertEquals((70f - 33f) / 2f * MM, layout.qrRect().x(), 0.01f);
        assertEquals((105f - 33f) / 2f * MM, layout.qrRect().y(), 0.01f);
        assertEquals(66 * MM, layout.rows().get(0).get(0).w(), 0.01f);
    }

    @Test
    void qrBottomRightAnchorsToContentBottomRight() {
        var b = CardLayoutEngine.Spec.defaults();
        var spec = new CardLayoutEngine.Spec(b.pageWidthMm(), b.pageHeightMm(), b.marginMm(),
                b.defaultFontSizePt(), b.lineHeightMm(), b.offsetXMm(), b.offsetYMm(),
                b.borderWidthMm(), b.borderColor(),
                new CardLayoutEngine.Spec.Qr(true, "__qr__", 33f, 1f, "bottom-right"), false, false, null);
        var layout = CardLayoutEngine.layout(spec, slots(3));
        assertEquals((70 - 2 - 33) * MM, layout.qrRect().x(), 0.01f);
        assertEquals((105 - 2 - 33) * MM, layout.qrRect().y(), 0.01f);
    }

    @Test
    void nullQrLeavesFullContentWidthAndNoQrRect() {
        var b = CardLayoutEngine.Spec.defaults();
        var spec = new CardLayoutEngine.Spec(b.pageWidthMm(), b.pageHeightMm(), b.marginMm(),
                b.defaultFontSizePt(), b.lineHeightMm(), b.offsetXMm(), b.offsetYMm(),
                b.borderWidthMm(), b.borderColor(), null, false, false, null);
        var layout = CardLayoutEngine.layout(spec, slots(4));
        assertNull(layout.qrRect());
        assertEquals(66 * MM, layout.rows().get(0).get(0).w(), 0.01f);
        assertEquals(4, layout.rows().size());
    }

    @Test
    void zeroSlotsProducesEmptyList() {
        var layout = CardLayoutEngine.layout(CardLayoutEngine.Spec.defaults(), slots(0));
        assertEquals(0, layout.rows().size());
    }

    @Test
    void landscapeSwapsPageDimensions() {
        var layout = CardLayoutEngine.layout(CardLayoutEngine.Spec.defaults().withLandscape(true), slots(5));
        assertEquals(105 * MM, layout.pageWidthPt(), 0.01f);
        assertEquals(70 * MM, layout.pageHeightPt(), 0.01f);
        assertEquals(70 * MM, layout.layoutHeightPt(), 0.01f);
    }

    @Test
    void rotate90SwapsLayoutButKeepsPaper() {
        var spec = CardLayoutEngine.Spec.defaults().withRotate90(true).withQrEnabled(false);
        var layout = CardLayoutEngine.layout(spec, slots(5));
        assertEquals(70 * MM, layout.pageWidthPt(), 0.01f);
        assertEquals(105 * MM, layout.pageHeightPt(), 0.01f);
        assertEquals(70 * MM, layout.layoutHeightPt(), 0.01f);
        // 布局空间宽 = 纸面高 105mm，槽位宽按 105mm 内容区算（101mm），而非 70mm
        assertEquals((105 - 4) * MM, layout.rows().get(0).get(0).w(), 0.01f);
    }

    @Test
    void tableBlockWidthAndHeightLimitSlots() {
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                .withTable(new CardLayoutEngine.Spec.Table(40f, 60f, null, null, null));
        var layout = CardLayoutEngine.layout(spec, slots(4));
        assertEquals(40 * MM, layout.rows().get(0).get(0).w(), 0.01f);
        assertEquals(60f / 4 * MM, layout.rows().get(0).get(0).h(), 0.01f);
    }

    @Test
    void tableAnchorCentersBlock() {
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                .withTable(new CardLayoutEngine.Spec.Table(40f, 60f, "middle-center", null, null));
        var layout = CardLayoutEngine.layout(spec, slots(3));
        // 内容区左上角为 (margin, margin) = (2mm, 2mm)，块在内容区内居中
        assertEquals((2f + (66f - 40f) / 2f) * MM, layout.rows().get(0).get(0).x(), 0.01f);
        assertEquals((2f + (101f - 60f) / 2f) * MM, layout.rows().get(0).get(0).y(), 0.01f);
    }

    @Test
    void threeColumnRowSplitsTableEvenly() {
        var slot = CardLayoutEngine.Slot.ofCells(
                new CardLayoutEngine.Cell("A", "a"),
                new CardLayoutEngine.Cell("B", "b"),
                new CardLayoutEngine.Cell("C", "c"));
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                .withTable(new CardLayoutEngine.Spec.Table(60f, null, null, 3, null));
        var layout = CardLayoutEngine.layout(spec, List.of(slot));
        float contentX = 2f * MM;
        assertEquals(20 * MM, layout.rows().get(0).get(0).w(), 0.01f);
        assertEquals(20 * MM, layout.rows().get(0).get(1).w(), 0.01f);
        assertEquals(20 * MM, layout.rows().get(0).get(2).w(), 0.01f);
        assertEquals(contentX, layout.rows().get(0).get(0).x(), 0.01f);
        assertEquals(contentX + 20 * MM, layout.rows().get(0).get(1).x(), 0.01f);
        assertEquals(contentX + 40 * MM, layout.rows().get(0).get(2).x(), 0.01f);
    }

    @Test
    void customColumnWidthsScaleToTableWidth() {
        var slot = CardLayoutEngine.Slot.ofCells(
                new CardLayoutEngine.Cell("A", "a"),
                new CardLayoutEngine.Cell("B", "b"));
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                .withTable(new CardLayoutEngine.Spec.Table(60f, null, null, 2, List.of(1f, 3f)));
        var layout = CardLayoutEngine.layout(spec, List.of(slot));
        assertEquals(15 * MM, layout.rows().get(0).get(0).w(), 0.01f);
        assertEquals(45 * MM, layout.rows().get(0).get(1).w(), 0.01f);
    }

    @Test
    void moreCellsThanColumnsAreIgnored() {
        var slot = CardLayoutEngine.Slot.ofCells(
                new CardLayoutEngine.Cell("A", "a"),
                new CardLayoutEngine.Cell("B", "b"),
                new CardLayoutEngine.Cell("C", "c"));
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                .withTable(new CardLayoutEngine.Spec.Table(null, null, null, 2, null));
        var layout = CardLayoutEngine.layout(spec, List.of(slot));
        assertEquals(2, layout.rows().get(0).size());
    }

    @Test
    void cellWithoutColSpanOccupiesOneColumn() {
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                .withTable(new CardLayoutEngine.Spec.Table(60f, null, null, 3, null));

        // 一行 1 格、无 colSpan → 只占 1 列 = 20mm（不再自动跨满剩余列）
        var single = CardLayoutEngine.layout(spec, List.of(
                CardLayoutEngine.Slot.ofCells(new CardLayoutEngine.Cell("A", "a"))));
        assertEquals(20 * MM, single.rows().get(0).get(0).w(), 0.01f);

        // 一行 2 格、无 colSpan → 各占 1 列 = 20mm
        var pair = CardLayoutEngine.layout(spec, List.of(
                CardLayoutEngine.Slot.ofCells(
                        new CardLayoutEngine.Cell("A", "a"),
                        new CardLayoutEngine.Cell("B", "b"))));
        assertEquals(20 * MM, pair.rows().get(0).get(0).w(), 0.01f);
        assertEquals(20 * MM, pair.rows().get(0).get(1).w(), 0.01f);
    }

    @Test
    void singleCellRowOccupiesOneColumnByDefault() {
        // 列数按行内最大格数推导 = 2；无 colSpan 时单格行只占 1 列 = 33mm，两格行各 33mm
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                .withTable(new CardLayoutEngine.Spec.Table(null, null, null, null, null));
        var layout = CardLayoutEngine.layout(spec, List.of(
                CardLayoutEngine.Slot.ofCells(new CardLayoutEngine.Cell("A", "a")),
                CardLayoutEngine.Slot.ofCells(
                        new CardLayoutEngine.Cell("A", "a"),
                        new CardLayoutEngine.Cell("B", "b"))));
        assertEquals(33 * MM, layout.rows().get(0).get(0).w(), 0.01f);
        assertEquals(33 * MM, layout.rows().get(1).get(0).w(), 0.01f);
        assertEquals(33 * MM, layout.rows().get(1).get(1).w(), 0.01f);
    }

    @Test
    void emptyCellsProduceNoRect() {
        // 3 列网格，tW=60mm，等分列宽 20mm
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                .withTable(new CardLayoutEngine.Spec.Table(60f, null, null, 3, null));

        // 一行 [有内容, 空, 空] → 只产生 1 个矩形，无 colSpan 只占 1 列 = 20mm
        var oneFilled = CardLayoutEngine.layout(spec, List.of(
                CardLayoutEngine.Slot.ofCells(
                        new CardLayoutEngine.Cell("PI", "pi"),
                        new CardLayoutEngine.Cell(null, null),
                        new CardLayoutEngine.Cell(null, null))));
        assertEquals(1, oneFilled.rows().get(0).size());
        assertEquals(20 * MM, oneFilled.rows().get(0).get(0).w(), 0.01f);
        assertEquals(2f * MM, oneFilled.rows().get(0).get(0).x(), 0.01f);

        // 一行 [有内容, 有内容, 空] → 2 个矩形，各占 1 列 = 20mm
        var twoFilled = CardLayoutEngine.layout(spec, List.of(
                CardLayoutEngine.Slot.ofCells(
                        new CardLayoutEngine.Cell("A", "a"),
                        new CardLayoutEngine.Cell("B", "b"),
                        new CardLayoutEngine.Cell(null, null))));
        assertEquals(2, twoFilled.rows().get(0).size());
        assertEquals(20 * MM, twoFilled.rows().get(0).get(0).w(), 0.01f);
        assertEquals(20 * MM, twoFilled.rows().get(0).get(1).w(), 0.01f);
    }

    @Test
    void colSpanCellCoversMultipleColumns() {
        // 3 列等分 tW=60mm，一行 [colSpan=3 的有内容格] → 1 个矩形宽 tW
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                .withTable(new CardLayoutEngine.Spec.Table(60f, null, null, 3, null));
        var layout = CardLayoutEngine.layout(spec, List.of(
                CardLayoutEngine.Slot.ofCells(new CardLayoutEngine.Cell("A", "a", 3))));
        assertEquals(1, layout.rows().get(0).size());
        assertEquals(60 * MM, layout.rows().get(0).get(0).w(), 0.01f);
        assertEquals(2f * MM, layout.rows().get(0).get(0).x(), 0.01f);
    }

    @Test
    void emptyCellStillOccupiesItsColumns() {
        // 3 列、一行 [有内容, 空, 有内容] → 2 个矩形，第二个 x = tableX + colW[0] + colW[1]
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                .withTable(new CardLayoutEngine.Spec.Table(60f, null, null, 3, null));
        var layout = CardLayoutEngine.layout(spec, List.of(
                CardLayoutEngine.Slot.ofCells(
                        new CardLayoutEngine.Cell("A", "a"),
                        new CardLayoutEngine.Cell(null, null),
                        new CardLayoutEngine.Cell("C", "c"))));
        assertEquals(2, layout.rows().get(0).size());
        assertEquals(2f * MM, layout.rows().get(0).get(0).x(), 0.01f);
        assertEquals(20 * MM, layout.rows().get(0).get(0).w(), 0.01f);
        assertEquals(2f * MM + 20 * MM + 20 * MM, layout.rows().get(0).get(1).x(), 0.01f);
        assertEquals(20 * MM, layout.rows().get(0).get(1).w(), 0.01f);
    }

    @Test
    void colSpanIsClampedToRemainingColumns() {
        // 3 列、一行 [有内容 colSpan=5] → 宽 tW
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                .withTable(new CardLayoutEngine.Spec.Table(60f, null, null, 3, null));
        var layout = CardLayoutEngine.layout(spec, List.of(
                CardLayoutEngine.Slot.ofCells(new CardLayoutEngine.Cell("A", "a", 5))));
        assertEquals(60 * MM, layout.rows().get(0).get(0).w(), 0.01f);
    }

    @Test
    void rowWithAllEmptyCellsProducesNoRect() {
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                .withTable(new CardLayoutEngine.Spec.Table(60f, null, null, 3, null));
        var layout = CardLayoutEngine.layout(spec, List.of(
                CardLayoutEngine.Slot.ofCells(
                        new CardLayoutEngine.Cell(null, null),
                        new CardLayoutEngine.Cell("", ""),
                        new CardLayoutEngine.Cell(null, null))));
        assertEquals(1, layout.rows().size());
        assertEquals(0, layout.rows().get(0).size());
    }
}
