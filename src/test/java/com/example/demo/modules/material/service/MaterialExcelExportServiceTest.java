package com.example.demo.modules.material.service;

import com.example.demo.common.excel.SubtotalPlanBuilder;
import com.example.demo.common.excel.SubtotalPlanBuilder.SubtotalEvent;
import com.example.demo.modules.material.dto.MaterialAuditGridRow;
import com.example.demo.modules.material.dto.MaterialItemFlowExportRow;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFColor;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MaterialExcelExportServiceTest {

    private static final String A_BLOCK = "FFDDE9F7";
    private static final String B_BLOCK = "FFDEEFDE";
    private static final String TOTAL_FILL = "FFD9D9D9";

    private static SubtotalEvent detail(String lv1, String lv2, String lv3, long net) {
        return new SubtotalEvent(-1, 0, lv1, lv2, lv3, net, Math.max(net, 0), Math.min(net, 0));
    }

    private static String text(Row row, int col) {
        if (row == null || row.getCell(col) == null) return null;
        return row.getCell(col).getStringCellValue();
    }

    private static double num(Row row, int col) {
        return row.getCell(col).getNumericCellValue();
    }

    /** 首列填充色（ARGB）；板块底色交替，总计单独一色。 */
    private static String fillHex(Sheet sh, int rowIdx) {
        XSSFColor c = (XSSFColor) sh.getRow(rowIdx).getCell(0).getCellStyle().getFillForegroundColorColor();
        return c == null ? null : c.getARGBHex();
    }

    private static boolean bold(Workbook wb, Cell cell) {
        return wb.getFontAt(cell.getCellStyle().getFontIndex()).getBold();
    }

    @Test
    void parseQtyText_handlesSignsAndNonNumeric() {
        assertEquals(5, MaterialExcelExportService.parseQtyText("+5"));
        assertEquals(-3, MaterialExcelExportService.parseQtyText("-3"));
        assertEquals(0, MaterialExcelExportService.parseQtyText("0"));
        assertNull(MaterialExcelExportService.parseQtyText("无"));
        assertNull(MaterialExcelExportService.parseQtyText(""));
        assertNull(MaterialExcelExportService.parseQtyText("+"));
        assertNull(MaterialExcelExportService.parseQtyText(null));
    }

    @Test
    void buildSubtotalPlan_emitsItemPersonGroupAndGrandTotals() {
        List<SubtotalEvent> details = List.of(
                detail("A组", "张三", "手套", 10),
                detail("A组", "张三", "口罩", 5),
                detail("A组", "李四", "口罩", 20),
                detail("B组", "王五", "手套", 15));

        List<SubtotalEvent> plan =
                SubtotalPlanBuilder.build(details);

        assertEquals(List.of(-1, 3, -1, 3, 2, -1, 3, 2, 1, -1, 3, 2, 1, 0),
                plan.stream().map(SubtotalEvent::level).toList());
        assertEquals(List.of(10L, 10L, 5L, 5L, 15L, 20L, 20L, 20L, 35L, 15L, 15L, 15L, 15L, 50L),
                plan.stream().map(SubtotalEvent::net).toList());
    }

    @Test
    void buildAuditGridSheet_writesSubtotalsAndGrandTotal() throws Exception {
        MaterialExcelExportService svc = new MaterialExcelExportService();
        MaterialAuditGridRow r1 = new MaterialAuditGridRow();
        r1.setRequestId("S1"); r1.setItemName("手套"); r1.setQty("10");
        r1.setStatus("已出库"); r1.setApplicantName("张三"); r1.setApplicantGroup("A组"); r1.setTime("2026-09-01 10:00:00");
        MaterialAuditGridRow r2 = new MaterialAuditGridRow();
        r2.setRequestId("S2"); r2.setItemName("手套"); r2.setQty("5");
        r2.setStatus("已出库"); r2.setApplicantName("张三"); r2.setApplicantGroup("A组"); r2.setTime("2026-09-02 10:00:00");
        MaterialAuditGridRow r3 = new MaterialAuditGridRow();
        r3.setRequestId("S3"); r3.setItemName("手套"); r3.setQty("5");
        r3.setStatus("已出库"); r3.setApplicantName("王五"); r3.setApplicantGroup("B组"); r3.setTime("2026-09-03 10:00:00");

        byte[] bytes = svc.buildAuditGridSheet(List.of(r1, r2, r3));

        try (Workbook wb = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            Sheet sh = wb.getSheetAt(0);
            assertEquals("物品", text(sh.getRow(0), 1));
            // A组：明细×2 → 物品小计 → 申领人小计 → 课题组小计 → 空行 → B组：…
            assertEquals("手套 小计", text(sh.getRow(3), 1));
            assertEquals(15.0, num(sh.getRow(3), 2));
            assertEquals("张三 小计", text(sh.getRow(4), 4));
            assertEquals("A组 小计", text(sh.getRow(5), 5));
            assertEquals(15.0, num(sh.getRow(5), 2));
            assertNull(sh.getRow(6), "课题组小计后应留空行");
            assertEquals("S3", text(sh.getRow(7), 0));
            assertEquals("B组 小计", text(sh.getRow(10), 5));
            assertEquals(5.0, num(sh.getRow(10), 2));
            assertNull(sh.getRow(11), "课题组小计后应留空行");
            assertEquals("总计", text(sh.getRow(12), 0));
            assertEquals(20.0, num(sh.getRow(12), 2));
            assertEquals(13, sh.getLastRowNum() + 1);

            // 小计与其板块（明细+各级小计）同一底色，相邻板块交替，总计单独一色
            assertEquals(A_BLOCK, fillHex(sh, 1));
            assertEquals(A_BLOCK, fillHex(sh, 3));
            assertEquals(A_BLOCK, fillHex(sh, 5));
            assertEquals(B_BLOCK, fillHex(sh, 7));
            assertEquals(B_BLOCK, fillHex(sh, 10));
            assertEquals(TOTAL_FILL, fillHex(sh, 12));

            assertTrue(bold(wb, sh.getRow(5).getCell(0)), "小计行应加粗");
            assertFalse(bold(wb, sh.getRow(1).getCell(0)), "明细行不应加粗");
        }
    }

    @Test
    void buildItemFlowSheet_writesNetInboundOutbound() throws Exception {
        MaterialExcelExportService svc = new MaterialExcelExportService();
        MaterialItemFlowExportRow in = new MaterialItemFlowExportRow();
        in.setTime("2026-09-01 09:00:00"); in.setEventType("入库"); in.setItemName("手套");
        in.setQty("+20"); in.setApplicantName("张三"); in.setApplicantGroup("A组");
        MaterialItemFlowExportRow out = new MaterialItemFlowExportRow();
        out.setTime("2026-09-02 09:00:00"); out.setEventType("出库"); out.setItemName("手套");
        out.setQty("-8"); out.setApplicantName("张三"); out.setApplicantGroup("A组");

        byte[] bytes = svc.buildItemFlowSheet(List.of(in, out));

        try (Workbook wb = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            Sheet sh = wb.getSheetAt(0);
            assertEquals("变动数量", text(sh.getRow(0), 4));
            Row grand = sh.getRow(sh.getLastRowNum());
            assertEquals("总计", text(grand, 1));
            assertEquals(12.0, num(grand, 4));
            assertEquals("入库合计 +20；出库合计 -8；净变动 12", text(grand, 9));
        }
    }
}
