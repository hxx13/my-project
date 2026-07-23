package com.example.demo.common.excel;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;

/**
 * 导出 Excel 列宽：对每列调用 {@link Sheet#autoSizeColumn(int)} 按已写入单元格估算宽度，
 * 再保证不小于「表头行」对应列文本的估算宽度，避免中文表头/内容被裁切。
 */
public final class ExcelExportColumnAutosizer {

    private static final DataFormatter FMT = new DataFormatter();
    /** 单列宽度上限（POI 单位为 1/256 字符宽），约 85 个英文字符 */
    private static final int MAX_COL_WIDTH_UNITS = 22000;
    /** 每个字符的估算宽度单位（中文约 512，英文约 256，取保守值） */
    private static final int UNITS_PER_CHAR = 512;

    private ExcelExportColumnAutosizer() {
    }

    /**
     * @param headerRowIndex 表头行（明细表第一行）
     * @param dataStartRow   数据起始行
     * @param dataEndRow     数据结束行
     */
    public static void autoSizeWithData(Sheet sheet, int headerRowIndex, int dataStartRow, int dataEndRow,
                                        int firstCol, int lastColInclusive) {
        for (int c = firstCol; c <= lastColInclusive; c++) {
            // 表头宽度
            int headerW = textWidth(sheet, headerRowIndex, c);
            // 数据最大宽度（抽样前 200 行提升性能）
            int dataW = 0;
            int sampleEnd = Math.min(dataEndRow, dataStartRow + 199);
            for (int r = dataStartRow; r <= sampleEnd; r++) {
                int w = textWidth(sheet, r, c);
                if (w > dataW) dataW = w;
            }
            int w = Math.max(headerW, dataW);
            if (w < 3000) w = 3000;
            if (w > MAX_COL_WIDTH_UNITS) w = MAX_COL_WIDTH_UNITS;
            sheet.setColumnWidth(c, w);
        }
    }

    /** 兼容旧调用：仅表头 + autoSizeColumn */
    public static void autoSizeByContentWithHeaderFloor(Sheet sheet, int headerRowIndex, int firstCol, int lastColInclusive) {
        autoSizeByContentWithHeaderFloorRow0(sheet, firstCol, lastColInclusive);
    }

    /** 整张表首行为表头、余下为数据时使用 */
    public static void autoSizeByContentWithHeaderFloorRow0(Sheet sheet, int firstCol, int lastColInclusive) {
        int lastRow = sheet.getLastRowNum();
        if (lastRow > 0) {
            autoSizeWithData(sheet, 0, 1, lastRow, firstCol, lastColInclusive);
        } else {
            // 只有表头，按表头文字估算
            for (int c = firstCol; c <= lastColInclusive; c++) {
                int w = textWidth(sheet, 0, c);
                if (w < 3000) w = 3000;
                sheet.setColumnWidth(c, w);
            }
        }
    }

    private static int textWidth(Sheet sheet, int rowIdx, int col) {
        Row row = sheet.getRow(rowIdx);
        if (row == null) return 0;
        Cell cell = row.getCell(col);
        String t = cell == null ? "" : FMT.formatCellValue(cell).trim();
        if (t.isEmpty()) return 0;
        int len = Math.min(t.length(), 100);
        return (len + 2) * UNITS_PER_CHAR;
    }
}
