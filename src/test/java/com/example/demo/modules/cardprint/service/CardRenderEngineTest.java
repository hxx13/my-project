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
import org.junit.jupiter.api.Test;

import java.awt.image.BufferedImage;
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
}
