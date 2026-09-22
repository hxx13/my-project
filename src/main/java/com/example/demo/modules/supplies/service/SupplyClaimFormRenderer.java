package com.example.demo.modules.supplies.service;

import com.example.demo.modules.adminfile.OfficeToPdfConverter;
import com.example.demo.modules.supplies.dto.SupplyClaimFormInput;
import org.apache.poi.util.Units;
import org.apache.poi.wp.usermodel.HeaderFooterType;
import org.apache.poi.xwpf.usermodel.Document;
import org.apache.poi.xwpf.usermodel.ParagraphAlignment;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFHeader;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.apache.xmlbeans.impl.xb.xmlschema.SpaceAttribute;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTDecimalNumber;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTJc;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTPPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTR;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTRow;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTbl;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTblGrid;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTc;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTcPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTText;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTVerticalJc;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STJc;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STVerticalJc;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

/**
 * 领用单渲染器。
 *
 * <p>模板是校方原件《实验动物科学部内部物品领用单》，放在
 * {@code src/main/resources/templates/supply-claim-form.docx}。正文只有一张表，**21 行**（0 基）：
 * 0 标题 ｜ 1 表头三格（领用人员/领用楼层/填单日期，各跨 2 列）｜ 2 列头六格 ｜
 * **3..19 共 17 个明细行** ｜ 20 注意事项（整行跨 6）。模板改版时这些行号会移，必须重新数。
 *
 * <p>渲染时会在模板里插两行：标题下面一行「单号」，明细下面一行「签字」（模板没有签字栏，
 * 用户 2026-09-22 定：领用人员 / 出库人两栏）。插入后行号全体下移 —— 本类的写入用的是
 * {@link #fill} 里按「目标明细行数」算出来的局部行号，别对着模板数。
 *
 * <p>明细行数是**变的**：不足 {@link #MIN_ITEM_ROWS} 行渲染 {@link #MIN_ITEM_ROWS} 行
 * （空行留着给人手写），超过就按实际加行。
 *
 * <p><b>回填只动 run，不动 cell</b>（整格重写会把字体间距冲掉）。行的增删在 CTTbl 层做，
 * 改完必须 {@code new XWPFTable(...)} 重新包一层，否则 XWPFTable 构造期缓存的行列表是旧的，
 * 写进去的值不会出现在产物里（转移单踩过，不报错、只是静默不生效）。
 *
 * <p>签名图走**内联**（不是转移单那种浮动锚定）：这张单子 A4 且不吃高度（10 行整表约 347pt /
 * 可用 698pt），没有「必须挤在一页」的约束，内联最简单也最可控。
 */
public final class SupplyClaimFormRenderer {

    /** 模板资源路径（classpath）。 */
    private static final String TEMPLATE_PATH = "/templates/supply-claim-form.docx";

    /** 页眉左侧的院系 logo（与转移单同一枚，从转移单模板里取出来的）。 */
    private static final String LOGO_PATH = "/templates/supply-claim-logo.png";
    /** logo 打印宽度（pt）；原图 568×118，按比例算高度。 */
    private static final double LOGO_W_PT = 180;

    /** 表单列数（列头那一行有 6 格）。 */
    private static final int TABLE_COLS = 6;
    /**
     * 正文可用宽度（pt 的二十分之一）：A4 宽 11906 − 左右边距各 1800。
     *
     * <p>原件里的表是 8522，比可用区还宽 216（约 11pt），印出来会顶到右页边。
     * 整表按比例缩到可用宽度，版式比例不变，只是左右各回一点页边。
     */
    private static final int CONTENT_WIDTH_TWIPS = 8306;

    /** 模板行号（0 基）。**插入新行之前**的下标；插入后见 {@link #fill} 的局部行号。 */
    private static final int ROW_TITLE_BEFORE = 0;
    private static final int ROW_HEAD_BEFORE = 1;
    private static final int ROW_ITEM_FIRST_BEFORE = 3;
    private static final int ITEM_ROWS_TEMPLATE = 17;

