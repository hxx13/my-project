package com.example.demo.modules.ai.excel;

import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * 行编辑要紧的就两件：**删掉的就是那一行**（后面的整行上移，不留空洞）、
 * **没说要删的一律不动**（含样式）。
 */
class WorkbookRowEditorTest {

    /** 表头 + 4 行明细，最后一列带底色以便盯样式有没有跟着行走。 */
    private static byte[] sample() throws Exception {
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sh = wb.createSheet("申领审计");
            Row head = sh.createRow(0);
            String[] cols = {"单号", "物品", "状态"};
            for (int i = 0; i < cols.length; i++) {
                head.createCell(i).setCellValue(cols[i]);
            }
            CellStyle tinted = wb.createCellStyle();
            tinted.setFillForegroundColor(IndexedColors.LEMON_CHIFFON.getIndex());
            tinted.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            String[][] data = {
                    {"MR_1", "运输盒", "已出库"},
                    {"MR_2", "手套", "已驳回"},
                    {"MR_3", "枪头", "已出库"},
                    {"MR_4", "手套", "已驳回"},
            };
            for (int i = 0; i < data.length; i++) {
                Row row = sh.createRow(i + 1);
                for (int c = 0; c < data[i].length; c++) {
                    row.createCell(c).setCellValue(data[i][c]);
                }
                if (i == 2) {
                    row.getCell(1).setCellStyle(tinted);   // 第 3 行（1 起）的样式，用来验证行上移
                }
            }
            wb.write(out);
            return out.toByteArray();
        }
    }

    private static String cell(Workbook wb, int row, int col) {
        return WorkbookColumnEditor.textOf(wb.getSheetAt(0).getRow(row).getCell(col));
    }

    @Test
    void filterRemovesMatchingRowsAndShiftsUp() throws Exception {
        byte[] after = WorkbookRowEditor.dropRowsWhere(sample(), "状态", "equals", "已驳回");
        try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(after))) {
            assertEquals("MR_1", cell(wb, 1, 0));
            assertEquals("MR_3", cell(wb, 2, 0), "被删行后面的行要顶上来，不留空洞");
            assertEquals(2, wb.getSheetAt(0).getLastRowNum(), "表头(0) + 剩两行(1,2)");
            assertEquals(FillPatternType.SOLID_FOREGROUND,
                    wb.getSheetAt(0).getRow(2).getCell(1).getCellStyle().getFillPattern(),
                    "样式要跟着行一起上移");
        }
    }

    @Test
    void dropRowsByNumberUsesExcelRowNumbers() throws Exception {
        // 表头占 Excel 的第 1 行 —— 所以 Excel 第 2 行是 MR_1、第 4 行是 MR_3
        byte[] after = WorkbookRowEditor.dropRows(sample(), List.of(2, 4));
        try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(after))) {
            assertEquals("MR_2", cell(wb, 1, 0));
            assertEquals("MR_4", cell(wb, 2, 0));
            assertEquals(2, wb.getSheetAt(0).getLastRowNum());
        }
    }

    @Test
    void dropEmptyRowsLeavesDataAlone() throws Exception {
        byte[] after = WorkbookRowEditor.dropEmptyRows(sample());
        try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(after))) {
            assertEquals("MR_4", cell(wb, 4, 0));
        }
    }

    /**
     * 中间那个空行在 xlsx 里**连 Row 对象都没有**（没有 &lt;row&gt; 元素），但用户在 Excel 里看得见它。
     * 早先的实现遇到 null 行直接跳过，于是「删掉空行」永远回「没有空行」—— 真机 2026-10-09 撞到。
     */
    @Test
    void dropEmptyRowsRemovesGapRowsThatHaveNoRowObject() throws Exception {
        byte[] withGap;
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sh = wb.createSheet("S");
            sh.createRow(0).createCell(0).setCellValue("单号");
            sh.createRow(1).createCell(0).setCellValue("MR_1");
            sh.createRow(3).createCell(0).setCellValue("MR_3");   // 跳过第 2 行 = 那个空行
            wb.write(out);
            withGap = out.toByteArray();
        }
        try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(withGap))) {
            assertNull(wb.getSheetAt(0).getRow(2), "前置条件：空行没有 Row 对象");
        }

        byte[] after = WorkbookRowEditor.dropEmptyRows(withGap);
        try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(after))) {
            assertEquals("MR_1", cell(wb, 1, 0));
            assertEquals("MR_3", cell(wb, 2, 0), "空行删掉后下一行要顶上来");
            assertEquals(2, wb.getSheetAt(0).getLastRowNum());
        }
    }

    @Test
    void unknownColumnIsRejected() throws Exception {
        try {
            WorkbookRowEditor.dropRowsWhere(sample(), "没有这列", "equals", "x");
            throw new AssertionError("该报错却没报");
        } catch (IllegalArgumentException e) {
            assertEquals(true, e.getMessage().contains("没有这列"));
        }
    }

    @Test
    void opDescribesWhatGetsDropped() throws Exception {
        // notEquals 是**删除条件的描述**：删掉「状态 不等于 已驳回」的行 → 剩下的正是「已驳回」那些
        byte[] after = WorkbookRowEditor.dropRowsWhere(sample(), "状态", "notEquals", "已驳回");
        try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(after))) {
            assertEquals("已驳回", cell(wb, 1, 2));
            assertEquals("已驳回", cell(wb, 2, 2));
            assertEquals(2, wb.getSheetAt(0).getLastRowNum());
        }
    }
}
