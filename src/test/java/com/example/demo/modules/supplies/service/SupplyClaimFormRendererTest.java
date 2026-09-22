package com.example.demo.modules.supplies.service;

import com.example.demo.modules.supplies.dto.SupplyClaimFormInput;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.geom.Path2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 领用单渲染器的回归测试。
 *
 * <p>走 {@link SupplyClaimFormRenderer#renderToDocx} 解包 docx 查产物 —— 转 PDF 要本机装
 * LibreOffice，单测不该依赖它。
 */
class SupplyClaimFormRendererTest {

    /** 不足 10 行也要渲染 10 行（空行留着手写），超过就按实际。 */
    @Test
    void 明细行数下限十行_超过按实际() {
        assertEquals(10, SupplyClaimFormRenderer.itemRowCount(0));
        assertEquals(10, SupplyClaimFormRenderer.itemRowCount(3));
        assertEquals(10, SupplyClaimFormRenderer.itemRowCount(10));
        assertEquals(12, SupplyClaimFormRenderer.itemRowCount(12));
        assertEquals(20, SupplyClaimFormRenderer.itemRowCount(20));
    }

    /** 行数、单号行、签字行、明细落格：3 项明细 → 渲 10 行，多出来的整行留白。 */
    @Test
    void 三行明细渲染十行_空行留白() throws Exception {
        byte[] docx = SupplyClaimFormRenderer.renderToDocx(input(3));
        String xml = documentXml(docx);

        // 标题 + 单号 + 表头 + 列头 + 10 明细 + 签字 + 注意事项 = 16 行
        assertEquals(16, countRows(xml), "3 项明细也应渲染 10 个明细行");

        assertTrue(xml.contains("单号"), "单号行要印出来");
        assertTrue(xml.contains("20260923-位亚磊-1"));
        assertTrue(xml.contains("领用人员签字"), "签字行要印出来");
        assertTrue(xml.contains("出库人签字"));
        assertTrue(xml.contains("3楼 301"), "领用楼层要落进表头");
        assertTrue(xml.contains("胶棉拖把"), "第一条明细要落格");
        assertTrue(xml.contains("2026-09-23"), "实际领用日期每行都印出库日");

        // 第 4 条及之后是空行：整行留白，连出库日都不填
        assertEquals(3, count(xml, "2026-09-23"), "只有 3 条明细，出库日只该出现 3 次");
    }

    @Test
    void 十二行明细渲染十二行() throws Exception {
        String xml = documentXml(SupplyClaimFormRenderer.renderToDocx(input(12)));
        assertEquals(18, countRows(xml), "12 项明细 → 12 行（+6 个固定行）");
        assertEquals(12, count(xml, "2026-09-23"));
    }

    /** 单号行整行跨 6 列；签字行两格各跨 3 列。 */
    @Test
    void 新增两行的合并跨度() throws Exception {
        String xml = documentXml(SupplyClaimFormRenderer.renderToDocx(input(3)));

        // 整行跨 6 的是三行：标题、单号、注意事项
        assertEquals(3, count(xml, "<w:gridSpan w:val=\"6\"/>"), "标题 / 单号 / 注意事项整行跨 6");
        assertEquals(2, count(xml, "<w:gridSpan w:val=\"3\"/>"), "签字行两格各跨 3");
    }

    /** 签名图必须是**内联**（wp:inline）—— 这张单子不吃高度，不需要转移单那套浮动锚定。 */
    @Test
    void 签名图是内联的() throws Exception {
        String xml = documentXml(SupplyClaimFormRenderer.renderToDocx(input(2)));

        assertEquals(2, count(xml, "<wp:inline"), "领用人 + 出库人两张内联图");
        assertEquals(0, count(xml, "<wp:anchor"), "不该出现浮动锚定图");
    }

    /** 页眉 logo 插在 header 部分而不是正文；页眉段落要清掉首行缩进，否则跟表格左边缘错开。 */
    @Test
    void 页眉带logo且无首行缩进() throws Exception {
        byte[] docx = SupplyClaimFormRenderer.renderToDocx(input(2));

        String header = null;
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(docx))) {
            ZipEntry e;
            while ((e = zis.getNextEntry()) != null) {
                if ("word/header1.xml".equals(e.getName())) {
                    header = new String(zis.readAllBytes(), StandardCharsets.UTF_8);
                }
            }
        }
        assertTrue(header != null, "产物里应该有 word/header1.xml");
        assertTrue(header.contains("<wp:inline"), "logo 是内联图插在页眉里");
        assertTrue(header.contains("<w:ind w:left=\"0\" w:firstLine=\"0\"/>")
                        || header.contains("w:firstLine=\"0\""),
                "页眉段落要清掉首行缩进，才能贴齐表格左边缘");
    }

    /** 列宽：数量两类列收窄、备注加宽，且六列合计等于正文可用宽度。 */
    @Test
    void 列宽按可用宽度铺满() throws Exception {
        String xml = documentXml(SupplyClaimFormRenderer.renderToDocx(input(3)));

        assertTrue(xml.contains("<w:tblGrid><w:gridCol w:w=\"2119\"/><w:gridCol w:w=\"1270\"/>"
                        + "<w:gridCol w:w=\"1056\"/><w:gridCol w:w=\"1476\"/>"
                        + "<w:gridCol w:w=\"1266\"/><w:gridCol w:w=\"1119\"/></w:tblGrid>"),
                "表格网格要按调过的六列宽度写");
    }

    /**
     * 历史记录：老单子没有领用楼层、没提交过电子签名、没有型号规格/备注/出库量 ——
     * 单子照样要出得来，缺的地方留白手写，**不能把 Java 的 null 印到正式单据上**。
     */
    @Test
    void 历史单据缺字段也能出单() throws Exception {
        SupplyClaimFormInput in = new SupplyClaimFormInput();
        in.setDocNo("20260726-位亚磊-1");
        in.setApplicantName("位亚磊");
        in.setFillDate("2026-07-26");
        // 领用楼层、实际领用日期、两张签名、型号规格、备注全为空
        SupplyClaimFormInput.Row row = new SupplyClaimFormInput.Row();
        row.setName("电击式灭蚊灯");
        row.setQty(1);
        in.getRows().add(row);

        String xml = documentXml(SupplyClaimFormRenderer.renderToDocx(in));

        assertTrue(xml.contains("电击式灭蚊灯"), "老明细要落格");
        assertTrue(xml.contains("20260726-位亚磊-1"));
        assertTrue(xml.contains("领用人员签字"), "没电子签名也要留出签字栏手写");
        assertFalse(xml.contains("null"), "缺字段不能把 null 印上单子");
        assertEquals(0, count(xml, "<wp:inline"), "没有电子签名就一张图都不插");
    }

    /**
     * 空位靠左、有值居中：表头那三格最典型 —— 「领用人员：位亚磊」有值该居中，
     * 「领用楼层：」标签在、值空着，必须靠左，否则手写要从格子中间起笔。
     */
    @Test
    void 空位靠左_有值居中() throws Exception {
        SupplyClaimFormInput in = input(2);
        in.setClaimFloor(null);

        String xml = documentXml(SupplyClaimFormRenderer.renderToDocx(in));
        List<String> headerCells = cellsOf(rowContaining(xml, "领用楼层"));

        assertTrue(headerCells.get(0).contains("<w:jc w:val=\"center\"/>"), "领用人员有值 → 居中");
        assertTrue(headerCells.get(1).contains("<w:jc w:val=\"left\"/>"), "领用楼层空着 → 靠左");
    }

    private static SupplyClaimFormInput input(int rows) throws IOException {
        SupplyClaimFormInput in = new SupplyClaimFormInput();
        in.setDocNo("20260923-位亚磊-1");
        in.setApplicantName("位亚磊");
        in.setClaimFloor("3楼 301");
        in.setFillDate("2026-09-21");
        in.setIssueDate("2026-09-23");
        String[] names = {"胶棉拖把", "白色纸盒", "辐照灭菌老鼠饲料", "安利喷雾瓶"};
        for (int i = 0; i < rows; i++) {
            SupplyClaimFormInput.Row row = new SupplyClaimFormInput.Row();
            row.setName(names[i % names.length]);
            row.setSpec(i % 2 == 0 ? "中号" : null);
            row.setQty(1 + i);
            row.setFulfilledQty(i + 1);
            row.setRemark(i % 2 == 0 ? "按需领用" : null);
            in.getRows().add(row);
        }
        in.setApplicantSignature(signature(0));
        in.setIssuerSignature(signature(1));
        return in;
    }

    private static String signature(int seed) throws IOException {
        BufferedImage img = new BufferedImage(800, 300, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, 800, 300);
        g.setColor(Color.BLACK);
        g.setStroke(new BasicStroke(5f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        Path2D p = new Path2D.Double();
        p.moveTo(90, 210);
        p.curveTo(160, 60 + seed * 30, 260, 250, 330, 90);
        p.curveTo(560, 40, 620, 200, 710, 100);
        g.draw(p);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return "data:image/png;base64," + Base64.getEncoder().encodeToString(out.toByteArray());
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

    private static int count(String haystack, String needle) {
        int n = 0;
        for (int i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + needle.length())) {
            n++;
        }
        return n;
    }

    /**
     * 数表格行。**不能用 {@code <w:tr} 当特征**：它会把 {@code <w:trPr>} 与 {@code <w:trHeight>}
     * 一起数进来（一行三命中）。行元素只有 {@code <w:tr>} 或带属性的 {@code <w:tr ...>} 两种写法。
     */
    private static int countRows(String xml) {
        return count(xml, "<w:tr>") + count(xml, "<w:tr ");
    }

    /** 含某段文字的那一行（按 {@code <w:tr} 切，够用：本测试只找唯一一段文字）。 */
    private static String rowContaining(String xml, String text) {
        for (String row : xml.split("(?=<w:tr)")) {
            if (row.contains(text)) return row;
        }
        throw new AssertionError("产物里没有含「" + text + "」的行");
    }

    /** 把一行按单元格切开。 */
    private static List<String> cellsOf(String row) {
        List<String> out = new ArrayList<>();
        String[] parts = row.split("(?=<w:tc[ >])");
        for (int i = 1; i < parts.length; i++) {   // parts[0] 是 <w:tr ...> 到第一格之前
            out.add(parts[i]);
        }
        return out;
    }
}