    /** 明细行数下限：不足这个数也渲染这么多行，空行留着手写。 */
    static final int MIN_ITEM_ROWS = 10;

    /**
     * 六列宽度（pt 的二十分之一），合计 = {@link #CONTENT_WIDTH_TWIPS}。
     *
     * <p>宽度按**列头文字自己要多宽**定，不能让列头折行：10.5pt 一个中文字约 210 twips，
     * 加上左右各 108 的格内边距，所以「领用数量」最少要 1056、「实际出库量」1266、
     * 「实际领用日期」1476。数量两类列就从原来的 1182/1509 收到这个下限，让出来的宽度全给**备注**
     * （878→1119，够「按需领用」这种 4 字备注一行写完，用户 2026-09-22 的要求）。
     * 表头行的合并格取对应两列之和。模板的 {@code w:tblGrid} 与各格 {@code tcW} 必须同时改 ——
     * LibreOffice 排版时两者都看。
     */
    private static final int[] COL_WIDTHS = {2119, 1270, 1056, 1476, 1266, 1119};

    /** 插入后：单号行紧跟标题。 */
    private static final int ROW_DOC_NO = 1;
    /** 插入后：表头行。 */
    private static final int ROW_HEAD = 2;
    /** 插入后：列头行（物品名称…备注）。 */
    private static final int ROW_COL = 3;
    /** 插入后：第一个明细行。 */
    private static final int ROW_ITEM_FIRST = 4;

    private static final String DOC_NO_LABEL = "单号：";
    private static final String APPLICANT_SIGN_LABEL = "领用人员签字：";
    private static final String ISSUER_SIGN_LABEL = "出库人签字：";

    /** 签名图的最大边长（pt）——两栏并排，各占半张表宽（约 213pt），80pt 很宽裕。 */
    private static final double SIGN_MAX_W_PT = 80;
    private static final double SIGN_MAX_H_PT = 26;
    /** 裁白边时四周留的呼吸空间（像素）。 */
    private static final int SIGN_PAD_PX = 6;

    private SupplyClaimFormRenderer() {
    }

    /** 明细该渲染几行：不足下限按下限，多了按实际。 */
    static int itemRowCount(int actualRows) {
        return Math.max(MIN_ITEM_ROWS, Math.max(0, actualRows));
    }

    // ---------------------------------------------------------------- 渲染

    /** 渲染领用单 PDF 字节流。不查库：所有数据由调用方传入。 */
    public static byte[] renderToPdf(SupplyClaimFormInput in, OfficeToPdfConverter converter) {
        byte[] docx = renderToDocx(in);
        try {
            return converter.convert(docx, "docx");
        } catch (IOException e) {
            throw new IllegalStateException("领用单转 PDF 失败：" + e.getMessage(), e);
        }
    }

    /**
     * 只出 docx 字节、不转 PDF。转 PDF 要本机装 LibreOffice（每次冷启动 ~3.5s），
     * 所以单测走这条路 —— 行数、明细落格、签字图有没有插进去，解包 docx 就能查。
     */
    public static byte[] renderToDocx(SupplyClaimFormInput in) {
        if (in == null) throw new IllegalArgumentException("领用单渲染入参不能为空");
        try (InputStream is = SupplyClaimFormRenderer.class.getResourceAsStream(TEMPLATE_PATH)) {
            if (is == null) {
                throw new IllegalStateException("领用单模板资源缺失：" + TEMPLATE_PATH + "（没打进 jar？）");
            }
            try (XWPFDocument doc = new XWPFDocument(is)) {
                if (doc.getTables().isEmpty()) {
                    throw new IllegalStateException("领用单模板里没有表格：" + TEMPLATE_PATH);
                }
                addHeaderLogo(doc);
                CTTbl ctTbl = doc.getTables().get(0).getCTTbl();
                int itemRows = itemRowCount(in.getRows() == null ? 0 : in.getRows().size());
                // 表头行**先留一份**：两条新行都从它克隆。插入之后下标会移（单号行会占掉 1），
                // 所以不能等插完再去 getTrArray(1) —— 那拿到的是单号行，格数不对。
                CTRow headTemplate = (CTRow) ctTbl.getTrArray(ROW_HEAD_BEFORE).copy();
                // 顺序要紧：先把明细行数调好（此时还是模板行号），再插新行（新行会把下面的行顶下去）
                resizeItemRows(ctTbl, itemRows);
                insertDocNoRow(ctTbl, headTemplate);
                int signRow = ROW_ITEM_FIRST + itemRows;
                insertSignRow(ctTbl, signRow, headTemplate);
                // 重新包一层：XWPFTable 构造时缓存了行列表，直接改 CTTbl 后旧包装器看不见新行
                XWPFTable table = new XWPFTable(ctTbl, doc);
                // 填之前先把每格的原文留一份：用来判「这格到底填过值没有」（见 centerFields）
                List<List<String>> before = snapshotCellTexts(table);
                fill(table, in, itemRows, signRow);
                applyColumnWidths(table, itemRows);
                centerFields(table, before);
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                doc.write(out);
                return out.toByteArray();
            }
        } catch (IOException e) {
            throw new IllegalStateException("领用单模板读写失败：" + e.getMessage(), e);
        }
    }

