package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.dto.TransferFormRenderInput;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 版式上两件「按数量自适应」的事：多笼位地点换行、复核意见块段间距随笼位数伸缩。 */
class TransferFormLayoutTest {

    /** 服务层用 {@code \n} 分隔多笼位地点；渲染器必须落成 {@code <w:br/>}，塞进 w:t 里是不换行的。 */
    @Test
    void 多笼位地点落成真换行() throws Exception {
        String xml = documentXml(input(3));

        // 每格：标题自己一个换行 + 3 项地点之间 2 个换行 = 3；转出、接收两格共 6
        assertEquals(6, count(xml, "<w:br"), "标题独立一行 + 地点一项一行");
    }

    /** 标题必须自己占一行：接在第一项前面会把那一项挤得断行，反而更乱。 */
    @Test
    void 单笼位也是标题一行_地点一行() throws Exception {
        assertEquals(2, count(documentXml(input(1)), "<w:br"), "两格各把标题和地点分开");
    }

    @Test
    void 没有地点就不插换行_也不印出null() throws Exception {
        TransferFormRenderInput in = input(1);
        in.setFromLocation(null);
        in.setToLocation("   ");
        String xml = documentXml(in);

        assertEquals(0, count(xml, "<w:br"));
        // "\n" + null 会拼成 "\nnull" —— 先判空再拼，不然单子上真的印出「null」
        assertFalse(xml.contains("null"), "地点缺失时不该出现 Java 的 null 字样");
    }

    /** 提交日期行是渲染时插的（模板里没有），标签与值都要落在产物里。 */
    @Test
    void 提交日期行印出来了() throws Exception {
        TransferFormRenderInput in = input(1);
        in.setTransferDate("2026-09-23");
        in.setSubmitDate("2026-09-22");

        String xml = documentXml(in);

        assertTrue(xml.contains("申请方提交实验动物转移单日期"), "提交日期行的标签要印出来");
        assertTrue(xml.contains("2026-09-22"), "提交日期要印出来");
        assertTrue(xml.contains("2026-09-23"), "拟定日期那行还在");
    }

    /** 取不到提交日期时只留标签；顺带挡住 {@code "\n" + null} 那类把 null 印上单子的写法。 */
    @Test
    void 提交日期取不到只留标签() throws Exception {
        TransferFormRenderInput in = input(1);
        in.setSubmitDate(null);

        String xml = documentXml(in);

        assertTrue(xml.contains("申请方提交实验动物转移单日期"));
        assertFalse(xml.contains("null"), "不该把 Java 的 null 印到正式单据上");
    }

    /**
     * 行前留白：笼位少时给满（行不再紧贴表格横线），多到本来就要两页时收 0 ——
     * 留白是「锦上添花」，永远不许把单子顶到第 2 页。
     */
    @Test
    void 行前留白按余量给_放不下时为0() {
        assertEquals(2, TransferFormRenderer.rowPadPt(1, shortLoc(1), shortLoc(1)));
        assertTrue(TransferFormRenderer.rowPadPt(4, shortLoc(4), shortLoc(4))
                <= TransferFormRenderer.rowPadPt(1, shortLoc(1), shortLoc(1)), "笼位越多留白越少");
        assertEquals(0, TransferFormRenderer.rowPadPt(6, shortLoc(6), shortLoc(6)), "本来就要两页，不能再加");
        assertEquals(0, TransferFormRenderer.rowPadPt(50, shortLoc(50), shortLoc(50)));
    }

    /** 行数决定留白摊到多少行上：模板 9 行 + 渲染时插的 2 行（单号、提交日期）+ 多出来的数据行。 */
    @Test
    void 行数按模板加插入行算() {
        assertEquals(11, TransferFormRenderer.tableRows(1));
        assertEquals(13, TransferFormRenderer.tableRows(3));
        assertEquals(11, TransferFormRenderer.tableRows(0), "0 笼位按 1 笼位算");
    }

    /**
     * 复核意见块的空档是全表唯一的「余量池」：笼位越多空档越小，笼位少时用它撑满一页。
     * 上界护住 1~2 笼位时别把字推得太开，下界护住别出现负间距。
     */
    @Test
    void 段间距随笼位数递减且不越界() {
        assertTrue(gap(1, shortLoc(1)) > gap(3, shortLoc(3)),
                "1 笼位的空档要比 3 笼位大（它就是拿来撑满一页的）");
        assertTrue(gap(3, shortLoc(3)) > gap(5, shortLoc(5)));
        assertEquals(0, gap(6, shortLoc(6)), "笼位多到放不下时空档归零");
        assertEquals(0, gap(50, shortLoc(50)));
        assertTrue(gap(1, shortLoc(1)) <= 40, "再少也不能把字推开到超过上限");
        assertEquals(gap(1, shortLoc(1)), gap(0, shortLoc(1)), "0 笼位（全空单）按 1 笼位算");
    }

    /** 地点名长会折行，那部分高度是表格自己长的，余量得先扣掉，否则整张表被顶到第 2 页。 */
    @Test
    void 地点折行先吃掉余量() {
        assertTrue(gap(2, longLoc(2)) < gap(2, shortLoc(2)), "折行多时空档要更小");
        assertEquals(0, gap(3, longLoc(3)), "折到放不下时空档直接归零");
        assertEquals(gap(2, shortLoc(2)), gap(2, null, "   "), "没有地点就不占行");
    }

    private static int gap(int cageCount, String loc) {
        return TransferFormRenderer.vetGapPt(cageCount, loc, loc);
    }

    private static int gap(int cageCount, String from, String to) {
        return TransferFormRenderer.vetGapPt(cageCount, from, to);
    }

    /** n 项地点，每项都短到一行放得下 —— 「不折行」的基准。 */
    private static String shortLoc(int items) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < items; i++) {
            if (i > 0) sb.append('\n');
            sb.append(i + 1).append(". A-").append(i + 1);
        }
        return sb.toString();
    }

    /** n 项地点，每项 24 个全角字（252pt）——超出一格宽（208pt），必然折成两行。 */
    private static String longLoc(int items) {
        String item = "一二三四五六七八九十一二三四五六七八九十一二三四";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < items; i++) {
            if (i > 0) sb.append('\n');
            sb.append(item);
        }
        return sb.toString();
    }

    private static TransferFormRenderInput input(int n) {
        TransferFormRenderInput in = new TransferFormRenderInput();
        in.setDocNo("20260920-测试-1");
        in.setUnitName("某课题组");
        in.setPiName("PI");
        in.setExperimenterName("实验员");
        StringBuilder f = new StringBuilder();
        StringBuilder t = new StringBuilder();
        for (int i = 0; i < n; i++) {
            if (i > 0) {
                f.append('\n');
                t.append('\n');
            }
            f.append(i + 1).append(". 浦东 / 201A-1 / A-").append(i + 1);
            t.append(i + 1).append(". 浦东 / 201A-2 / B-").append(i + 1);
            TransferFormRenderInput.Row row = new TransferFormRenderInput.Row();
            row.setStrain("C57BL/6");
            row.setFemale(3);
            row.setMale(2);
            in.getRows().add(row);
        }
        in.setFromLocation(f.toString());
        in.setToLocation(t.toString());
        return in;
    }

    private static String documentXml(TransferFormRenderInput in) throws IOException {
        byte[] docx = TransferFormRenderer.renderToDocx(in);
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
}
