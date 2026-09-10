package com.example.demo.common.excel;

import com.example.demo.common.excel.SubtotalPlanBuilder.SubtotalEvent;
import com.example.demo.modules.material.dto.MaterialAuditGridRow;
import com.example.demo.modules.material.service.MaterialExcelExportService;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 「摘要 == 成品」一致性：同一 config 下，摘要报出的小计/明细条数，
 * 必须等于导出表格实际写出的行数（表头 + 明细 + 各级小计）。锁住两条计数口径不漂移。
 */
class SubtotalSummaryConsistencyTest {

    /** 两个课题组、各两个申领人、若干物品；按板块连续排列，保证小计口径可预期。 */
    private static List<MaterialAuditGridRow> fixture() {
        List<MaterialAuditGridRow> rows = new ArrayList<>();
        rows.add(row("S1", "手套", "10", "张三", "A组"));
        rows.add(row("S2", "口罩", "5", "张三", "A组"));
        rows.add(row("S3", "口罩", "20", "李四", "A组"));
        rows.add(row("S4", "手套", "15", "王五", "B组"));
        rows.add(row("S5", "试剂", "7", "王五", "B组"));
        rows.add(row("S6", "试剂", "3", "赵六", "B组"));
        return rows;
    }

    private static MaterialAuditGridRow row(String id, String item, String qty, String name, String group) {
        MaterialAuditGridRow r = new MaterialAuditGridRow();
        r.setRequestId(id);
        r.setItemName(item);
        r.setQty(qty);
        r.setStatus("已出库");
        r.setApplicantName(name);
        r.setApplicantGroup(group);
        r.setTime("2026-09-01 10:00:00");
        return r;
    }

    /** 与导出同构的明细序列（板块连续即可，小计条数与组内排序无关）。 */
    private static List<SubtotalEvent> details() {
        return List.of(
                SubtotalPlanBuilder.detail(0, "A组", "张三", "手套", 10, 0, 0),
                SubtotalPlanBuilder.detail(1, "A组", "张三", "口罩", 5, 0, 0),
                SubtotalPlanBuilder.detail(2, "A组", "李四", "口罩", 20, 0, 0),
                SubtotalPlanBuilder.detail(3, "B组", "王五", "手套", 15, 0, 0),
                SubtotalPlanBuilder.detail(4, "B组", "王五", "试剂", 7, 0, 0),
                SubtotalPlanBuilder.detail(5, "B组", "赵六", "试剂", 3, 0, 0));
    }

    /** 只数有内容的行（一级小计后的隔空行未 createRow，不计入）。 */
    private static int populatedRows(byte[] bytes) throws Exception {
        try (Workbook wb = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            Sheet sh = wb.getSheetAt(0);
            int count = 0;
            for (int i = 0; i <= sh.getLastRowNum(); i++) {
                if (sh.getRow(i) != null) count++;
            }
            return count;
        }
    }

    private static void assertConsistent(SubtotalConfig config) throws Exception {
        SubtotalSummary summary =
                SubtotalPlanBuilder.summarize(SubtotalPlanBuilder.build(details(), config));
        int subtotalRows = summary.totals().subtotals().values().stream()
                .mapToInt(Integer::intValue).sum();
        int expected = 1 + summary.totals().detailRows() + subtotalRows;

        byte[] bytes = new MaterialExcelExportService().buildAuditGridSheet(fixture(), config);
        assertEquals(expected, populatedRows(bytes),
                "摘要行数应与导出实际行数一致 (config=" + config + ")");
    }

    @Test
    void defaultAll_isConsistent() throws Exception {
        assertConsistent(SubtotalConfig.all());
    }

    @Test
    void lv2Disabled_isConsistent() throws Exception {
        assertConsistent(SubtotalConfig.parse("total,lv1,lv3", null));
    }

    @Test
    void excludeOneBlock_isConsistent() throws Exception {
        assertConsistent(SubtotalConfig.parse(null, "A组"));
    }
}