    /** 明细行数调到 target：少了删、多了克隆。均在 CTTbl 层做，改完由调用方重包。 */
    private static void resizeItemRows(CTTbl ctTbl, int target) {
        if (target < ITEM_ROWS_TEMPLATE) {
            // 从后往前删，前面的下标才不会跟着动
            for (int i = ROW_ITEM_FIRST_BEFORE + ITEM_ROWS_TEMPLATE - 1; i >= ROW_ITEM_FIRST_BEFORE + target; i--) {
                ctTbl.removeTr(i);
            }
        } else if (target > ITEM_ROWS_TEMPLATE) {
            CTRow template = ctTbl.getTrArray(ROW_ITEM_FIRST_BEFORE);
            for (int k = ITEM_ROWS_TEMPLATE; k < target; k++) {
                CTRow copy = (CTRow) template.copy();
                ctTbl.insertNewTr(ROW_ITEM_FIRST_BEFORE + k);
                ctTbl.setTrArray(ROW_ITEM_FIRST_BEFORE + k, copy);
            }
        }
    }

    /**
     * 标题下面插一行「单号」。克隆**表头行**（同为「几格跨列」结构），再把三格并成一格、跨满 6 列。
     *
     * <p>合并必须在 {@code setTrArray} **之前**做完：XMLBeans 的 set 会把元素**拷一份**进树，
     * 之后再改那份游离的 copy 对文档没有任何影响（第一版就栽在这儿，单号行仍带着表头的三格）。
     */
    private static void insertDocNoRow(CTTbl ctTbl, CTRow headTemplate) {
        CTRow copy = (CTRow) headTemplate.copy();
        mergeToSingleCell(copy);
        ctTbl.insertNewTr(ROW_DOC_NO);
        ctTbl.setTrArray(ROW_DOC_NO, copy);
    }

    /** 明细下面、注意事项上面插一行签字栏：两格并排，各跨 3 列。合并同样要在 set 之前做完。 */
    private static void insertSignRow(CTTbl ctTbl, int index, CTRow headTemplate) {
        CTRow copy = (CTRow) headTemplate.copy();
        mergeToTwoCells(copy);
        ctTbl.insertNewTr(index);
        ctTbl.setTrArray(index, copy);
    }

    /** 只留第一格、跨满整行、宽度改成整表宽。 */
    private static void mergeToSingleCell(CTRow row) {
        while (row.sizeOfTcArray() > 1) {
            row.removeTc(row.sizeOfTcArray() - 1);
        }
        setGridSpan(row.getTcArray(0), TABLE_COLS);
        setCellWidth(row.getTcArray(0), CONTENT_WIDTH_TWIPS);
    }

    /** 只留前两格，各跨一半、宽度各占一半。 */
    private static void mergeToTwoCells(CTRow row) {
        while (row.sizeOfTcArray() > 2) {
            row.removeTc(row.sizeOfTcArray() - 1);
        }
        int half = CONTENT_WIDTH_TWIPS / 2;
        for (int i = 0; i < 2; i++) {
            setGridSpan(row.getTcArray(i), TABLE_COLS / 2);
            setCellWidth(row.getTcArray(i), half);
        }
    }

