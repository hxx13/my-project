package com.example.demo.modules.cardprint.service;

import com.google.zxing.BinaryBitmap;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.client.j2se.BufferedImageLuminanceSource;
import com.google.zxing.common.HybridBinarizer;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.junit.jupiter.api.Test;

import java.awt.image.BufferedImage;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 渲染引擎契约：N 条数据 → N 页 70×105mm，中文可提取，二维码可解码回 animalCageId。 */
class CardRenderEngineTest {

    private static final float MM = 72f / 25.4f;
    private final CardRenderEngine engine = new CardRenderEngine();

    @Test
    void rendersOnePagePerRow() throws Exception {
        List<CardLayoutEngine.Slot> slots = List.of(
                CardLayoutEngine.Slot.of("房间号: ", "roomName"),
                CardLayoutEngine.Slot.of("PI: ", "projectPiName"));
        byte[] pdf = engine.render(CardLayoutEngine.Spec.defaults(), slots, List.of(
                Map.of("roomName", "605A", "projectPiName", "郭滨", "__qr__", "1234567890123456789"),
                Map.of("roomName", "605B", "projectPiName", "张三", "__qr__", "2234567890123456789"),
                Map.of("roomName", "605C", "projectPiName", "李四", "__qr__", "3234567890123456789")));

        try (PDDocument doc = Loader.loadPDF(pdf)) {
            assertEquals(3, doc.getNumberOfPages());
            PDPage p0 = doc.getPage(0);
            assertEquals(70 * MM, p0.getMediaBox().getWidth(), 0.5f);
            assertEquals(105 * MM, p0.getMediaBox().getHeight(), 0.5f);
            // PDFBox 3.x 的 PDFTextStripper 无 getText(PDPage) 重载，只能整篇取再限定页范围
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setStartPage(1);
            stripper.setEndPage(1);
            String text = stripper.getText(doc);
            assertTrue(text.contains("605A"), "第一页应含房间号");
            assertTrue(text.contains("郭滨"), "第一页应含 PI 中文");
        }
    }

