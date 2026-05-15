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
    /** 表头每个字符的估算最小宽度单位（偏保守，利于中文） */
    private static final int UNITS_PER_HEADER_CHAR = 720;

    private ExcelExportColumnAutosizer() {
    }

    /**
     * @param headerRowIndex 作为宽度下限参考的表头行（通常为明细表第一行表头）
     */
    public static void autoSizeByContentWithHeaderFloor(Sheet sheet, int headerRowIndex, int firstCol, int lastColInclusive) {
        for (int c = firstCol; c <= lastColInclusive; c++) {
            int w;
            try {
                sheet.autoSizeColumn(c);
                w = sheet.getColumnWidth(c);
            } catch (Exception e) {
                w = headerTextMinWidthUnits(sheet, headerRowIndex, c);
            }
            int floor = headerTextMinWidthUnits(sheet, headerRowIndex, c);
            if (w < floor) {
                w = floor;
            }
            if (w > MAX_COL_WIDTH_UNITS) {
                w = MAX_COL_WIDTH_UNITS;
            }
            sheet.setColumnWidth(c, w);
        }
    }

    /** 整张表首行（第 0 行）即为明细表头时使用 */
    public static void autoSizeByContentWithHeaderFloorRow0(Sheet sheet, int firstCol, int lastColInclusive) {
        autoSizeByContentWithHeaderFloor(sheet, 0, firstCol, lastColInclusive);
    }

    private static int headerTextMinWidthUnits(Sheet sheet, int headerRowIndex, int col) {
        Row hr = sheet.getRow(headerRowIndex);
        if (hr == null) {
            return 3000;
        }
        Cell cell = hr.getCell(col);
        String t = cell == null ? "" : FMT.formatCellValue(cell).trim();
        if (t.isEmpty()) {
            return 3000;
        }
        int len = Math.min(t.length(), 80);
        return Math.min(255 * 256, Math.max(2800, (len + 2) * UNITS_PER_HEADER_CHAR));
    }
}