    private static void setGridSpan(CTTc tc, int span) {
        CTTcPr pr = tc.getTcPr() != null ? tc.getTcPr() : tc.addNewTcPr();
        CTDecimalNumber gs = pr.getGridSpan() != null ? pr.getGridSpan() : pr.addNewGridSpan();
        gs.setVal(BigInteger.valueOf(span));
    }

    private static void setCellWidth(CTTc tc, int twips) {
        CTTcPr pr = tc.getTcPr() != null ? tc.getTcPr() : tc.addNewTcPr();
        if (pr.getTcW() != null) pr.getTcW().setW(BigInteger.valueOf(twips));
    }

    /**
     * 按 {@link #COL_WIDTHS} 重排列宽：表格网格 + 列头行 + 每个明细行三处都要写，
     * 表头行（三格各跨 2 列）取对应两列之和，免得与列宽错位。
     */
    private static void applyColumnWidths(XWPFTable t, int itemRows) {
        CTTblGrid grid = t.getCTTbl().getTblGrid();
        if (grid != null) {
            for (int i = 0; i < COL_WIDTHS.length && i < grid.sizeOfGridColArray(); i++) {
                grid.getGridColArray(i).setW(String.valueOf(COL_WIDTHS[i]));
            }
        }
        applyWidths(t, ROW_COL, COL_WIDTHS);
        for (int i = 0; i < itemRows; i++) {
            applyWidths(t, ROW_ITEM_FIRST + i, COL_WIDTHS);
        }
        applyWidths(t, ROW_HEAD, new int[]{
                COL_WIDTHS[0] + COL_WIDTHS[1],
                COL_WIDTHS[2] + COL_WIDTHS[3],
                COL_WIDTHS[4] + COL_WIDTHS[5]});
    }

    private static void applyWidths(XWPFTable t, int rowIndex, int[] widths) {
        if (rowIndex < 0 || rowIndex >= t.getRows().size()) return;
        List<XWPFTableCell> cells = t.getRow(rowIndex).getTableCells();
        for (int i = 0; i < widths.length && i < cells.size(); i++) {
            setCellWidth(cells.get(i).getCTTc(), widths[i]);
        }
    }

    /**
     * 字段居中（垂直居中；水平方向**填过值才居中，没填的空位靠左**）。
     *
     * <p>空位靠左是给手写留的：这一栏本来就要手填，居中会让人从格子中间往两边写，既别扭又浪费左半边
     * （用户 2026-09-22 提）。判据是「跟填入前的原文比有没有变」—— 只看「格子里有没有文字」不够，
     * 像「领用楼层：」这种标签在、值空着的格子会被误判成有值。
     *
     * <p>只处理**字段行**：最后那行「注意事项」是成段说明文字，保持左对齐。
     */
    private static void centerFields(XWPFTable t, List<List<String>> before) {
        List<XWPFTableRow> rows = t.getRows();
        for (int i = 0; i < rows.size() - 1; i++) {
            List<XWPFTableCell> cells = rows.get(i).getTableCells();
            for (int c = 0; c < cells.size(); c++) {
                XWPFTableCell cell = cells.get(c);
                boolean filled = hasPicture(cell) || !cellText(cell).equals(originalText(before, i, c));
                CTTc tc = cell.getCTTc();
                CTTcPr tcPr = tc.getTcPr() != null ? tc.getTcPr() : tc.addNewTcPr();
                CTVerticalJc vAlign = tcPr.getVAlign() != null ? tcPr.getVAlign() : tcPr.addNewVAlign();
                vAlign.setVal(STVerticalJc.CENTER);
                for (XWPFParagraph p : cell.getParagraphs()) {
                    CTPPr pPr = p.getCTP().isSetPPr() ? p.getCTP().getPPr() : p.getCTP().addNewPPr();
                    CTJc jc = pPr.getJc() != null ? pPr.getJc() : pPr.addNewJc();
                    jc.setVal(filled ? STJc.CENTER : STJc.LEFT);
                }
            }
        }
    }

