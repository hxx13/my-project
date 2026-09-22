package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.dto.TransferFormRenderInput;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 签位落地规则：**有电子签名就打签名图（纯图），没有就退回姓名文字。**
 *
 * <p>走 {@link TransferFormRenderer#renderToDocx} 解包 docx 查产物 —— 转 PDF 要本机装
 * LibreOffice，单测不该依赖它。人数看 {@code <w:drawing} 的个数与姓名字符串的个数。
 */
class TransferFormSignatureTest {

    private static final String ORIGIN = "甲签字";
    private static final String DEST = "乙签字";
    private static final String VET = "丙签字";
    /** 实验人员姓名：没有签名时印两处（表头 + 签位），有签名时只剩表头一处。 */
    private static final String EXPERIMENTER = "丁签字";

    @Test
    void 有电子签名就打图_签位不再印姓名() throws Exception {
        TransferFormRenderInput in = base();
        in.setOriginReviewerName(ORIGIN);
        in.setOriginReviewerSignature(pngDataUrl(0));
        in.setExperimenterName(EXPERIMENTER);
        in.setExperimenterSignature(pngDataUrl(1));

        byte[] docx = TransferFormRenderer.renderToDocx(in);
        String xml = documentXml(docx);

        assertEquals(2, count(xml, "<w:drawing"), "两个签位各一张签名图");
        assertFalse(xml.contains(ORIGIN), "有签名就不该再印姓名");
        assertEquals(1, count(xml, EXPERIMENTER), "实验人员姓名只剩表头那一处");
        assertTrue(mediaEntries(docx) >= 3, "签名图必须真的嵌进包里（模板自带两张页眉 logo）");
    }

    /**
     * 签名图必须是**浮动锚定**的。内联图要占一行，四个签位就把「复核人（签字）」顶到第 2 页去；
     * 这条断言是那件事的回归闸 —— 谁把 anchor 改回 inline，这里就红。
     */
    @Test
    void 签名图是浮动的_不占行高() throws Exception {
        TransferFormRenderInput in = base();
        in.setOriginReviewerSignature(pngDataUrl(0));
        in.setVetReviewerSignature(pngDataUrl(1));

        String xml = documentXml(TransferFormRenderer.renderToDocx(in));

        assertEquals(2, count(xml, "<wp:anchor"), "两张图都该是锚定图");
        assertEquals(0, count(xml, "<wp:inline"), "不该残留内联图");
    }

    @Test
    void 没有电子签名就退回姓名文字() throws Exception {
        TransferFormRenderInput in = base();
        in.setOriginReviewerName(ORIGIN);
        in.setDestReviewerName(DEST);
        in.setVetReviewerName(VET);
        in.setExperimenterName(EXPERIMENTER);

        String xml = documentXml(TransferFormRenderer.renderToDocx(in));

        assertEquals(0, count(xml, "<w:drawing"), "没签名不该有任何图");
        assertTrue(xml.contains(ORIGIN));
        assertTrue(xml.contains(DEST));
        assertTrue(xml.contains(VET));
        assertEquals(2, count(xml, EXPERIMENTER), "没签名时姓名照旧印两处");
    }

    @Test
    void 签名图坏了也退回姓名_不让单据开天窗() throws Exception {
        TransferFormRenderInput in = base();
        in.setOriginReviewerName(ORIGIN);
        in.setOriginReviewerSignature("data:image/png;base64,这不是base64");
        in.setDestReviewerName(DEST);
        in.setDestReviewerSignature("就是一段普通文本");

        String xml = documentXml(TransferFormRenderer.renderToDocx(in));

        assertEquals(0, count(xml, "<w:drawing"));
        assertTrue(xml.contains(ORIGIN));
        assertTrue(xml.contains(DEST));
    }

    /** 现画一张 800×300 的 PNG 当签名 —— 与前端签名画布同尺寸，位移参数保证两张图不同。 */
    private static String pngDataUrl(int offset) throws IOException {
        BufferedImage img = new BufferedImage(800, 300, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, 800, 300);
        g.setColor(Color.BLACK);
        g.setStroke(new BasicStroke(6f));
        g.drawLine(60, 200 - offset * 40, 740, 100 + offset * 40);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return "data:image/png;base64," + Base64.getEncoder().encodeToString(out.toByteArray());
    }

    private static TransferFormRenderInput base() {
        TransferFormRenderInput in = new TransferFormRenderInput();
        in.setDocNo("20260920-测试-1");
        in.setUnitName("某课题组");
        in.setPiName("PI 本人");
        in.setExperimenterName(EXPERIMENTER);
        in.setPhone("13800000000");
        in.setTransferDate("2026年9月20日");
        in.setFromLocation("A架-A-1");
        in.setToLocation("B架-B-2");
        TransferFormRenderInput.Row row = new TransferFormRenderInput.Row();
        row.setStrain("C57BL/6");
        row.setFemale(3);
        row.setMale(2);
        in.setRows(List.of(row));
        return in;
    }

    private static String documentXml(byte[] docx) throws IOException {
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(docx))) {
            ZipEntry e;
            while ((e = zis.getNextEntry()) != null) {
                if ("word/document.xml".equals(e.getName())) {
                    return new String(zis.readAllBytes(), StandardCharsets.UTF_8);
                }
            }
        }
        throw new AssertionError("产物里没有 word/document.xml");
    }

    private static long mediaEntries(byte[] docx) throws IOException {
        long n = 0;
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(docx))) {
            ZipEntry e;
            while ((e = zis.getNextEntry()) != null) {
                if (e.getName().startsWith("word/media/")) n++;
            }
        }
        return n;
    }

    private static int count(String haystack, String needle) {
        int n = 0;
        for (int i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + needle.length())) {
            n++;
        }
        return n;
    }
}
