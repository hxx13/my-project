package com.example.demo.modules.ai.excel;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.ss.util.CellRangeAddress;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * 就地改已有工作簿：**在文件本体上删列**，其余列左移，样式随格子一起走。
 *
 * <p>为什么非得在文件上改（而不是「读出来、重画一张」）：导出件的外观是导出器算出来的
 * （小计分块配色、层级缩进）。重画会把外观丢掉，用户盯着的是那份文件，改完变成另一副样子
 * 会被当成 bug。在文件上改，外观原样保留。
 *
 * <p>删列是**整张表**的操作，含小计行 —— 小计的标签与数值也是普通单元格，跟着左移才是
 * 「删掉这一列」的正确语义。列宽与合并区一并左移。
 */
public final class WorkbookColumnEditor {

    private WorkbookColumnEditor() {
    }

    /** 第一个工作表的表头（第一行各单元格的文本，按列顺序）。 */
    public static List<String> headersOf(byte[] xlsx) {
        try (Workbook wb = open(xlsx)) {
            Sheet sh = wb.getSheetAt(0);
            Row head = sh.getRow(sh.getFirstRowNum());
            List<String> out = new ArrayList<>();
            if (head == null) {
                return out;
            }
            for (int c = head.getFirstCellNum(); c < head.getLastCellNum(); c++) {
                out.add(textOf(head.getCell(c)));
            }
            return out;
        } catch (Exception e) {
            throw new IllegalArgumentException("读表头失败：" + e.getMessage(), e);
        }
    }

