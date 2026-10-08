package com.example.demo.modules.ai.excel;

import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 解析层是大模型处理 Excel 的**确定性一半**，错了模型只会照着错数据下结论。
 * 四件事各钉一条：公式取结果、合并单元格展开、尾部裁剪但中间空行保留、截断必须显式标记。
 */
class SpreadsheetTextExtractorTest {

    private final SpreadsheetTextExtractor extractor = new SpreadsheetTextExtractor();

    private byte[] xlsx(Workbook wb) throws Exception {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            wb.write(out);
            return out.toByteArray();
        }
    }

    @Test
    @DisplayName("公式取**计算结果**：POI 默认给的是 \"=A1+B1\"，那种喂给模型等于没数据")
    void formulasAreEvaluated() throws Exception {
        try (Workbook wb = new XSSFWorkbook()) {
            Sheet s = wb.createSheet("表一");
            Row r0 = s.createRow(0);
            r0.createCell(0).setCellValue(2);
            r0.createCell(1).setCellValue(3);
            s.createRow(1).createCell(0).setCellFormula("A1+B1");

            SpreadsheetTextExtractor.Grid g = extractor.parse(xlsx(wb));

            assertEquals("5", g.sheets().get(0).rows().get(1).get(0), "应当拿到 5，而不是 =A1+B1");
        }
    }

    @Test
    @DisplayName("合并单元格要**展开**：合并区除左上角都是空，不填会让模型以为那几行没值")
    void mergedRegionsAreSpread() throws Exception {
        try (Workbook wb = new XSSFWorkbook()) {
            Sheet s = wb.createSheet("表一");
            Row r0 = s.createRow(0);
            r0.createCell(0).setCellValue("课题组");
            r0.createCell(1).setCellValue("");
            r0.createCell(2).setCellValue("");
            s.addMergedRegion(new CellRangeAddress(0, 0, 0, 2));

            SpreadsheetTextExtractor.Grid g = extractor.parse(xlsx(wb));
            List<String> row = g.sheets().get(0).rows().get(0);

            assertEquals(List.of("课题组", "课题组", "课题组"), row);
        }
    }

    @Test
    @DisplayName("裁尾部空行空列，但**中间空行必须保留** —— 删了行号就错位，模型说的『第 3 行』就对不上")
    void trimsTrailingButKeepsInteriorBlanks() throws Exception {
        try (Workbook wb = new XSSFWorkbook()) {
            Sheet s = wb.createSheet("表一");
            s.createRow(0).createCell(0).setCellValue("甲");
            s.createRow(1).createCell(0).setCellValue("乙");
            s.createRow(2);                                  // 中间空行：要留
            s.createRow(3).createCell(0).setCellValue("丁");
            s.createRow(4);                                  // 尾部空行：要砍
            s.createRow(5);

            SpreadsheetTextExtractor.Grid g = extractor.parse(xlsx(wb));
            List<List<String>> rows = g.sheets().get(0).rows();

            assertEquals(4, rows.size(), "尾部两行空行该砍掉");
            assertEquals("丁", rows.get(3).get(0), "第 4 行还在原位（中间空行没被删）");
            assertTrue(rows.get(2).isEmpty() || rows.get(2).get(0).isEmpty(), "中间那行仍是空的");
        }
    }

    @Test
    @DisplayName("超行数要**显式标记截断**并说清原因（静默截断会让模型拿半张表下结论）")
    void overLimitIsFlaggedNotSilent() throws Exception {
        try (Workbook wb = new XSSFWorkbook()) {
            Sheet s = wb.createSheet("大表");
            for (int r = 0; r <= SpreadsheetTextExtractor.MAX_ROWS_PER_SHEET; r++) {
                s.createRow(r).createCell(0).setCellValue("行" + r);
            }
            SpreadsheetTextExtractor.Grid g = extractor.parse(xlsx(wb));

            assertTrue(g.truncated(), "超限必须标记");
            assertFalse(g.note().isBlank(), "必须有一句人看得懂的截断原因");
            assertEquals(SpreadsheetTextExtractor.MAX_ROWS_PER_SHEET, g.rowCount(0));
        }
    }

    @Test
    @DisplayName("空表不该炸，也不该返回一堆空行")
    void blankSheetYieldsEmptyRows() throws Exception {
        try (Workbook wb = new XSSFWorkbook()) {
            wb.createSheet("空表");
            SpreadsheetTextExtractor.Grid g = extractor.parse(xlsx(wb));

            assertEquals(1, g.sheetCount());
            assertEquals(0, g.rowCount(0));
            assertFalse(g.truncated());
        }
    }

    @Test
    @DisplayName("每行补到等长（模型按列位置说话时不会越界）")
    void rowsArePaddedToEqualWidth() throws Exception {
        try (Workbook wb = new XSSFWorkbook()) {
            Sheet s = wb.createSheet("表一");
            Row wide = s.createRow(0);
            wide.createCell(0).setCellValue("a");
            wide.createCell(1).setCellValue("b");
            wide.createCell(2).setCellValue("c");
            s.createRow(1).createCell(0).setCellValue("x");

            SpreadsheetTextExtractor.Grid g = extractor.parse(xlsx(wb));
            List<List<String>> rows = g.sheets().get(0).rows();

            assertEquals(3, rows.get(0).size());
            assertEquals(3, rows.get(1).size(), "窄行要补到与最宽行等长");
            assertEquals("", rows.get(1).get(2));
        }
    }
}