    @Test
    void blankValueDoesNotPrintNull() throws Exception {
        List<CardLayoutEngine.Slot> slots = List.of(CardLayoutEngine.Slot.of("PI: ", "projectPiName"));
        byte[] pdf = engine.render(CardLayoutEngine.Spec.defaults().withQrEnabled(false), slots,
                List.of(new java.util.HashMap<>() {{ put("roomName", "605A"); }}));
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(doc);
            assertTrue(text.contains("PI:"), "标签仍应打印");
            assertTrue(!text.contains("null"), "空值不应打印 null");
        }
    }

    @Test
    void qrImageDecodesBackToCageId() throws Exception {
        BufferedImage img = CardRenderEngine.encodeQr("1234567890123456789", 300);
        var bitmap = new BinaryBitmap(new HybridBinarizer(new BufferedImageLuminanceSource(img)));
        assertEquals("1234567890123456789", new MultiFormatReader().decode(bitmap).getText());
    }

    @Test
    void renderedPdfContainsDecodableQr() throws Exception {
        List<CardLayoutEngine.Slot> slots = List.of(CardLayoutEngine.Slot.of("位置: ", "__position__"));
        byte[] pdf = engine.render(CardLayoutEngine.Spec.defaults(), slots,
                List.of(Map.of("__position__", "605A", "__qr__", "1234567890123456789")));
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            PDFRenderer renderer = new PDFRenderer(doc);
            BufferedImage img = renderer.renderImageWithDPI(0, 200);
            var bitmap = new BinaryBitmap(new HybridBinarizer(new BufferedImageLuminanceSource(img)));
            assertEquals("1234567890123456789", new MultiFormatReader().decode(bitmap).getText(),
                    "渲染进 PDF 的二维码必须能解码回 animalCageId");
        }
    }

    @Test
    void unsupportedGlyphDoesNotBreakRendering() throws Exception {
        List<CardLayoutEngine.Slot> slots = List.of(CardLayoutEngine.Slot.of("备注: ", "experimentDesc"));
        byte[] pdf = engine.render(CardLayoutEngine.Spec.defaults().withQrEnabled(false), slots,
                List.of(Map.of("experimentDesc", "正常文字 😀 emoji 也要能出 PDF")));
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            assertEquals(1, doc.getNumberOfPages());
        }
    }

    @Test
    void rendersThreeColumnRow() throws Exception {
        List<CardLayoutEngine.Slot> slots = List.of(CardLayoutEngine.Slot.ofCells(
                new CardLayoutEngine.Cell("周龄: ", "age"),
                new CardLayoutEngine.Cell("性别: ", "sex"),
                new CardLayoutEngine.Cell("公: ", "male")));
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                .withTable(new CardLayoutEngine.Spec.Table(null, null, null, 3, null));
        byte[] pdf = engine.render(spec, slots, List.of(Map.of("age", "6", "sex", "雄", "male", "3")));
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(doc);
            assertTrue(text.contains("周龄: 6"), "第一列标签与值");
            assertTrue(text.contains("性别: 雄"), "第二列标签与值");
            assertTrue(text.contains("公: 3"), "第三列标签与值");
        }
    }

    /** 行中间留空的格子不产矩形，后面的格子不能被挤掉内容。 */
    @Test
    void middleEmptyCellDoesNotShiftLaterCells() throws Exception {
        List<CardLayoutEngine.Slot> slots = List.of(CardLayoutEngine.Slot.ofCells(
                new CardLayoutEngine.Cell("周龄: ", "age"),
                new CardLayoutEngine.Cell("", null),
                new CardLayoutEngine.Cell("公: ", "male")));
        var spec = CardLayoutEngine.Spec.defaults().withQrEnabled(false)
                .withTable(new CardLayoutEngine.Spec.Table(null, null, null, 3, null));
        byte[] pdf = engine.render(spec, slots, List.of(Map.of("age", "6", "male", "3")));
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(doc);
            assertTrue(text.contains("周龄: 6"), "第一列");
            assertTrue(text.contains("公: 3"), "第三列内容不能被中间空格挤掉");
        }
    }

    /** 默认 spec（defaultFontWeight 为 null → 视为 700 加粗）应请求加粗字体且正常产出 PDF。 */
    @Test
    void defaultWeightIsBold() throws Exception {
        List<CardLayoutEngine.Slot> slots = List.of(CardLayoutEngine.Slot.of("PI: ", "projectPiName"));
        byte[] pdf = engine.render(CardLayoutEngine.Spec.defaults().withQrEnabled(false), slots,
                List.of(Map.of("projectPiName", "郭滨")));
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            assertEquals(1, doc.getNumberOfPages());
            String text = new PDFTextStripper().getText(doc);
            assertTrue(text.contains("PI:"), "默认字重仍应打印标签");
            assertTrue(text.contains("郭滨"), "默认字重仍应提取中文值");
        }
    }

    /** slot.fontWeight = 400（细字重）仍能正常产出 PDF 且文本可提取。 */
    @Test
    void lightWeightStillRenders() throws Exception {
        CardLayoutEngine.Slot slot = new CardLayoutEngine.Slot(
                null, "PI: ", "projectPiName", null, null, "left", Boolean.TRUE, null, null, 400, null);
        byte[] pdf = engine.render(CardLayoutEngine.Spec.defaults().withQrEnabled(false), List.of(slot),
                List.of(Map.of("projectPiName", "郭滨")));
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            assertEquals(1, doc.getNumberOfPages());
            String text = new PDFTextStripper().getText(doc);
            assertTrue(text.contains("郭滨"), "细字重仍应提取中文值");
        }
    }

    /** 捕获每个 writeString 的首字符坐标（x 为 XDirAdj、y 为 YDirAdj）。 */
    private static final class PositionStripper extends PDFTextStripper {
        final List<float[]> positions = new ArrayList<>();
        @Override
        protected void writeString(String text, List<TextPosition> textPositions) throws java.io.IOException {
            if (!textPositions.isEmpty()) {
                TextPosition first = textPositions.get(0);
                positions.add(new float[]{first.getXDirAdj(), first.getYDirAdj()});
            }
            super.writeString(text, textPositions);
        }
    }

    private byte[] renderAligned(String hAlign, String vAlign) throws Exception {
        CardLayoutEngine.Slot slot = new CardLayoutEngine.Slot(
                null, "PI: ", "projectPiName", null, null, hAlign, Boolean.TRUE, null, null, null, vAlign);
        return engine.render(CardLayoutEngine.Spec.defaults().withQrEnabled(false), List.of(slot),
                List.of(Map.of("projectPiName", "郭滨")));
    }

    private float[] firstPosition(byte[] pdf) throws Exception {
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            PositionStripper stripper = new PositionStripper();
            stripper.getText(doc);
            assertTrue(!stripper.positions.isEmpty(), "应捕获到文本坐标");
            return stripper.positions.get(0);
        }
    }

    @Test
    void slotAlignMovesTextX() throws Exception {
        float xLeft = firstPosition(renderAligned("left", "middle"))[0];
        float xCenter = firstPosition(renderAligned("center", "middle"))[0];
        float xRight = firstPosition(renderAligned("right", "middle"))[0];
        assertTrue(xLeft < xCenter, "left < center 首字符 x 应递增");
        assertTrue(xCenter < xRight, "center < right 首字符 x 应递增");
        assertTrue(xLeft != xCenter && xCenter != xRight, "三种水平对齐的 x 必须彼此不同");
    }

    @Test
    void slotVAlignMovesTextY() throws Exception {
        float yTop = firstPosition(renderAligned("left", "top"))[1];
        float yMiddle = firstPosition(renderAligned("left", "middle"))[1];
        float yBottom = firstPosition(renderAligned("left", "bottom"))[1];
        // getYDirAdj 原点在左上（文本方向）：越靠上 y 越小
        assertTrue(yTop < yMiddle, "top 应在 middle 上方（y 更小）");
        assertTrue(yMiddle < yBottom, "middle 应在 bottom 上方（y 更小）");
        assertTrue(yTop != yMiddle && yMiddle != yBottom, "三种垂直对齐的 y 必须彼此不同");
    }
}