    /** 填入前每格的文字快照（按行列存，行数是插入后的行数）。 */
    private static List<List<String>> snapshotCellTexts(XWPFTable t) {
        List<List<String>> out = new ArrayList<>();
        for (XWPFTableRow row : t.getRows()) {
            List<String> cells = new ArrayList<>();
            for (XWPFTableCell cell : row.getTableCells()) {
                cells.add(cellText(cell));
            }
            out.add(cells);
        }
        return out;
    }

    private static String cellText(XWPFTableCell cell) {
        StringBuilder sb = new StringBuilder();
        for (XWPFParagraph p : cell.getParagraphs()) {
            for (XWPFRun run : p.getRuns()) {
                if (run.text() != null) sb.append(run.text());
            }
        }
        return sb.toString().trim();
    }

    private static String originalText(List<List<String>> before, int row, int col) {
        if (before == null || row < 0 || row >= before.size()) return "";
        List<String> cells = before.get(row);
        return cells == null || col < 0 || col >= cells.size() ? "" : cells.get(col);
    }

    /** 格子里有没有图（电子签名是内联图，没有文字也算填过）。 */
    private static boolean hasPicture(XWPFTableCell cell) {
        for (XWPFParagraph p : cell.getParagraphs()) {
            for (XWPFRun run : p.getRuns()) {
                if (run.getCTR().sizeOfDrawingArray() > 0) return true;
            }
        }
        return false;
    }

    // ---------------------------------------------------------------- 页眉 logo

    /**
     * 往页眉左侧放院系 logo（模板的页眉是空的，所以每次渲染时插）。放在页眉里而不是正文首行：
     * 明细行多到翻页时，每页都会带上它 —— 与转移单一致。
     *
     * <p>纯门面：图缺失或读取失败就静默跳过，绝不让 logo 把整张单子搞挂。
     */
    private static void addHeaderLogo(XWPFDocument doc) {
        try (InputStream logo = SupplyClaimFormRenderer.class.getResourceAsStream(LOGO_PATH)) {
            if (logo == null) return;
            byte[] bytes = logo.readAllBytes();
            BufferedImage img = ImageIO.read(new ByteArrayInputStream(bytes));
            if (img == null || img.getWidth() <= 0 || img.getHeight() <= 0) return;
            List<XWPFHeader> headers = doc.getHeaderList();
            XWPFHeader header = headers.isEmpty() ? doc.createHeader(HeaderFooterType.DEFAULT) : headers.get(0);
            XWPFParagraph p = header.getParagraphs().isEmpty()
                    ? header.createParagraph() : header.getParagraphs().get(0);
            // 靠左贴齐正文左边缘：页眉段落吃到了样式的首行缩进（约 2 字符），不清就跟表格左边缘错开
            p.setAlignment(ParagraphAlignment.LEFT);
            p.setIndentationLeft(0);
            p.setIndentationFirstLine(0);
            int w = (int) Math.round(LOGO_W_PT);
            int h = Math.max(1, (int) Math.round(w * img.getHeight() / (double) img.getWidth()));
            XWPFRun run = p.createRun();
            try (InputStream in = new ByteArrayInputStream(bytes)) {
                run.addPicture(in, Document.PICTURE_TYPE_PNG, "logo", Units.toEMU(w), Units.toEMU(h));
            }
        } catch (Exception e) {
            // 页眉 logo 只是门面，缺了不影响单据可用性
        }
    }

    // ---------------------------------------------------------------- 回填

