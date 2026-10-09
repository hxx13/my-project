package com.example.demo.modules.ai.excel;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 就地改已有工作簿：**在文件本体上删行 / 按条件筛行**。
 *
 * <p>这个类只做**编辑**本身，不替用户判断「删了这行会不会把报表改坏」——
 * 那是模型的事（它看得见整张表、也听得懂用户要什么）。这里保证的只有两件：
 * **删掉的就是那一行**（后面的行整行上移，样式跟着走），以及**没说要删的一律不动**。
 *
 * <p>列一律按**表头名**定位，所以列被换过顺序、删过几列之后照样筛得对。
 */
public final class WorkbookRowEditor {

    private WorkbookRowEditor() {
    }

    /** 把某一列满足条件的行删掉。 */
    public static byte[] dropRowsWhere(byte[] xlsx, String column, String op, String value) {
        if (column == null || column.isBlank()) {
            throw new IllegalArgumentException("要按哪一列筛？");
        }
        Matcher matcher = Matcher.of(op, value);
        return apply(xlsx, (rowNum, row, headerByCol) -> {
            Integer col = columnOf(headerByCol, column);
            if (col == null) {
                throw new IllegalArgumentException("表里没有列「" + column + "」");
            }
            return matcher.test(textAt(row, col));
        });
    }

    /**
     * 删掉指定的行（**1 起，与 Excel 里显示的行号一致**）。表头行不会被删。
     *
     * @param rowNumbers 行号；越界的忽略
     */
    public static byte[] dropRows(byte[] xlsx, List<Integer> rowNumbers) {
        if (rowNumbers == null || rowNumbers.isEmpty()) {
            return xlsx;
        }
        return apply(xlsx, (rowNum, row, headerByCol) -> rowNumbers.contains(rowNum + 1));
    }

    /** 删掉整行都空的那些行（**空白得连 Row 对象都没有的也算**）。 */
    public static byte[] dropEmptyRows(byte[] xlsx) {
        return apply(xlsx, (rowNum, row, headerByCol) -> isEmpty(row));
    }

    /**
     * 某一列上有哪些值（去重，保持出现顺序）。
     *
     * <p>筛完发现一行都没删掉时用它把「这一列实际写了什么」报回去 ——
     * 比干说一句「没找到」有用得多：模型可以据此告诉用户真实取值。
     */
    public static List<String> distinctValues(byte[] xlsx, String column, int limit) {
        if (column == null || column.isBlank()) {
            return List.of();
        }
        try (Workbook wb = open(xlsx)) {
            Sheet sh = wb.getSheetAt(0);
            Integer col = columnOf(headerColumns(sh, sh.getFirstRowNum()), column);
            if (col == null) {
                return List.of();
            }
            List<String> out = new ArrayList<>();
            for (int r = sh.getFirstRowNum() + 1; r <= sh.getLastRowNum(); r++) {
                Row row = sh.getRow(r);
                if (row == null) {
                    continue;
                }
                String v = textAt(row, col);
                if (!v.isBlank() && !out.contains(v)) {
                    out.add(v);
                    if (limit > 0 && out.size() >= limit) {
                        break;
                    }
                }
            }
            return out;
        } catch (Exception e) {
            return List.of();
        }
    }

    // ── 核心 ──

    /**
     * 判定某一行要不要删。
     *
     * <p>{@code row} **可能为 null** —— 中间那些整行空白的行在 xlsx 里往往压根没有
     * {@code <row>} 元素，POI 就不建 Row 对象。它仍然是用户在 Excel 里看得见的一个空行，
     * 所以判空行时**null 就是空**；按列筛时 null 行按空值参与比较。
     * （早先这里把 null 直接跳过，于是「删掉空行」永远报"没有空行"—— 真机 2026-10-09 撞到。）
     */
    private interface Removal {
        boolean test(int rowNum, Row rowOrNull, Map<Integer, String> headerByCol);
    }

