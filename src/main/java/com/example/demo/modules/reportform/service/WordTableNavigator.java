package com.example.demo.modules.reportform.service;

import org.apache.poi.xwpf.usermodel.*;
import org.apache.poi.xwpf.model.XWPFHeaderFooterPolicy;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTcPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STMerge;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Word 表格几何导航：与 {@link ReportFormImportService} 导入逻辑对齐，
 * 按 layout (row,col) 定位 docx 单元格并写入文本。
 */
final class WordTableNavigator {

    private WordTableNavigator() {}

    static long packPos(int row, int col) {
        return ((long) row << 32) | (col & 0xffffffffL);
    }

    static int walkAndInject(List<IBodyElement> elements,
                             int regionStartRow,
                             int regionEndRow,
                             Map<Long, String> posToValue,
                             CellTextWriter writer) {
        int currentRow = regionStartRow;
        int count = 0;
        for (IBodyElement element : elements) {
            if (currentRow >= regionEndRow) break;
            if (element instanceof XWPFParagraph para) {
                if (!isNonemptyParagraph(para)) continue;
                currentRow++;
            } else if (element instanceof XWPFTable table) {
                count += injectTable(table, currentRow, regionEndRow, posToValue, writer);
                currentRow += table.getNumberOfRows();
            }
        }
        return count;
    }

    private static int injectTable(XWPFTable table,
                                   int startRow,
                                   int regionEndRow,
                                   Map<Long, String> posToValue,
                                   CellTextWriter writer) {
        int numRows = table.getNumberOfRows();
        if (numRows == 0) return 0;

        int maxCols = getTableLogicalCols(table);
        boolean[][] covered = new boolean[numRows][maxCols];
        int count = 0;

        for (int r = 0; r < numRows; r++) {
            if (startRow + r >= regionEndRow) break;
            XWPFTableRow row = table.getRow(r);
            if (row == null) continue;

            int logicalCol = 0;
            for (int pc = 0; pc < row.getTableCells().size(); pc++) {
                XWPFTableCell cell = row.getCell(pc);
                if (cell == null) continue;
                if (isHMergeContinue(cell)) continue;

                while (logicalCol < maxCols && covered[r][logicalCol]) {
                    logicalCol++;
                }
                if (logicalCol >= maxCols) break;

                if (isVMergeContinue(cell)) {
                    logicalCol += getGridSpan(cell);
                    continue;
                }

                int colSpan = getGridSpan(cell);
                int rowSpan = 1;
                CTTcPr pr = cell.getCTTc().getTcPr();
                if (pr != null && pr.isSetVMerge() && pr.getVMerge().isSetVal()
                        && pr.getVMerge().getVal() == STMerge.RESTART) {
                    rowSpan = countVerticalSpan(table, r, pc);
                }

                String value = posToValue.get(packPos(startRow + r, logicalCol));
                if (value != null) {
                    writer.write(cell, value);
                    count++;
                }

                for (int dr = 0; dr < rowSpan; dr++) {
                    for (int dc = 0; dc < colSpan; dc++) {
                        int rr = r + dr;
                        int cc = logicalCol + dc;
                        if (rr < numRows && cc < maxCols) {
                            covered[rr][cc] = true;
                        }
                    }
                }
                logicalCol += colSpan;
            }
        }
        return count;
    }

    static int computeDocMaxCols(XWPFDocument doc) {
        int docMaxCols = 1;
        for (IBodyElement element : doc.getBodyElements()) {
            if (element instanceof XWPFTable table) {
                docMaxCols = Math.max(docMaxCols, getTableLogicalCols(table));
            }
        }
        for (XWPFHeader header : doc.getHeaderList()) {
            for (IBodyElement element : header.getBodyElements()) {
                if (element instanceof XWPFTable table) {
                    docMaxCols = Math.max(docMaxCols, getTableLogicalCols(table));
                }
            }
        }
        for (XWPFFooter footer : doc.getFooterList()) {
            for (IBodyElement element : footer.getBodyElements()) {
                if (element instanceof XWPFTable table) {
                    docMaxCols = Math.max(docMaxCols, getTableLogicalCols(table));
                }
            }
        }
        return docMaxCols;
    }

    private static boolean isNonemptyParagraph(XWPFParagraph para) {
        for (XWPFRun run : para.getRuns()) {
            String t = run.getText(0);
            if (t != null && !t.isBlank()) return true;
            if (!run.getEmbeddedPictures().isEmpty()) return true;
        }
        return false;
    }

    static int getTableLogicalCols(XWPFTable table) {
        int max = 0;
        for (int r = 0; r < table.getNumberOfRows(); r++) {
            XWPFTableRow row = table.getRow(r);
            if (row == null) continue;
            int cols = 0;
            for (XWPFTableCell cell : row.getTableCells()) {
                if (isHMergeContinue(cell)) continue;
                cols += getGridSpan(cell);
            }
            max = Math.max(max, cols);
        }
        return Math.max(max, 1);
    }