    /**
     * 全量回填。空/空白值一律不写，格子原样留着 —— 这张单子本来就是给人手填的。
     *
     * @param itemRows 明细渲染几行
     * @param signRow  签字行下标（= 明细首行 + 明细行数）
     */
    private static void fill(XWPFTable t, SupplyClaimFormInput in, int itemRows, int signRow) {
        setCellText(cellAt(t, ROW_DOC_NO, 0), DOC_NO_LABEL + nvl(in.getDocNo()));
        appendText(cellAt(t, ROW_HEAD, 0), in.getApplicantName());
        appendText(cellAt(t, ROW_HEAD, 1), in.getClaimFloor());
        appendText(cellAt(t, ROW_HEAD, 2), in.getFillDate());

        List<SupplyClaimFormInput.Row> rows = in.getRows();
        for (int i = 0; i < itemRows; i++) {
            SupplyClaimFormInput.Row row = i < rows.size() ? rows.get(i) : null;
            int r = ROW_ITEM_FIRST + i;
            // 多出来的行是「留着给人手写」的空行：整行留白，连出库日都不填
            if (row == null) continue;
            appendText(cellAt(t, r, 0), row.getName());
            appendText(cellAt(t, r, 1), row.getSpec());
            appendText(cellAt(t, r, 2), digits(row.getQty()));
            // 实际领用日期：整单一个出库日，每行都印同一个
            appendText(cellAt(t, r, 3), in.getIssueDate());
            appendText(cellAt(t, r, 4), digits(row.getFulfilledQty()));
            appendText(cellAt(t, r, 5), row.getRemark());
        }

        XWPFTableCell applicantCell = cellAt(t, signRow, 0);
        setCellText(applicantCell, APPLICANT_SIGN_LABEL);
        addSignature(applicantCell, in.getApplicantSignature());
        XWPFTableCell issuerCell = cellAt(t, signRow, 1);
        setCellText(issuerCell, ISSUER_SIGN_LABEL);
        addSignature(issuerCell, in.getIssuerSignature());
    }

    /**
     * 把格子里所有文字换成 text：只留第一支 run（保住模板字体），其余 run 删掉。
     *
     * <p>克隆出来的行带着原行的文字（签字行克隆自表头行，格子里写的是「领用人员：」），
     * 所以得整格换掉 —— 只 setText 会留下原文。
     */
    private static void setCellText(XWPFTableCell cell, String text) {
        if (cell == null) return;
        XWPFParagraph p = firstParagraph(cell);
        List<XWPFRun> runs = p.getRuns();
        if (runs.isEmpty()) {
            setRunText(p.createRun(), text);
            return;
        }
        setRunText(runs.get(0), text);
        for (int i = runs.size() - 1; i >= 1; i--) {
            p.removeRun(i);
        }
    }

    /** 把 value 追加到第一段末尾（新起一支 run）；空白值不写。 */
    private static void appendText(XWPFTableCell cell, String value) {
        if (cell == null || value == null || value.isBlank()) return;
        setRunText(firstParagraph(cell).createRun(), value);
    }

    /**
     * 整支替换 run 的文字。
     *
     * <p>{@code XWPFRun.setText} 是「写第 pos 个 w:t」的语义，多支 w:t 的 run 换不干净，
     * 所以先把多余的 w:t 删掉、只留一支再写值 —— 留下原本那支能保住模板的
     * {@code xml:space="preserve"}，rPr（字体/下划线）一概不碰。
     */
    private static void setRunText(XWPFRun run, String text) {
        CTR ctr = run.getCTR();
        while (ctr.sizeOfTArray() > 1) {
            ctr.removeT(ctr.sizeOfTArray() - 1);
        }
        CTText t = ctr.sizeOfTArray() == 0 ? ctr.addNewT() : ctr.getTArray(0);
        String safe = text == null ? "" : text;
        t.setStringValue(safe);
        if (!safe.isEmpty() && (Character.isWhitespace(safe.charAt(0))
                || Character.isWhitespace(safe.charAt(safe.length() - 1)))) {
            t.setSpace(SpaceAttribute.Space.PRESERVE);
        }
    }

    private static XWPFParagraph firstParagraph(XWPFTableCell cell) {
        return cell.getParagraphs().isEmpty() ? cell.addParagraph() : cell.getParagraphs().get(0);
    }

    private static XWPFTableCell cellAt(XWPFTable t, int rowIndex, int colIndex) {
        List<XWPFTableRow> rows = t.getRows();
        if (rowIndex < 0 || rowIndex >= rows.size()) return null;
        List<XWPFTableCell> cells = rows.get(rowIndex).getTableCells();
        if (colIndex < 0 || colIndex >= cells.size()) return null;
        return cells.get(colIndex);
    }