    private static byte[] apply(byte[] xlsx, Removal removal) {
        try (Workbook wb = open(xlsx)) {
            boolean changed = false;
            for (int s = 0; s < wb.getNumberOfSheets(); s++) {
                if (removeFromSheet(wb.getSheetAt(s), removal)) {
                    changed = true;
                }
            }
            if (!changed) {
                return xlsx;
            }
            try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                wb.write(out);
                return out.toByteArray();
            }
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("删行失败：" + e.getMessage(), e);
        }
    }

    private static boolean removeFromSheet(Sheet sh, Removal removal) {
        int headerRow = sh.getFirstRowNum();
        Map<Integer, String> headerByCol = headerColumns(sh, headerRow);
        // 先定出要删哪些行，再自下而上删 —— 自上而下会把后面还没处理的行号全挪走
        List<Integer> doomed = new ArrayList<>();
        for (int r = headerRow + 1; r <= sh.getLastRowNum(); r++) {
            if (removal.test(r, sh.getRow(r), headerByCol)) {
                doomed.add(r);
            }
        }
        if (doomed.isEmpty()) {
            return false;
        }
        doomed.sort((a, b) -> Integer.compare(b, a));
        for (int r : doomed) {
            deleteRow(sh, r);
        }
        return true;
    }

    /** 删一行 = 后面的行整体上移一格（Excel 里「删除行」就是这个意思，不会留一个空行）。 */
    private static void deleteRow(Sheet sh, int rowIndex) {
        int last = sh.getLastRowNum();
        if (rowIndex > last) {
            return;
        }
        if (rowIndex < last) {
            sh.shiftRows(rowIndex + 1, last, -1);
        }
        Row stale = sh.getRow(last);
        if (stale != null) {
            sh.removeRow(stale);
        }
    }

    private static Map<Integer, String> headerColumns(Sheet sh, int headerRow) {
        Map<Integer, String> byCol = new LinkedHashMap<>();
        Row head = sh.getRow(headerRow);
        if (head == null) {
            return byCol;
        }
        for (int c = head.getFirstCellNum(); c < head.getLastCellNum(); c++) {
            String text = textAt(head, c);
            if (!text.isBlank()) {
                byCol.put(c, text);
            }
        }
        return byCol;
    }

    private static Integer columnOf(Map<Integer, String> headerByCol, String name) {
        String want = name.trim();
        for (Map.Entry<Integer, String> e : headerByCol.entrySet()) {
            if (e.getValue().equalsIgnoreCase(want)) {
                return e.getKey();
            }
        }
        return null;
    }

    /** null 行（xlsx 里连 &lt;row&gt; 都没有的空行）也算空行 —— 用户在 Excel 里看它就是空的。 */
    private static boolean isEmpty(Row row) {
        if (row == null) {
            return true;
        }
        for (int c = Math.max(row.getFirstCellNum(), 0); c < row.getLastCellNum(); c++) {
            Cell cell = row.getCell(c);
            if (cell != null && cell.getCellType() != CellType.BLANK
                    && !WorkbookColumnEditor.textOf(cell).isBlank()) {
                return false;
            }
        }
        return true;
    }

    private static String textAt(Row row, int col) {
        return row == null ? "" : WorkbookColumnEditor.textOf(row.getCell(col)).trim();
    }

    private static Workbook open(byte[] xlsx) throws Exception {
        if (xlsx == null || xlsx.length == 0) {
            throw new IllegalArgumentException("没有文件内容");
        }
        return WorkbookFactory.create(new ByteArrayInputStream(xlsx));
    }

    /** 一个简单条件（不引入表达式引擎：模型能表达的、用户能说清的，就这几种）。 */
    private record Matcher(String op, String value) {

        static Matcher of(String op, String value) {
            String o = op == null || op.isBlank() ? "equals" : op.trim();
            List<String> known = List.of("equals", "notEquals", "contains", "empty", "notEmpty");
            if (!known.contains(o)) {
                throw new IllegalArgumentException("不支持的筛选方式「" + o + "」，可用：" + String.join(" / ", known));
            }
            return new Matcher(o, value == null ? "" : value.trim());
        }

        boolean test(String cellText) {
            String t = cellText == null ? "" : cellText.trim();
            return switch (op) {
                case "equals" -> t.equalsIgnoreCase(value);
                case "notEquals" -> !t.equalsIgnoreCase(value);
                case "contains" -> t.toLowerCase(Locale.ROOT).contains(value.toLowerCase(Locale.ROOT));
                case "empty" -> t.isEmpty();
                default -> !t.isEmpty();
            };
        }
    }
}