    /**
     * 按**列名**删列（首尾空白与大小写不敏感）。
     *
     * <p>用列名而不是列号：用户和模型说的都是「数量那一列」，而列号在删掉别的列之后就会错位。
     *
     * @param names 要删的列名
     * @return 改完的新字节；一个都没匹配上时**原样返回**（不制造一份看起来改过其实没改的文件）
     */
    public static byte[] dropColumns(byte[] xlsx, List<String> names) {
        Set<String> wanted = new LinkedHashSet<>();
        if (names != null) {
            for (String n : names) {
                if (n != null && !n.isBlank()) {
                    wanted.add(normalize(n));
                }
            }
        }
        if (wanted.isEmpty()) {
            return xlsx;
        }
        try (Workbook wb = open(xlsx)) {
            boolean changed = false;
            for (int s = 0; s < wb.getNumberOfSheets(); s++) {
                if (dropFromSheet(wb.getSheetAt(s), wanted)) {
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
            throw new IllegalArgumentException("删列失败：" + e.getMessage(), e);
        }
    }

    /** @return 这张表上有没有真的删掉列 */
    private static boolean dropFromSheet(Sheet sh, Set<String> wanted) {
        Row head = sh.getRow(sh.getFirstRowNum());
        if (head == null) {
            return false;
        }
        // 从右往左删：删左边那列不会影响右边还没处理的列号
        List<Integer> hits = new ArrayList<>();
        for (int c = head.getFirstCellNum(); c < head.getLastCellNum(); c++) {
            if (wanted.contains(normalize(textOf(head.getCell(c))))) {
                hits.add(c);
            }
        }
        if (hits.isEmpty()) {
            return false;
        }
        hits.sort((a, b) -> Integer.compare(b, a));
        for (int idx : hits) {
            shiftColumnLeft(sh, idx);
        }
        return true;
    }

    /**
     * 把第 {@code idx} 列从这一行上抹掉，右边各列依次左移一格。
     *
     * <p>**自己搬而不是用 POI 的 shiftCellsLeft**：那个方法的列号约定与本场景不同
     * （自检实测：内容没按预期移，且一次删两列会直接抛「Column index less than zero」）。
     * 逐格搬虽然多几行，但语义完全在我们手里 —— 这种「改用户文件」的地方，宁可啰嗦也不要惊喜。
     */
    private static void shiftColumnLeft(Sheet sh, int idx) {
        for (Row row : sh) {
            int last = row.getLastCellNum() - 1;
            if (last < idx) {
                continue;   // 这一行比被删的列还短：不参与左移，也不能把它搞坏
            }
            for (int c = idx; c < last; c++) {
                Cell src = row.getCell(c + 1);
                Cell dst = row.getCell(c);
                if (src == null) {
                    if (dst != null) {
                        row.removeCell(dst);
                    }
                    continue;
                }
                if (dst == null) {
                    dst = row.createCell(c);
                }
                copyInto(src, dst);
            }
            Cell tail = row.getCell(last);
            if (tail != null) {
                row.removeCell(tail);
            }
        }
        // 列宽跟着左移；最后一列沿用前一列的宽度即可（导出件各列宽度本就近似）
        Row headRow = sh.getRow(sh.getFirstRowNum());
        int lastCol = headRow == null ? idx : headRow.getLastCellNum();
        for (int c = idx; c < lastCol; c++) {
            sh.setColumnWidth(c, sh.getColumnWidth(c + 1));
        }
        // 合并区（导出件通常没有；有就一起左移，免得合并框错位）
        for (int i = 0; i < sh.getNumMergedRegions(); i++) {
            CellRangeAddress r = sh.getMergedRegion(i);
            if (r.getFirstColumn() >= idx) {
                sh.removeMergedRegion(i);
                sh.addMergedRegion(new CellRangeAddress(r.getFirstRow(), r.getLastRow(),
                        r.getFirstColumn() - 1, r.getLastColumn() - 1));
                i--;
            }
        }
    }

    /** 把 src 的值与样式搬到 dst（同一个工作簿内，样式对象直接共用即可）。 */
    private static void copyInto(Cell src, Cell dst) {
        dst.setCellStyle(src.getCellStyle());
        switch (src.getCellType()) {
            case STRING -> dst.setCellValue(src.getStringCellValue());
            case NUMERIC -> dst.setCellValue(src.getNumericCellValue());
            case BOOLEAN -> dst.setCellValue(src.getBooleanCellValue());
            case FORMULA -> dst.setCellFormula(src.getCellFormula());
            default -> dst.setBlank();
        }
    }

    /**
     * 只留这几列（按给定顺序重排）。列名对不上的一律忽略；一个都没对上时原样返回。
     *
     * <p>比「删列」更贴用户的说法：「只要时间和物品两列」。
     */
    public static byte[] keepColumns(byte[] xlsx, List<String> keep) {
        List<String> wanted = new ArrayList<>();
        if (keep != null) {
            for (String n : keep) {
                if (n != null && !n.isBlank() && !wanted.contains(normalize(n))) {
                    wanted.add(normalize(n));
                }
            }
        }
        if (wanted.isEmpty()) {
            return xlsx;
        }
        try (Workbook wb = open(xlsx)) {
            boolean changed = false;
            for (int s = 0; s < wb.getNumberOfSheets(); s++) {
                if (keepOnSheet(wb.getSheetAt(s), wanted)) {
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
            throw new IllegalArgumentException("保留列失败：" + e.getMessage(), e);
        }
    }

    private static boolean keepOnSheet(Sheet sh, List<String> wanted) {
        Row head = sh.getRow(sh.getFirstRowNum());
        if (head == null) {
            return false;
        }
        // 用户给的列名 → 表里实际列号；对不上的丢掉
        List<Integer> from = new ArrayList<>();
        for (String name : wanted) {
            for (int c = head.getFirstCellNum(); c < head.getLastCellNum(); c++) {
                if (name.equals(normalize(textOf(head.getCell(c)))) && !from.contains(c)) {
                    from.add(c);
                    break;
                }
            }
        }
        if (from.isEmpty()) {
            return false;
        }
        for (Row row : sh) {
            int last = row.getLastCellNum();
            if (last <= 0) {
                continue;
            }
            // 先把整行快照下来再重写 —— 边读边写会在「往右移」的列上读到刚写过的新值
            List<CellSnapshot> snap = new ArrayList<>();
            for (int c = 0; c < last; c++) {
                snap.add(CellSnapshot.of(row.getCell(c)));
            }
            for (int c = 0; c < last; c++) {
                Cell old = row.getCell(c);
                if (old != null) {
                    row.removeCell(old);
                }
            }
            for (int i = 0; i < from.size(); i++) {
                int src = from.get(i);
                if (src < snap.size()) {
                    snap.get(src).writeTo(row.createCell(i));
                }
            }
        }
        for (int i = 0; i < from.size(); i++) {
            sh.setColumnWidth(i, sh.getColumnWidth(from.get(i)));
        }
        return true;
    }

    /**
     * 改列名（按表头文本找到那一列，改掉表头单元格的文字）。表里没有这一列时原样返回。
     *
     * <p>只动表头单元格，不动数据 —— 数据列是导出口径的一部分，改个名字是用户能自己解释的事。
     */
    public static byte[] renameColumn(byte[] xlsx, String from, String to) {
        if (from == null || from.isBlank() || to == null || to.isBlank()) {
            return xlsx;
        }
        String target = normalize(from);
        try (Workbook wb = open(xlsx)) {
            boolean changed = false;
            for (int s = 0; s < wb.getNumberOfSheets(); s++) {
                Sheet sh = wb.getSheetAt(s);
                Row head = sh.getRow(sh.getFirstRowNum());
                if (head == null) {
                    continue;
                }
                for (int c = head.getFirstCellNum(); c < head.getLastCellNum(); c++) {
                    Cell cell = head.getCell(c);
                    if (target.equals(normalize(textOf(cell)))) {
                        cell.setCellValue(to);
                        changed = true;
                    }
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
            throw new IllegalArgumentException("改列名失败：" + e.getMessage(), e);
        }
    }

    /** 一个单元格的值与样式（重排列时先快照、再写回）。 */
    private record CellSnapshot(CellType type, String text, double number, boolean bool, CellStyle style) {

        static CellSnapshot of(Cell cell) {
            if (cell == null) {
                return new CellSnapshot(CellType.BLANK, "", 0, false, null);
            }
            CellType type = cell.getCellType();
            return new CellSnapshot(type,
                    type == CellType.STRING ? cell.getStringCellValue() : "",
                    type == CellType.NUMERIC ? cell.getNumericCellValue() : 0,
                    type == CellType.BOOLEAN && cell.getBooleanCellValue(),
                    cell.getCellStyle());
        }

        void writeTo(Cell dst) {
            if (style != null) {
                dst.setCellStyle(style);
            }
            switch (type) {
                case STRING -> dst.setCellValue(text);
                case NUMERIC -> dst.setCellValue(number);
                case BOOLEAN -> dst.setCellValue(bool);
                default -> dst.setBlank();
            }
        }
    }

    private static Workbook open(byte[] xlsx) throws Exception {
        if (xlsx == null || xlsx.length == 0) {
            throw new IllegalArgumentException("没有文件内容");
        }
        return WorkbookFactory.create(new ByteArrayInputStream(xlsx));
    }

    /** 单元格的文本取值（数字按整数显示，避免 3.0 这种）。给整个 excel 包共用。 */
    static String textOf(Cell cell) {
        if (cell == null) {
            return "";
        }
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue();
            case NUMERIC -> {
                double d = cell.getNumericCellValue();
                yield d == Math.rint(d) && !Double.isInfinite(d)
                        ? String.valueOf((long) d) : String.valueOf(d);
            }
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            case FORMULA -> cell.getCellFormula();
            default -> "";
        };
    }

    private static String normalize(String s) {
        return s == null ? "" : s.trim().toLowerCase(Locale.ROOT);
    }
}
