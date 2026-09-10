package com.example.demo.modules.twin.common.service;

import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFColor;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AnimalOrderProcurementServiceTest {

    private static final String A_BLOCK = "FFDDE9F7";
    private static final String TOTAL_FILL = "FFD9D9D9";

    /** 首列填充色（ARGB），板块内的明细与小计行应一致。 */
    private static String fillHex(Row row, int col) {
        XSSFColor c = (XSSFColor) row.getCell(col).getCellStyle().getFillForegroundColorColor();
        return c == null ? null : c.getARGBHex();
    }

    private static Map<String, Object> group(String arrival, String supplier, String strain, String spec,
                                             long male, long female) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("arrivalDate", arrival);
        m.put("supplierName", supplier);
        m.put("strainName", strain);
        m.put("specName", spec);
        m.put("maleQty", male);
        m.put("femaleQty", female);
        return m;
    }

    private static long num(Map<String, Object> row, String key) {
        return ((Number) row.get(key)).longValue();
    }

    @Test
    void assembleRows_insertsSupplierSubtotalAndGrandTotal() {
        List<Map<String, Object>> groups = List.of(
                group("2026-09-10", "上海灵畅", "C57BL/6J", "6W", 80, 40),
                group("2026-09-10", "上海灵畅", "BALB/c", "8W", 60, 0),
                group("2026-09-10", "北京维通", "C57BL/6J", "6W", 10, 5),
                group("2026-09-17", "上海灵畅", "C57BL/6J", "6W", 20, 20));

        List<Map<String, Object>> rows = AnimalOrderProcurementService.assembleRows(groups);

        assertEquals(List.of(
                        AnimalOrderProcurementService.ROW_DETAIL,
                        AnimalOrderProcurementService.ROW_DETAIL,
                        AnimalOrderProcurementService.ROW_SUPPLIER_SUBTOTAL,
                        AnimalOrderProcurementService.ROW_DETAIL,
                        AnimalOrderProcurementService.ROW_SUPPLIER_SUBTOTAL,
                        AnimalOrderProcurementService.ROW_DETAIL,
                        AnimalOrderProcurementService.ROW_SUPPLIER_SUBTOTAL,
                        AnimalOrderProcurementService.ROW_GRAND_TOTAL),
                rows.stream().map(r -> (String) r.get("rowType")).toList());

        // 第一个供应商小计 = 80+60 雄 / 40+0 雌
        assertEquals(140L, num(rows.get(2), "maleQty"));
        assertEquals(40L, num(rows.get(2), "femaleQty"));
        assertEquals(180L, num(rows.get(2), "totalQty"));
        assertEquals("上海灵畅", rows.get(2).get("supplierName"));

        // 总计 = 170 雄 / 65 雌
        Map<String, Object> grand = rows.get(rows.size() - 1);
        assertEquals(170L, num(grand, "maleQty"));
        assertEquals(65L, num(grand, "femaleQty"));
        assertEquals(235L, num(grand, "totalQty"));
    }

    @Test
    void assembleRows_emptyGroups_noTotalRow() {
        assertEquals(List.of(), AnimalOrderProcurementService.assembleRows(new ArrayList<>()));
        assertEquals(List.of(), AnimalOrderProcurementService.assembleRows(null));
    }

    @Test
    void buildExcel_writesDetailSubtotalAndGrandTotal() throws Exception {
        TwinDashboardMapper mapper = mock(TwinDashboardMapper.class);
        when(mapper.getProcurementSummary(any(), any(), any())).thenReturn(List.of(
                group("2026-09-10", "上海灵畅", "C57BL/6J", "6W", 80, 40),
                group("2026-09-10", "上海灵畅", "BALB/c", "8W", 60, 0)));

        byte[] bytes = new AnimalOrderProcurementService(mapper).buildExcel("arrival", "2026-09-01", "2026-09-30");

        try (Workbook wb = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            Sheet sh = wb.getSheetAt(0);
            int header = -1;
            for (int r = 0; r <= sh.getLastRowNum(); r++) {
                if ("供应商".equals(text(sh.getRow(r), 1))) {
                    header = r;
                    break;
                }
            }
            assertTrue(header > 0, "未找到表头行");

            Row detail = sh.getRow(header + 1);
            assertEquals("上海灵畅", text(detail, 1));
            assertEquals("C57BL/6J", text(detail, 2));
            assertEquals(80.0, detail.getCell(4).getNumericCellValue());

            Row subtotal = sh.getRow(header + 3);
            assertEquals("小计", text(subtotal, 2));
            assertEquals(140.0, subtotal.getCell(4).getNumericCellValue());
            assertEquals(180.0, subtotal.getCell(6).getNumericCellValue());
            // 明细行与小计行同属一个板块 → 同一底色
            assertEquals(A_BLOCK, fillHex(detail, 0));
            assertEquals(A_BLOCK, fillHex(subtotal, 0));

            // 供应商小计后空一行，再写总计
            assertNull(sh.getRow(header + 4), "供应商小计后应留空行");
            Row grand = sh.getRow(header + 5);
            assertEquals("总计", text(grand, 0));
            assertEquals(140.0, grand.getCell(4).getNumericCellValue());
            assertEquals(180.0, grand.getCell(6).getNumericCellValue());
            assertEquals(TOTAL_FILL, fillHex(grand, 0));
        }
    }

    private static String text(Row row, int col) {
        if (row == null || row.getCell(col) == null) {
            return null;
        }
        return row.getCell(col).getStringCellValue();
    }
}
