package com.example.demo.modules.cardprint.service;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 尺寸引擎纯函数契约：页尺寸、二维码占位、行高均分、走纸偏移。 */
class CardLayoutEngineTest {

    private static final float MM = 72f / 25.4f;

    private static List<CardLayoutEngine.Slot> slots(int n) {
        List<CardLayoutEngine.Slot> out = new java.util.ArrayList<>(n);
        for (int i = 0; i < n; i++) out.add(CardLayoutEngine.Slot.of("L" + i, "F" + i));
        return out;
    }

    private static CardLayoutEngine.Slot rowWithHeight(float hMm) {
        return new CardLayoutEngine.Slot(null, "L", "F", null, null, "left", Boolean.TRUE, null, hMm, null, null);
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
    void perRowHeightOverridesEvenSplit() {
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false);
        var r0 = new CardLayoutEngine.Slot(null, "L0", "F0", null, null, "left", Boolean.TRUE, null, 30f, null, null);
        var layout = CardLayoutEngine.layout(spec, List.of(
                r0,
                CardLayoutEngine.Slot.of("L1", "F1"),
                CardLayoutEngine.Slot.of("L2", "F2")));
        float tHmm = 105f - 2f * 2f;
        assertEquals(30 * MM, layout.rows().get(0).get(0).h(), 0.01f);
        assertEquals(2 * MM + 30 * MM, layout.rows().get(1).get(0).y(), 0.01f);
        assertEquals((tHmm - 30f) / 2f * MM, layout.rows().get(1).get(0).h(), 0.01f);
        assertEquals((tHmm - 30f) / 2f * MM, layout.rows().get(2).get(0).h(), 0.01f);
    }

