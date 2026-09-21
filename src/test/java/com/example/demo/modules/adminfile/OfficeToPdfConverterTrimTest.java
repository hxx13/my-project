package com.example.demo.modules.adminfile;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

/**
 * 裁尾页（{@link OfficeToPdfConverter#dropTrailingRepeatedPages}）的判据验证。
 *
 * <p>样本全部用 PDFBox 现场合成，不依赖任何外部文件，也不读网络。
 * 被测方法是私有的、且只有 {@code convert()} 一条调用路径（那条路要真跑 LibreOffice），
 * 所以这里用反射直接怼私有方法。
 */
class OfficeToPdfConverterTrimTest {

    private static final OfficeToPdfConverter CONVERTER = new OfficeToPdfConverter("", 120);

    private static byte[] trim(byte[] pdf) throws Exception {
        Method m = OfficeToPdfConverter.class.getDeclaredMethod("dropTrailingRepeatedPages", byte[].class);
        m.setAccessible(true);
        return (byte[]) m.invoke(CONVERTER, pdf);
    }

    // ---------- A：纯重复尾页 → 裁掉 ----------

    @Test
    void 纯重复尾页被裁掉() throws Exception {
        byte[] src = build(doc -> {
            addTextPage(doc, "A");
            addTextPage(doc, "A");   // 模拟重复的页眉/页脚
        });
        assertEquals(2, pageCount(src), "样本本身就该是 2 页");

        byte[] out = trim(src);

        assertEquals(1, pageCount(out));
        assertEquals("A", pageText(out, 0));
    }

    // ---------- B：尾页有真内容 → 保留 ----------

    @Test
    void 尾页有新文字时保留() throws Exception {
        byte[] src = build(doc -> {
            addTextPage(doc, "A");
            addTextPage(doc, "B");
        });

        byte[] out = trim(src);

        assertEquals(2, pageCount(out));
        assertSame(src, out, "没得裁就该原样返回原字节，不重建 PDF");
    }

    // ---------- C：本来就 1 页 → 不动 ----------

    @Test
    void 单页文档原样返回() throws Exception {
        byte[] src = build(doc -> addTextPage(doc, "A"));

        byte[] out = trim(src);

        assertSame(src, out);
        assertArrayEquals(src, out);
        assertEquals(1, pageCount(out));
    }

    // ---------- D：尾页只有矢量 → 保留（保守） ----------

    @Test
    void 尾页只有矢量图元时保留() throws Exception {
        byte[] src = build(doc -> {
            addTextPage(doc, "A");
            addLinePage(doc);   // 只有一条线，没有文字
        });

        byte[] out = trim(src);

        assertEquals(2, pageCount(out));
        assertSame(src, out);
    }

    // ---------- E：中间夹一张纯重复页 → 只裁那一张 ----------

    @Test
    void 中间夹的纯重复页被裁掉且后面真内容还在() throws Exception {
        byte[] src = build(doc -> {
            addTextPage(doc, "A");
            addTextPage(doc, "A");   // 重复页
            addTextPage(doc, "C");   // 真内容
        });
        assertEquals(3, pageCount(src));

        byte[] out = trim(src);

        assertEquals(2, pageCount(out));
        assertEquals("A", pageText(out, 0));
        assertEquals("C", pageText(out, 1), "第 3 页的真内容不能被一起剪掉");
    }

    // ---------- F：同一张图同位置重复 → 裁掉 ----------

    @Test
    void 尾页只有同图同位置的重复图片时被裁掉() throws Exception {
        byte[] src = build(doc -> {
            addTextAndImagePage(doc, "A", logo(doc, 0x336699), 72, 600);
            addTextAndImagePage(doc, "A", logo(doc, 0x336699), 72, 600);
        });

        byte[] out = trim(src);

        assertEquals(1, pageCount(out));
    }

    // ---------- G：尾页换了张图 → 保留（保守） ----------

    @Test
    void 尾页图片不同时保留() throws Exception {
        byte[] src = build(doc -> {
            addTextAndImagePage(doc, "A", logo(doc, 0x336699), 72, 600);
            addTextAndImagePage(doc, "A", logo(doc, 0x993333), 72, 600);
        });

        byte[] out = trim(src);

        assertEquals(2, pageCount(out));
        assertSame(src, out);
    }

    // ---------- 造样本 ----------

    @FunctionalInterface
    private interface Pages {
        void add(PDDocument doc) throws IOException;
    }

    private static byte[] build(Pages pages) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            pages.add(doc);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return out.toByteArray();
        }
    }

    private static void addTextPage(PDDocument doc, String text) throws IOException {
        PDPage page = new PDPage(PDRectangle.A4);
        doc.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            cs.newLineAtOffset(72, 700);
            cs.showText(text);
            cs.endText();
        }
    }

    private static void addLinePage(PDDocument doc) throws IOException {
        PDPage page = new PDPage(PDRectangle.A4);
        doc.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            cs.moveTo(72, 500);
            cs.lineTo(500, 500);
            cs.stroke();
        }
    }

    private static void addTextAndImagePage(PDDocument doc, String text, PDImageXObject img,
                                           float x, float y) throws IOException {
        PDPage page = new PDPage(PDRectangle.A4);
        doc.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            cs.newLineAtOffset(72, 700);
            cs.showText(text);
            cs.endText();
            cs.drawImage(img, x, y, 40, 40);
        }
    }

    /** 纯色小图；同一个颜色两次生成的图片流字节相同，也就是「同一张图」 */
    private static PDImageXObject logo(PDDocument doc, int rgb) throws IOException {
        BufferedImage bi = new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = bi.createGraphics();
        g.setColor(new Color(rgb));
        g.fillRect(0, 0, 8, 8);
        g.dispose();
        return LosslessFactory.createFromImage(doc, bi);
    }

    // ---------- 断言辅助 ----------

    private static int pageCount(byte[] pdf) throws IOException {
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            return doc.getNumberOfPages();
        }
    }

    private static String pageText(byte[] pdf, int index) throws IOException {
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            PDFTextStripper s = new PDFTextStripper();
            s.setStartPage(index + 1);
            s.setEndPage(index + 1);
            return s.getText(doc).trim();
        }
    }
}