    private static String digits(Integer n) {
        return n == null ? null : String.valueOf(n);
    }

    private static String nvl(String s) {
        return s == null ? "" : s;
    }

    // ---------------------------------------------------------------- 签名

    /** 把电子签名图插到格子里（内联）。没签名、图坏了都只是留白，不让整张单子卡住。 */
    private static boolean addSignature(XWPFTableCell cell, String dataUrl) {
        if (cell == null) return false;
        byte[] bytes = decodeDataUrl(dataUrl);
        if (bytes == null) return false;
        BufferedImage trimmed;
        try {
            BufferedImage img = ImageIO.read(new ByteArrayInputStream(bytes));
            trimmed = img == null ? null : trimWhitespace(img);
        } catch (IOException e) {
            return false;
        }
        if (trimmed == null) return false;
        // 按比例缩到框内：签名是横向长条，给死宽高会拉变形。
        double scale = Math.min(SIGN_MAX_W_PT / trimmed.getWidth(), SIGN_MAX_H_PT / trimmed.getHeight());
        int w = Math.max(1, (int) Math.round(trimmed.getWidth() * scale));
        int h = Math.max(1, (int) Math.round(trimmed.getHeight() * scale));
        try {
            // 必须传**裁过之后**的字节：传原图而给裁剪后的宽高，等于把整张画布压进墨迹的框里。
            ByteArrayOutputStream png = new ByteArrayOutputStream();
            ImageIO.write(trimmed, "png", png);
            XWPFRun run = firstParagraph(cell).createRun();
            try (InputStream in = new ByteArrayInputStream(png.toByteArray())) {
                run.addPicture(in, Document.PICTURE_TYPE_PNG, "signature", Units.toEMU(w), Units.toEMU(h));
            }
        } catch (Exception e) {
            return false;
        }
        return true;
    }

    /** {@code data:image/png;base64,....} → 图片字节。不是 dataUrl、或 base64 坏了，返回 null。 */
    private static byte[] decodeDataUrl(String dataUrl) {
        if (dataUrl == null) return null;
        int comma = dataUrl.indexOf(',');
        if (comma < 0 || !dataUrl.substring(0, comma).contains("base64")) return null;
        try {
            return Base64.getDecoder().decode(dataUrl.substring(comma + 1).trim());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /**
     * 裁掉画布四周的白边，返回墨迹的包围盒（外扩 {@link #SIGN_PAD_PX} 像素留呼吸空间）。
     *
     * <p>签名画布是固定尺寸，真人笔下往往只占其中一角；不裁的话整块白底按比例一缩，
     * 签字就缩成一个小墨点。整张全白 = 没签，返回 null 让那一栏留白。
     */
    private static BufferedImage trimWhitespace(BufferedImage img) {
        int minX = img.getWidth(), minY = img.getHeight(), maxX = -1, maxY = -1;
        for (int y = 0; y < img.getHeight(); y++) {
            for (int x = 0; x < img.getWidth(); x++) {
                if (isInk(img.getRGB(x, y))) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX < minX || maxY < minY) return null;
        int x = Math.max(0, minX - SIGN_PAD_PX);
        int y = Math.max(0, minY - SIGN_PAD_PX);
        int w = Math.min(img.getWidth() - x, maxX - minX + 1 + SIGN_PAD_PX * 2);
        int h = Math.min(img.getHeight() - y, maxY - minY + 1 + SIGN_PAD_PX * 2);
        return img.getSubimage(x, y, w, h);
    }

    /** 笔迹的抗锯齿边缘不算白，阈值放宽一点，否则签名会被裁得缺边；透明像素一律不算墨。 */
    private static boolean isInk(int argb) {
        if ((argb >>> 24) < 0x80) return false;
        return ((argb >> 16) & 0xFF) < 200 || ((argb >> 8) & 0xFF) < 200 || (argb & 0xFF) < 200;
    }
}