    @Test
    void globalLineHeightWinsOverPerRowHeight() {
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false).withLineHeightMm(8f);
        var r0 = new CardLayoutEngine.Slot(null, "L0", "F0", null, null, "left", Boolean.TRUE, null, 30f, null, null);
        var layout = CardLayoutEngine.layout(spec, List.of(
                r0,
                CardLayoutEngine.Slot.of("L1", "F1")));
        assertEquals(8 * MM, layout.rows().get(0).get(0).h(), 0.01f);
        assertEquals(8 * MM, layout.rows().get(1).get(0).h(), 0.01f);
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
                new CardLayoutEngine.Spec.Qr(true, "__qr__", 33f, 1f, "top-left"), false, false, null, null);
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
                new CardLayoutEngine.Spec.Qr(true, "__qr__", 33f, 1f, "left-top"), false, false, null, null);
        assertThrows(IllegalArgumentException.class, () -> CardLayoutEngine.layout(spec, slots(3)));
    }

    @Test
    void qrMiddleCenterIsCenteredOnPage() {
        var b = CardLayoutEngine.Spec.defaults();
        var spec = new CardLayoutEngine.Spec(b.pageWidthMm(), b.pageHeightMm(), b.marginMm(),
                b.defaultFontSizePt(), b.lineHeightMm(), b.offsetXMm(), b.offsetYMm(),
                b.borderWidthMm(), b.borderColor(),
                new CardLayoutEngine.Spec.Qr(true, "__qr__", 33f, 1f, "middle-center"), false, false, null, null);
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
                new CardLayoutEngine.Spec.Qr(true, "__qr__", 33f, 1f, "bottom-right"), false, false, null, null);
        var layout = CardLayoutEngine.layout(spec, slots(3));
        assertEquals((70 - 2 - 33) * MM, layout.qrRect().x(), 0.01f);
        assertEquals((105 - 2 - 33) * MM, layout.qrRect().y(), 0.01f);
    }

    @Test
    void nullQrLeavesFullContentWidthAndNoQrRect() {
        var b = CardLayoutEngine.Spec.defaults();
        var spec = new CardLayoutEngine.Spec(b.pageWidthMm(), b.pageHeightMm(), b.marginMm(),
                b.defaultFontSizePt(), b.lineHeightMm(), b.offsetXMm(), b.offsetYMm(),
                b.borderWidthMm(), b.borderColor(), null, false, false, null, null);
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

    @Test
    void fixedRowHeightsScaleDownWhenExceedingTableHeight() {
        // 表格高 60、2 行各设 60 → 两行各 30，总和 60（不溢出）
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                .withTable(new CardLayoutEngine.Spec.Table(null, 60f, null, null, null));
        var r0 = new CardLayoutEngine.Slot(null, "L0", "F0", null, null, "left", Boolean.TRUE, null, 60f, null, null);
        var r1 = new CardLayoutEngine.Slot(null, "L1", "F1", null, null, "left", Boolean.TRUE, null, 60f, null, null);
        var layout = CardLayoutEngine.layout(spec, List.of(r0, r1));
        assertEquals(30 * MM, layout.rows().get(0).get(0).h(), 0.01f);
        assertEquals(30 * MM, layout.rows().get(1).get(0).h(), 0.01f);
    }

    @Test
    void globalLineHeightAlsoFitsTable() {
        // lineHeightMm=40、3 行、表格高 60 → 每行 20
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false).withLineHeightMm(40f)
                .withTable(new CardLayoutEngine.Spec.Table(null, 60f, null, null, null));
        var layout = CardLayoutEngine.layout(spec, slots(3));
        assertEquals(20 * MM, layout.rows().get(0).get(0).h(), 0.01f);
        assertEquals(20 * MM, layout.rows().get(1).get(0).h(), 0.01f);
        assertEquals(20 * MM, layout.rows().get(2).get(0).h(), 0.01f);
    }

    @Test
    void explicitTableWidthRespectsQrReservation() {
        // 二维码在左（size 20 + margin 1 = 21）、table.widthMm=60、内容区宽 66 → tW=66-21=45、tableX=contentX+21
        var b = CardLayoutEngine.Spec.defaults();
        var spec = new CardLayoutEngine.Spec(b.pageWidthMm(), b.pageHeightMm(), b.marginMm(),
                b.defaultFontSizePt(), b.lineHeightMm(), b.offsetXMm(), b.offsetYMm(),
                b.borderWidthMm(), b.borderColor(),
                new CardLayoutEngine.Spec.Qr(true, "__qr__", 20f, 1f, "top-left"),
                false, false,
                new CardLayoutEngine.Spec.Table(60f, null, null, null, null),
                null);
        var layout = CardLayoutEngine.layout(spec, slots(3));
        assertEquals(45 * MM, layout.rows().get(0).get(0).w(), 0.01f);
        assertEquals((2f + 21f) * MM, layout.rows().get(0).get(0).x(), 0.01f);
    }

    @Test
    void tableCenterStaysInsideSlotArea() {
        // 同上场景 + anchor="middle-center" → 表格在 slotArea 内水平居中，不与二维码重叠
        var b = CardLayoutEngine.Spec.defaults();
        var spec = new CardLayoutEngine.Spec(b.pageWidthMm(), b.pageHeightMm(), b.marginMm(),
                b.defaultFontSizePt(), b.lineHeightMm(), b.offsetXMm(), b.offsetYMm(),
                b.borderWidthMm(), b.borderColor(),
                new CardLayoutEngine.Spec.Qr(true, "__qr__", 20f, 1f, "top-left"),
                false, false,
                new CardLayoutEngine.Spec.Table(60f, null, "middle-center", null, null),
                null);
        var layout = CardLayoutEngine.layout(spec, slots(3));
        var row0 = layout.rows().get(0).get(0);
        var qr = layout.qrRect();
        assertEquals(45 * MM, row0.w(), 0.01f);
        assertEquals((2f + 21f) * MM, row0.x(), 0.01f);
        // 不与二维码重叠：表格左缘 >= 二维码右缘
        assertTrue(row0.x() >= qr.x() + qr.w() - 0.01f);
    }

    @Test
    void colWidthsLengthMismatchFallsBackPerIndex() {
        // colWidthsMm=[10,20,30] 但 colCount=2 → 用前两个（10、20）按比例缩放，不是等分
        var slot = CardLayoutEngine.Slot.ofCells(
                new CardLayoutEngine.Cell("A", "a"),
                new CardLayoutEngine.Cell("B", "b"));
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                .withTable(new CardLayoutEngine.Spec.Table(60f, null, null, 2, List.of(10f, 20f, 30f)));
        var layout = CardLayoutEngine.layout(spec, List.of(slot));
        assertEquals(20 * MM, layout.rows().get(0).get(0).w(), 0.01f);
        assertEquals(40 * MM, layout.rows().get(0).get(1).w(), 0.01f);
    }

    @Test
    void tableHeightShrinksToFixedRowSum() {
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                .withTable(new CardLayoutEngine.Spec.Table(null, null, null, null, null));
        var layout = CardLayoutEngine.layout(spec, List.of(
                rowWithHeight(20f), rowWithHeight(20f), rowWithHeight(20f)));
        // 未配表格高 + 全部行固定 20 → 块高收缩为 60，三行各 20mm
        assertEquals(20 * MM, layout.rows().get(0).get(0).h(), 0.01f);
        assertEquals(20 * MM, layout.rows().get(1).get(0).h(), 0.01f);
        assertEquals(20 * MM, layout.rows().get(2).get(0).h(), 0.01f);
    }

    @Test
    void tableAnchorWorksWhenAllRowsFixed() {
        var rows = List.of(rowWithHeight(20f), rowWithHeight(20f), rowWithHeight(20f));
        float contentY = 2f, contentH = 101f;
        var bottom = CardLayoutEngine.layout(
                CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                        .withTable(new CardLayoutEngine.Spec.Table(null, null, "bottom-center", null, null)),
                rows);
        var top = CardLayoutEngine.layout(
                CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                        .withTable(new CardLayoutEngine.Spec.Table(null, null, "top-center", null, null)),
                rows);
        // tH=60：bottom 首行 y = contentY + contentH - 60；top 首行 y = contentY
        assertEquals((contentY + contentH - 60f) * MM, bottom.rows().get(0).get(0).y(), 0.01f);
        assertEquals(contentY * MM, top.rows().get(0).get(0).y(), 0.01f);
        assertTrue(bottom.rows().get(0).get(0).y() != top.rows().get(0).get(0).y(),
                "锚点生效：bottom 与 top 首行 y 必须不同");
    }

    @Test
    void mixedRowsAutoRowUsesNaturalSplitNotFullFill() {
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                .withTable(new CardLayoutEngine.Spec.Table(null, null, null, null, null));
        var layout = CardLayoutEngine.layout(spec, List.of(
                rowWithHeight(20f), CardLayoutEngine.Slot.of("L1", "F1")));
        // 混合：1 行固定 20 + 1 行自动。autoRowH = 101/2 = 50.5，tH = min(101, 20+50.5) = 70.5
        // 自动行高 = tH - fixedTotal = 50.5（不再摊满剩余 81）
        assertEquals(20 * MM, layout.rows().get(0).get(0).h(), 0.01f);
        assertEquals(50.5f * MM, layout.rows().get(1).get(0).h(), 0.01f);
    }

    @Test
    void explicitTableHeightStillWinsWhenAllRowsFixed() {
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                .withTable(new CardLayoutEngine.Spec.Table(null, 100f, null, null, null));
        var layout = CardLayoutEngine.layout(spec, List.of(
                rowWithHeight(20f), rowWithHeight(20f), rowWithHeight(20f)));
        // 显式表格高 100 胜出：tH=100，三行仍各 20（底部留白 40）
        assertEquals(20 * MM, layout.rows().get(0).get(0).h(), 0.01f);
        assertEquals(20 * MM, layout.rows().get(1).get(0).h(), 0.01f);
        assertEquals(20 * MM, layout.rows().get(2).get(0).h(), 0.01f);
    }

    @Test
    void mixedRowsMakeTableHeightEqualRowSum() {
        // 纵向 70×105、边距 2 → contentH = 101；autoRowH = 101/2 = 50.5；tH = min(101, 20+50.5) = 70.5
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                .withTable(new CardLayoutEngine.Spec.Table(null, null, "bottom-center", null, null));
        var layout = CardLayoutEngine.layout(spec, List.of(
                rowWithHeight(20f), CardLayoutEngine.Slot.of("L1", "F1")));
        float contentY = 2f, contentH = 101f, tHmm = 70.5f;
        // 块高 = 各行高之和：固定行 20、自动行 50.5
        assertEquals(20 * MM, layout.rows().get(0).get(0).h(), 0.01f);
        assertEquals(50.5f * MM, layout.rows().get(1).get(0).h(), 0.01f);
        // bottom 锚点首行 y = contentY + contentH - tH = 2 + 30.5
        assertEquals((contentY + contentH - tHmm) * MM, layout.rows().get(0).get(0).y(), 0.01f);
    }

    @Test
    void mixedRowsAnchorActuallyMoves() {
        var rows = List.of(rowWithHeight(20f), CardLayoutEngine.Slot.of("L1", "F1"));
        float contentY = 2f, contentH = 101f, tHmm = 70.5f;
        var bottom = CardLayoutEngine.layout(
                CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                        .withTable(new CardLayoutEngine.Spec.Table(null, null, "bottom-center", null, null)),
                rows);
        var top = CardLayoutEngine.layout(
                CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                        .withTable(new CardLayoutEngine.Spec.Table(null, null, "top-center", null, null)),
                rows);
        // bottom 首行 y = contentY + contentH - tH = contentY + 30.5；top 首行 y = contentY（两者不同）
        assertEquals((contentY + contentH - tHmm) * MM, bottom.rows().get(0).get(0).y(), 0.01f);
        assertEquals(contentY * MM, top.rows().get(0).get(0).y(), 0.01f);
        assertTrue(bottom.rows().get(0).get(0).y() != top.rows().get(0).get(0).y(),
                "锚点生效：bottom 与 top 首行 y 必须不同");
    }

    @Test
    void allAutoStillFillsContent() {
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                .withTable(new CardLayoutEngine.Spec.Table(null, null, null, null, null));
        var layout = CardLayoutEngine.layout(spec, List.of(
                CardLayoutEngine.Slot.of("L0", "F0"),
                CardLayoutEngine.Slot.of("L1", "F1"),
                CardLayoutEngine.Slot.of("L2", "F2")));
        // 3 行全自动 → tH = contentH = 101，块铺满内容区（标准卡依赖）
        float contentY = 2f, contentH = 101f;
        assertEquals(contentH / 3f * MM, layout.rows().get(0).get(0).h(), 0.01f);
        assertEquals(contentH / 3f * MM, layout.rows().get(1).get(0).h(), 0.01f);
        assertEquals(contentH / 3f * MM, layout.rows().get(2).get(0).h(), 0.01f);
        // 末行底缘 = contentY + contentH（铺满）
        assertEquals((contentY + contentH) * MM,
                layout.rows().get(2).get(0).y() + layout.rows().get(2).get(0).h(), 0.01f);
    }
}
