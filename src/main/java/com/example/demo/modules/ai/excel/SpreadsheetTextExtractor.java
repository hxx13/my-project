package com.example.demo.modules.ai.excel;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.FormulaEvaluator;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.ss.util.CellRangeAddress;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * xlsx / xls → **网格**。大模型处理 Excel 的那一半「确定性转换」全在这里。
 *
 * <p>为什么必须有这一层：模型只吃 token，xlsx 是二进制 ZIP 它读不了；而「让模型自己从原始表格里
 * 算日期、认合并单元格」必然出错。所以解析层负责把它变成规整的二维字符串：
 * <ul>
 *   <li><b>公式取计算结果</b>（{@code DataFormatter#formatCellValue(cell, evaluator)}）——
 *       POI 默认给的是公式串 {@code =A1+B1}，直接喂给模型它就只会看到公式而看不到值；</li>
 *   <li><b>展开合并单元格</b> —— 合并区里除左上角外都是空值，不展开的话模型会以为「这几行没数据」；</li>
 *   <li><b>裁剪尾部空行空列，保留中间空行</b> —— 脏表常带着上百万行的格式化空行（POI 的
 *       lastRowNum 会因此巨大）；但中间的空行不能删，删了行号就错位，模型说的「第 3 行」就对不上了；</li>
 *   <li><b>限额与截断标记</b> —— 超限就截，但**必须显式告诉调用方截了**（静默截断会让模型拿半张表下结论）。</li>
 * </ul>
 */
@Component
public class SpreadsheetTextExtractor {

    /** 单个 sheet 最多收这么多行（超了截断并标记）。 */
    public static final int MAX_ROWS_PER_SHEET = 2000;
    /** 最多收这么多列（超了截断并标记）。 */
    public static final int MAX_COLS = 60;
    /** 最多收这么多 sheet。 */
    public static final int MAX_SHEETS = 10;
    /** 解析后总字符上限（约 1MB），超了停止并标记。 */
    public static final int MAX_CHARS = 1_000_000;

    /** 一个 sheet：名字 + 规整后的行（每行等长，空单元格是空串）。 */
    public record GridSheet(String name, List<List<String>> rows) {
    }

    /**
     * 解析结果。
     *
     * @param truncated 是否有内容因限额被丢弃 —— **调用方必须把这件事告诉模型和用户**
     * @param note      截断原因（给人看的一句话）；未截断时为空
     */
    public record Grid(List<GridSheet> sheets, boolean truncated, String note) {

        /**
         * sheet 个数。**标 {@code @JsonIgnore}**：这是从 {@code sheets} 派生的取值方法，不是记录组件；
         * 不标它 Jackson 会把它当属性写进 JSON，读回来时成了「未知属性」——
         * 用一个没配 {@code FAIL_ON_UNKNOWN_PROPERTIES=false} 的 ObjectMapper 读就会直接抛，
         * 于是预览只剩表头、**数据行整段消失**（单测逮到过）。
         */
        @com.fasterxml.jackson.annotation.JsonIgnore
        public int sheetCount() {
            return sheets.size();
        }

        /** 第 index 个 sheet 的行数；越界返回 0。 */
        public int rowCount(int index) {
            return index >= 0 && index < sheets.size() ? sheets.get(index).rows().size() : 0;
        }
    }

    public Grid parse(byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw new IllegalArgumentException("文件内容为空");
        }
        List<GridSheet> sheets = new ArrayList<>();
        boolean truncated = false;
        String note = "";
        int budget = MAX_CHARS;
        try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(bytes))) {
            FormulaEvaluator evaluator = wb.getCreationHelper().createFormulaEvaluator();
            DataFormatter formatter = new DataFormatter();
            int sheetTotal = wb.getNumberOfSheets();
            if (sheetTotal > MAX_SHEETS) {
                truncated = true;
                note = "只解析了前 " + MAX_SHEETS + " 个工作表（共 " + sheetTotal + " 个）";
            }
            int used = 0;
            for (int s = 0; s < Math.min(sheetTotal, MAX_SHEETS); s++) {
                Sheet sheet = wb.getSheetAt(s);
                List<List<String>> rows = readSheet(sheet, formatter, evaluator);
                if (rows.size() > MAX_ROWS_PER_SHEET) {
                    rows = new ArrayList<>(rows.subList(0, MAX_ROWS_PER_SHEET));
                    truncated = true;
                    note = joinNote(note, "工作表「" + sheet.getSheetName() + "」超过 " + MAX_ROWS_PER_SHEET + " 行，只取了前 " + MAX_ROWS_PER_SHEET + " 行");
                }
                int chars = countChars(rows);
                if (chars > budget) {
                    truncated = true;
                    note = joinNote(note, "内容超过 " + MAX_CHARS + " 字符，后面的没读");
                    // 能收多少收多少：按行截到预算内
                    rows = trimToBudget(rows, budget);
                    chars = countChars(rows);
                }
                budget -= chars;
                sheets.add(new GridSheet(sheet.getSheetName(), rows));
                used++;
                if (budget <= 0) {
                    if (used < Math.min(sheetTotal, MAX_SHEETS)) {
                        truncated = true;
                        note = joinNote(note, "字符预算用尽，后面的工作表没读");
                    }
                    break;
                }
            }
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("读取表格失败：" + e.getMessage() + "（只支持 xlsx / xls）");
        }
        if (sheets.isEmpty()) {
            throw new IllegalArgumentException("这个文件里没有可读的工作表");
        }
        return new Grid(sheets, truncated, note);
    }

    /**
     * 纯文本（md / txt / csv）→ **单列网格**（一行一行）。
     *
     * <p>为什么塞进同一套模型：这样预览、分段读、限额与截断标记**一行都不用改**就能复用，
     * 而且「第 N 行」在文本文件里天然成立（一行就是一行）。
     *
     * <p>编码：先按 UTF-8 **严格**解，解不通退回 GBK —— 同事从 Excel「另存为文本」出来的 .txt
     * 多是 GBK，直接用 UTF-8 读会得到一屏乱码，而**乱码比读不出来更糟**：模型会照着乱码编内容。
     */
    public Grid parsePlainText(byte[] bytes, String filename) {
        if (bytes == null || bytes.length == 0) {
            throw new IllegalArgumentException("文件内容为空");
        }
        return gridFromLines(decodeText(bytes), filename);
    }

    /**
     * PDF：PDFBox 抽文字层。抽出来是纯文本，没有版式 —— 分栏会串行、表格会散成一行行。
     * 对「把这份文件读给模型听」够用；要还原表格得换版面分析，那是另一个量级的事。
     * 扫描件（图片型 PDF）没有文字层，抽出来是空的，调用方据空网格如实告知用户。
     */
    public Grid parsePdf(byte[] bytes, String filename) {
        if (bytes == null || bytes.length == 0) {
            throw new IllegalArgumentException("文件内容为空");
        }
        String text;
        try (org.apache.pdfbox.pdmodel.PDDocument doc =
                     org.apache.pdfbox.Loader.loadPDF(bytes)) {
            org.apache.pdfbox.text.PDFTextStripper stripper =
                    new org.apache.pdfbox.text.PDFTextStripper();
            // 按坐标排序：不排的话多栏文档会按对象顺序乱跳
            stripper.setSortByPosition(true);
            text = stripper.getText(doc);
        } catch (Exception e) {
            throw new IllegalArgumentException("PDF 解析失败：" + e.getMessage());
        }
        return gridFromLines(text, filename);
    }

    /**
     * Word（.docx）：段落与表格都读出来。
     * 表格压成 `a | b` 的行文本 —— 这里不求还原成网格，只求内容完整交给模型。
     * 老式 .doc 不在此列（XWPF 只认 OOXML 包）。
     */
    public Grid parseDocx(byte[] bytes, String filename) {
        if (bytes == null || bytes.length == 0) {
            throw new IllegalArgumentException("文件内容为空");
        }
        StringBuilder sb = new StringBuilder();
        try (org.apache.poi.xwpf.usermodel.XWPFDocument doc =
                     new org.apache.poi.xwpf.usermodel.XWPFDocument(new ByteArrayInputStream(bytes))) {
            for (org.apache.poi.xwpf.usermodel.IBodyElement el : doc.getBodyElements()) {
                if (el instanceof org.apache.poi.xwpf.usermodel.XWPFParagraph p) {
                    sb.append(p.getText()).append('\n');
                } else if (el instanceof org.apache.poi.xwpf.usermodel.XWPFTable t) {
                    for (org.apache.poi.xwpf.usermodel.XWPFTableRow row : t.getRows()) {
                        sb.append(row.getTableCells().stream()
                                        .map(org.apache.poi.xwpf.usermodel.XWPFTableCell::getText)
                                        .collect(java.util.stream.Collectors.joining(" | ")))
                                .append('\n');
                    }
                }
            }
        } catch (Exception e) {
            throw new IllegalArgumentException("Word 解析失败：" + e.getMessage());
        }
        return gridFromLines(sb.toString(), filename);
    }

    /**
     * 按扩展名分流。判扩展名而不是猜内容，行为可预期。
     *
     * @throws IllegalArgumentException 扩展名不在支持范围内（调用方转成给用户看的一句话）
     */
    public Grid parseAny(byte[] bytes, String filename) {
        String n = filename == null ? "" : filename.toLowerCase();
        if (n.endsWith(".pdf")) return parsePdf(bytes, filename);
        if (n.endsWith(".docx")) return parseDocx(bytes, filename);
        if (n.endsWith(".md") || n.endsWith(".markdown") || n.endsWith(".txt")) {
            return parsePlainText(bytes, filename);
        }
        if (n.endsWith(".xlsx") || n.endsWith(".xls")) return parse(bytes);
        throw new IllegalArgumentException("暂不支持这种文件：" + filename);
    }

    /** 一段纯文本 → 单列网格：一行一行。文本类来源（md/txt/pdf/docx）共用。 */
    private Grid gridFromLines(String text, String filename) {
        List<List<String>> rows = new ArrayList<>();
        boolean truncated = false;
        String note = "";
        int budget = MAX_CHARS;
        for (String line : text.split("\r\n|\r|\n", -1)) {
            if (rows.size() >= MAX_ROWS_PER_SHEET) {
                truncated = true;
                note = "超过 " + MAX_ROWS_PER_SHEET + " 行，只读了前 " + MAX_ROWS_PER_SHEET + " 行";
                break;
            }
            if (budget - line.length() - 1 <= 0) {
                truncated = true;
                note = "内容超过 " + MAX_CHARS + " 字符，后面的没读";
                break;
            }
            budget -= line.length() + 1;
            rows.add(List.of(line));
        }
        // 尾部空行砍掉（与表格同一口径）；中间空行保留，行号才对得上
        int lastNonBlank = -1;
        for (int i = 0; i < rows.size(); i++) {
            if (!rows.get(i).get(0).isEmpty()) {
                lastNonBlank = i;
            }
        }
        List<List<String>> kept = lastNonBlank < 0
                ? new ArrayList<>()
                : new ArrayList<>(rows.subList(0, lastNonBlank + 1));
        return new Grid(List.of(new GridSheet(sheetNameOf(filename), kept)), truncated, note);
    }

    private static String sheetNameOf(String filename) {
        if (filename == null || filename.isBlank()) {
            return "正文";
        }
        int dot = filename.lastIndexOf('.');
        String base = dot > 0 ? filename.substring(0, dot) : filename;
        return base.isBlank() ? "正文" : base;
    }

    private static String decodeText(byte[] bytes) {
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
                    .onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT)
                    .decode(java.nio.ByteBuffer.wrap(bytes))
                    .toString();
        } catch (java.nio.charset.CharacterCodingException e) {
            return new String(bytes, java.nio.charset.Charset.forName("GBK"));
        }
    }

    /** 读一个 sheet：格式化取值 → 展开合并 → 裁尾部空行空列。 */
    private List<List<String>> readSheet(Sheet sheet, DataFormatter formatter, FormulaEvaluator evaluator) {
        int first = sheet.getFirstRowNum();
        int last = sheet.getLastRowNum();
        List<List<String>> rows = new ArrayList<>();
        int widest = 0;
        for (int r = first; r <= last; r++) {
            Row row = sheet.getRow(r);
            if (row == null) {
                rows.add(List.of());
                continue;
            }
            int lastCell = Math.min(row.getLastCellNum(), MAX_COLS);
            List<String> cells = new ArrayList<>();
            for (int c = 0; c < Math.max(lastCell, 0); c++) {
                Cell cell = row.getCell(c);
                cells.add(cell == null ? "" : formatter.formatCellValue(cell, evaluator).trim());
            }
            widest = Math.max(widest, cells.size());
            rows.add(cells);
        }

        // 展开合并单元格：合并区里除左上角全是空，不填的话模型会以为那几行没值
        for (CellRangeAddress region : sheet.getMergedRegions()) {
            int r0 = region.getFirstRow() - first;
            int c0 = region.getFirstColumn();
            if (r0 < 0 || r0 >= rows.size() || c0 >= MAX_COLS) {
                continue;
            }
            String value = cellAt(rows, r0, c0);
            if (value.isEmpty()) {
                continue;
            }
            for (int r = region.getFirstRow(); r <= region.getLastRow(); r++) {
                int ri = r - first;
                if (ri < 0 || ri >= rows.size()) {
                    continue;
                }
                for (int c = c0; c <= Math.min(region.getLastColumn(), MAX_COLS - 1); c++) {
                    ensureSize(rows, ri, c + 1);
                    rows.get(ri).set(c, value);
                }
            }
        }
        return padAndTrim(rows, widest);
    }

    /** 行等长（补空串）+ 去掉尾部全空行 + 去掉尾部全空列；**保留中间空行**（行号不许错位）。 */
    private static List<List<String>> padAndTrim(List<List<String>> rows, int widest) {
        List<List<String>> padded = new ArrayList<>(rows.size());
        for (List<String> row : rows) {
            List<String> copy = new ArrayList<>(row);
            while (copy.size() < widest) {
                copy.add("");
            }
            padded.add(copy);
        }
        int lastNonBlank = -1;
        for (int i = 0; i < padded.size(); i++) {
            if (isBlank(padded.get(i))) {
                continue;
            }
            lastNonBlank = i;
        }
        if (lastNonBlank < 0) {
            return new ArrayList<>();
        }
        List<List<String>> out = new ArrayList<>(padded.subList(0, lastNonBlank + 1));
        // 尾部空列：所有行都在这一列之后为空就砍掉
        int lastCol = -1;
        for (List<String> row : out) {
            for (int c = 0; c < row.size(); c++) {
                if (!row.get(c).isEmpty()) {
                    lastCol = Math.max(lastCol, c);
                }
            }
        }
        if (lastCol < 0) {
            return new ArrayList<>();
        }
        if (lastCol + 1 < widest) {
            for (List<String> row : out) {
                row.subList(lastCol + 1, row.size()).clear();
            }
        }
        return out;
    }

    private static void ensureSize(List<List<String>> rows, int rowIndex, int size) {
        List<String> row = rows.get(rowIndex);
        while (row.size() < size) {
            row.add("");
        }
    }

    private static String cellAt(List<List<String>> rows, int r, int c) {
        if (r < 0 || r >= rows.size()) {
            return "";
        }
        List<String> row = rows.get(r);
        return c >= 0 && c < row.size() ? row.get(c) : "";
    }

    private static boolean isBlank(List<String> row) {
        for (String s : row) {
            if (s != null && !s.isEmpty()) {
                return false;
            }
        }
        return true;
    }

    private static int countChars(List<List<String>> rows) {
        int n = 0;
        for (List<String> row : rows) {
            for (String s : row) {
                n += s == null ? 0 : s.length() + 1;
            }
        }
        return n;
    }

    private static List<List<String>> trimToBudget(List<List<String>> rows, int budget) {
        List<List<String>> out = new ArrayList<>();
        int used = 0;
        for (List<String> row : rows) {
            int rowChars = 0;
            for (String s : row) {
                rowChars += s == null ? 0 : s.length() + 1;
            }
            if (used + rowChars > budget) {
                break;
            }
            used += rowChars;
            out.add(row);
        }
        return out;
    }

    private static String joinNote(String a, String b) {
        if (a == null || a.isEmpty()) {
            return b;
        }
        return a + "；" + b;
    }
}