    private static boolean isVMergeContinue(XWPFTableCell cell) {
        CTTcPr pr = cell.getCTTc().getTcPr();
        if (pr == null || !pr.isSetVMerge()) return false;
        if (!pr.getVMerge().isSetVal()) return true;
        return pr.getVMerge().getVal() == STMerge.CONTINUE;
    }

    private static boolean isHMergeContinue(XWPFTableCell cell) {
        CTTcPr pr = cell.getCTTc().getTcPr();
        if (pr == null || !pr.isSetHMerge()) return false;
        if (!pr.getHMerge().isSetVal()) return true;
        return pr.getHMerge().getVal() == STMerge.CONTINUE;
    }

    private static int getGridSpan(XWPFTableCell cell) {
        CTTcPr pr = cell.getCTTc().getTcPr();
        if (pr != null && pr.isSetGridSpan()) {
            return Math.max(1, pr.getGridSpan().getVal().intValue());
        }
        return 1;
    }

    private static int countVerticalSpan(XWPFTable table, int rowIdx, int cellIdx) {
        int span = 1;
        for (int r = rowIdx + 1; r < table.getNumberOfRows(); r++) {
            XWPFTableRow row = table.getRow(r);
            if (row == null || cellIdx >= row.getTableCells().size()) break;
            if (!isVMergeContinue(row.getCell(cellIdx))) break;
            span++;
        }
        return span;
    }

    /** 在 elements 中取第 tableIdx 个表格（仅计表格元素，跳过段落） */
    static XWPFTable findNthTable(List<IBodyElement> elements, int tableIdx) {
        if (elements == null || tableIdx < 0) return null;
        int seen = 0;
        for (IBodyElement element : elements) {
            if (element instanceof XWPFTable table) {
                if (seen == tableIdx) return table;
                seen++;
            }
        }
        return null;
    }

    /** 按逻辑行列定位表格单元格（与导入时 tr/tc 一致） */
    static XWPFTableCell getCellAtLogicalPosition(XWPFTable table, int targetRow, int targetCol) {
        if (table == null || targetRow < 0 || targetCol < 0) return null;
        int numRows = table.getNumberOfRows();
        if (targetRow >= numRows) return null;

        int maxCols = getTableLogicalCols(table);
        boolean[][] covered = new boolean[numRows][maxCols];

        for (int r = 0; r < numRows; r++) {
            XWPFTableRow row = table.getRow(r);
            if (row == null) continue;

            int logicalCol = 0;
            for (int pc = 0; pc < row.getTableCells().size(); pc++) {
                XWPFTableCell cell = row.getCell(pc);
                if (cell == null) continue;
                if (isHMergeContinue(cell)) continue;

                while (logicalCol < maxCols && covered[r][logicalCol]) {
                    logicalCol++;
                }
                if (logicalCol >= maxCols) break;

                if (isVMergeContinue(cell)) {
                    logicalCol += getGridSpan(cell);
                    continue;
                }

                int colSpan = getGridSpan(cell);
                int rowSpan = 1;
                CTTcPr pr = cell.getCTTc().getTcPr();
                if (pr != null && pr.isSetVMerge() && pr.getVMerge().isSetVal()
                        && pr.getVMerge().getVal() == STMerge.RESTART) {
                    rowSpan = countVerticalSpan(table, r, pc);
                }

                if (r == targetRow && logicalCol == targetCol) {
                    return cell;
                }

                for (int dr = 0; dr < rowSpan; dr++) {
                    for (int dc = 0; dc < colSpan; dc++) {
                        int rr = r + dr;
                        int cc = logicalCol + dc;
                        if (rr < numRows && cc < maxCols) {
                            covered[rr][cc] = true;
                        }
                    }
                }
                logicalCol += colSpan;
            }
        }
        return null;
    }

    static List<XWPFTable> collectAllTables(XWPFDocument doc) {
        List<XWPFTable> tables = new ArrayList<>();
        collectTablesFromElements(doc.getBodyElements(), tables);
        XWPFHeaderFooterPolicy policy = doc.getHeaderFooterPolicy();
        if (policy != null) {
            if (policy.getDefaultHeader() != null) {
                collectTablesFromElements(policy.getDefaultHeader().getBodyElements(), tables);
            }
            if (policy.getDefaultFooter() != null) {
                collectTablesFromElements(policy.getDefaultFooter().getBodyElements(), tables);
            }
        }
        for (XWPFHeader header : doc.getHeaderList()) {
            collectTablesFromElements(header.getBodyElements(), tables);
        }
        for (XWPFFooter footer : doc.getFooterList()) {
            collectTablesFromElements(footer.getBodyElements(), tables);
        }
        return tables;
    }

    private static void collectTablesFromElements(List<IBodyElement> elements, List<XWPFTable> out) {
        if (elements == null) return;
        for (IBodyElement element : elements) {
            if (element instanceof XWPFTable table) {
                out.add(table);
                for (XWPFTableRow row : table.getRows()) {
                    if (row == null) continue;
                    for (XWPFTableCell cell : row.getTableCells()) {
                        collectTablesFromElements(cell.getBodyElements(), out);
                    }
                }
            }
        }
    }

    @FunctionalInterface
    interface CellTextWriter {
        void write(XWPFTableCell cell, String text);
    }
}
