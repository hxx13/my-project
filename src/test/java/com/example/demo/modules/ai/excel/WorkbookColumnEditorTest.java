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
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 删列的三件要紧事：**表头对**、**值跟着左移**、**样式跟着格子走**
 * （另有一行短于被删列、以及列名对不上时不能崩）。任一坏掉，用户看到的就是「改完之后表错位」。
 */
class WorkbookColumnEditorTest {

    /** 造一张表：表头 + 一行明细（带底色）+ 一行小计 + 一行短行。 */
    private static byte[] sample() throws Exception {
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sh = wb.createSheet("申领审计");
            Row head = sh.createRow(0);
            String[] cols = {"单号", "物品", "数量", "状态", "申领人"};
            for (int i = 0; i < cols.length; i++) {
                head.createCell(i).setCellValue(cols[i]);
            }
            CellStyle tinted = wb.createCellStyle();
            tinted.setFillForegroundColor(IndexedColors.LEMON_CHIFFON.getIndex());
            tinted.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            Row detail = sh.createRow(1);
            detail.createCell(0).setCellValue("MR_1");
            detail.createCell(1).setCellValue("卡其色运输盒");
            detail.createCell(2).setCellValue(3);
            detail.createCell(3).setCellValue("已出库");
            detail.createCell(4).setCellValue("夏一秋");
            detail.getCell(4).setCellStyle(tinted);   // 要盯的就是这个格子的样式

            Row subtotal = sh.createRow(2);
            subtotal.createCell(1).setCellValue("物品小计");
            subtotal.createCell(2).setCellValue(4);

            Row shortRow = sh.createRow(3);            // 短行：列数少，删后面的列不能把它搞崩
            shortRow.createCell(0).setCellValue("只有一列");

            wb.write(out);
            return out.toByteArray();
        }
    }

    @Test
    void headersDropTheDeletedColumn() throws Exception {
        byte[] after = WorkbookColumnEditor.dropColumns(sample(), List.of("数量"));
        assertEquals(List.of("单号", "物品", "状态", "申领人"), WorkbookColumnEditor.headersOf(after));
    }

    @Test
    void valuesShiftLeftAndStyleTravels() throws Exception {
        byte[] after = WorkbookColumnEditor.dropColumns(sample(), List.of("数量"));
        try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(after))) {
            Row detail = wb.getSheetAt(0).getRow(1);
            assertEquals("MR_1", detail.getCell(0).getStringCellValue());
            assertEquals("卡其色运输盒", detail.getCell(1).getStringCellValue());
            assertEquals("已出库", detail.getCell(2).getStringCellValue(), "状态该顶掉被删的数量列");
            assertEquals("夏一秋", detail.getCell(3).getStringCellValue(), "申领人该跟着左移一列");
            // 样式随格子走：移动后那个格子的底色必须还在（丢了就是外观被改掉）
            assertEquals(FillPatternType.SOLID_FOREGROUND, detail.getCell(3).getCellStyle().getFillPattern());
        }
    }

    @Test
    void shortRowSurvives() throws Exception {
        byte[] after = WorkbookColumnEditor.dropColumns(sample(), List.of("状态"));
        try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(after))) {
            // 第 4 行只有一列，删的列在它右边 —— 不参与左移，也不能把它搞成 null
            Row shortRow = wb.getSheetAt(0).getRow(3);
            assertEquals("只有一列", shortRow.getCell(0).getStringCellValue());
        }
    }

    @Test
    void unknownColumnIsNoop() throws Exception {
        byte[] before = sample();
        byte[] after = WorkbookColumnEditor.dropColumns(before, List.of("不存在的列"));
        assertEquals(WorkbookColumnEditor.headersOf(before), WorkbookColumnEditor.headersOf(after));
        assertFalse(WorkbookColumnEditor.headersOf(after).contains("不存在的列"));
    }

    @Test
    void dropTwoAtOnce() throws Exception {
        byte[] after = WorkbookColumnEditor.dropColumns(sample(), List.of("数量", "单号"));
        assertEquals(List.of("物品", "状态", "申领人"), WorkbookColumnEditor.headersOf(after));
        assertTrue(WorkbookColumnEditor.headersOf(after).contains("物品"));
    }

    @Test
    void keepColumnsReordersAndDrops() throws Exception {
        byte[] after = WorkbookColumnEditor.keepColumns(sample(), List.of("申领人", "物品"));
        assertEquals(List.of("申领人", "物品"), WorkbookColumnEditor.headersOf(after));
        try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(after))) {
            Row detail = wb.getSheetAt(0).getRow(1);
            assertEquals("夏一秋", detail.getCell(0).getStringCellValue());
            assertEquals("卡其色运输盒", detail.getCell(1).getStringCellValue());
            assertEquals(FillPatternType.SOLID_FOREGROUND, detail.getCell(0).getCellStyle().getFillPattern(),
                    "重排后样式要跟着那个格子走");
        }
    }

    @Test
    void renameColumnOnlyTouchesHeader() throws Exception {
        byte[] after = WorkbookColumnEditor.renameColumn(sample(), "数量", "领用数量");
        assertEquals(List.of("单号", "物品", "领用数量", "状态", "申领人"),
                WorkbookColumnEditor.headersOf(after));
        try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(after))) {
            assertEquals(3.0, wb.getSheetAt(0).getRow(1).getCell(2).getNumericCellValue(), 0.0001);
        }
    }

    @Test
    void renameUnknownColumnIsNoop() throws Exception {
        byte[] before = sample();
        byte[] after = WorkbookColumnEditor.renameColumn(before, "没有这列", "新名");
        assertEquals(WorkbookColumnEditor.headersOf(before), WorkbookColumnEditor.headersOf(after));
    }
}
