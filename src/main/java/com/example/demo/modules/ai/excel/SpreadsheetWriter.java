package com.example.demo.modules.ai.excel;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

import java.io.ByteArrayOutputStream;
import java.util.List;

/**
 * 二维字符串 → xlsx 字节。与 {@link SpreadsheetTextExtractor} 是一对：那边读进来、这边写出去。
 *
 * <p>为什么必须有：**模型产不出二进制文件**（它只给文本/结构化数据），落盘这一步只能由代码做 ——
 * 这也是「模型只产出意图」那条不变量的落地。模型给的是「表头 + 数据行」，这里负责变成真文件。
 *
 * <p>不做样式：这是**数据搬运**，不是出报表。加粗/配色/列宽那些属于「导出模板」的活，
 * 真需要时应当复用页面上的导出服务，而不是让 AI 这条链路自己长出一套排版。
 */
public final class SpreadsheetWriter {

    private SpreadsheetWriter() {
    }

    /**
     * @param sheetName 工作表名，空则用 Sheet1
     * @param headers   表头，可为空（空则不写表头行）
     * @param rows      数据行；每行单元格数不足时补空、多的照写
     */
    public static byte[] toXlsx(String sheetName, List<String> headers, List<List<String>> rows) {
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            String name = sheetName == null || sheetName.isBlank() ? "Sheet1" : sanitizeSheetName(sheetName);
            Sheet sheet = wb.createSheet(name);
            int r = 0;
            if (headers != null && !headers.isEmpty()) {
                Row header = sheet.createRow(r++);
                for (int c = 0; c < headers.size(); c++) {
                    setCell(header, c, headers.get(c));
                }
            }
            if (rows != null) {
                for (List<String> data : rows) {
                    Row row = sheet.createRow(r++);
                    if (data == null) {
                        continue;
                    }
                    for (int c = 0; c < data.size(); c++) {
                        setCell(row, c, data.get(c));
                    }
                }
            }
            wb.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException("生成 xlsx 失败：" + e.getMessage(), e);
        }
    }

    /** 单元格一律写成**字符串**：日期/工号这类东西写成数字或日期格式会被 Excel 再诠释一遍（工号变科学计数法那种）。 */
    private static void setCell(Row row, int index, String value) {
        Cell cell = row.createCell(index);
        cell.setCellValue(value == null ? "" : value);
    }

    /** Excel 工作表名不许超过 31 字，也不许出现 : \ / ? * [ ] —— 文件名叫「清洗结果 v2/终版.xlsx」时就会炸。 */
    private static String sanitizeSheetName(String raw) {
        String s = raw.replaceAll("[:\\\\/?*\\[\\]]", "_").trim();
        return s.length() <= 31 ? s : s.substring(0, 31);
    }
}
