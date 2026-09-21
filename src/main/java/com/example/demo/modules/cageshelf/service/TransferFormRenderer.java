package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.adminfile.OfficeToPdfConverter;
import com.example.demo.modules.cageshelf.dto.TransferFormData;
import com.example.demo.modules.cageshelf.dto.TransferFormRenderInput;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.apache.xmlbeans.impl.xb.xmlschema.SpaceAttribute;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTP;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTPPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTR;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTRow;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTSpacing;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTbl;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTc;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTcPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTText;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTrPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STMerge;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 转移单渲染器。
 *
 * <p>模板是校方文件《实验动物转移预约单》（页脚版本 2.0，启用日期 2020-04-13），
 * 放在 {@code src/main/resources/templates/transfer-form.docx}。正文只有一张 9 行表，
 * 数据行是第 4 行（0 基），全表无 vMerge。模板改版时字段行号会移，必须重新核对。
 *
 * <p>渲染时会在表首**插一行「单号」**（模板里没有，克隆单位名称行而来），插入后表是 10 行、
 * 其上所有行号 +1 —— 本类里的 ROW_* 常量写的都是**插入后**的行号，别对着模板数。
 *
 * <p>本类的静态方法都是纯函数：不查库、不读文件，因此能脱离数据库单测。
 *
 * <p><b>回填只动 run，不动 cell。</b>模板每个填写位都自带 run（标签、下划线、符号分别成支），
 * 整格重写会把字体和间距冲掉 —— 那就是「布局变了」。行的增删在 CTTbl 层做，
 * 改完必须重新 {@code new XWPFTable(...)} 包一层，否则 XWPFTable 构造期缓存的行列表是旧的，
 * 写进去的值不会出现在产物里（这个坑不报错，只是静默不生效）。
 *
 * <p>各行的 run 编号是照着渲染出来的 PDF 一支支数出来的，模板一改就得重新数；
 * 数错了不会报错，只会写歪，所以验证必须落到「真的渲染一页出来看」。
 */
public final class TransferFormRenderer {

    /** 模板资源路径（classpath）。 */
    private static final String TEMPLATE_PATH = "/templates/transfer-form.docx";

    /** 模板正文中文字体；新建 run 不带 rPr，必须自己带上才不会串字体。 */
    private static final String FONT = "新宋体";

    /** 表格行号（0 基）。第 0 行「单号」是渲染时插进去的，模板里没有 —— 见 {@link #insertDocNoRow}。 */
    private static final int ROW_NO = 0;
    private static final int ROW_UNIT = 1;
    private static final int ROW_PI = 2;
    private static final int ROW_DATE = 3;
    private static final int ROW_DATA = 5;
    private static final int ROW_LOCATION = 6;
    private static final int ROW_SIGN = 7;
    private static final int ROW_VET = 9;

    /** 插单号行时克隆哪一行：模板的「申请方单位名称」行，同为整行 gridSpan=4，版式直接复用。 */
    private static final int ROW_NO_TEMPLATE = 0;
    private static final String DOC_NO_LABEL = "单号：";

    /** 数据行（ROW_DATA）里各逻辑列：0=品系 1=数量 2=转移方式。 */
    private static final int DATA_COL_STRAIN = 0;
    private static final int DATA_COL_COUNT = 1;
    private static final int DATA_COL_BOX = 2;

    /** 数量格里的 run 编号：0 = 模板的装饰下划线，1 = 「_ ♀ 」，2 = ♂ 前面那串下划线空格。 */
    private static final int COUNT_RUN_LEAD = 0;
    private static final int COUNT_RUN_FEMALE = 1;
    private static final int COUNT_RUN_MALE = 2;
    /** 包装盒格里那条带下划线的「_」run（模板已删掉方框，计数写在这条线上）。 */
    private static final int BOX_RUN = 1;
    /** 包装盒格里计数后面那支带下划线的空格 run —— 不清掉它会在计数右边多留一横。 */
    private static final int BOX_RUN_LINE_SPACES = 2;

    /** 复核意见格里三支复选框 run（同意 / 暂缓 / 不同意）与两支原因下划线 run。 */
    private static final int VET_RUN_BOX_AGREE = 1;
    private static final int VET_RUN_BOX_HOLD = 3;
    private static final int VET_RUN_BOX_REJECT = 5;
    private static final int VET_RUN_REASON_HOLD = 4;
    private static final int VET_RUN_REASON_REJECT = 6;
    private static final int VET_RUN_REVIEWER = 7;

    /**
     * Wingdings 2 的私用区字符：模板里的空框是 {@code U+F0A3}，打勾框是 {@code U+F052}。
     *
     * <p>打勾只换这一支 run 的字符，不碰字体属性 —— 换成别的字体，框就掉成看不见的方框。
     *
     * <p><b>别写成 {@code U+F0FE}</b>：那个码位是 **Wingdings(1)** 的勾选框，在 Wingdings 2 里
     * 是个圆点（LibreOffice 实测，见报告）。模板用的是 Wingdings 2，所以只认 F052。
     */
    private static final String BOX_TICK = "\uF052";

    private static final Pattern BLANK = Pattern.compile("_+");

    private TransferFormRenderer() {
    }

    /** 包装盒数 = 本次转移的笼位数。 */
    public static int boxCount(int targetCount) {
        return Math.max(0, targetCount);
    }

    /** 第 index 行的品系：人工值优先，没有则用自动值。 */
    public static String strainOf(TransferFormData data, int index, String autoStrain) {
        TransferFormData.Row row = rowAt(data, index);
        if (row != null && row.getStrain() != null && !row.getStrain().isBlank()) {
            return row.getStrain().trim();
        }
        return autoStrain;
    }

    /** 第 index 行的雌数：人工值优先，没有则用自动值。 */
    public static Integer femaleOf(TransferFormData data, int index, Integer autoFemale) {
        TransferFormData.Row row = rowAt(data, index);
        return row != null && row.getFemale() != null ? row.getFemale() : autoFemale;
    }

    /** 第 index 行的雄数：人工值优先，没有则用自动值。 */
    public static Integer maleOf(TransferFormData data, int index, Integer autoMale) {
        TransferFormData.Row row = rowAt(data, index);
        return row != null && row.getMale() != null ? row.getMale() : autoMale;
    }

    /** 三态复核意见 → 模板上的中文；没签或未知值返回 null（模板上留空）。 */
    public static String outcomeLabel(String decision) {
        if (CageOpSignature.DECISION_APPROVED.equals(decision)) return "同意";
        if (CageOpSignature.DECISION_HELD.equals(decision)) return "暂缓";
        if (CageOpSignature.DECISION_REJECTED.equals(decision)) return "不同意";
        return null;
    }

    // ---------------------------------------------------------------- 渲染

    /**
     * 渲染转移单 PDF 字节流。不查库：所有数据由调用方传入。
     *
     * <p>静态方法：本类是纯工具类（私有构造），调用方写
     * {@code TransferFormRenderer.renderToPdf(in, converter)}。
     *
     * @throws IllegalStateException 模板资源缺失时（说明没打进 jar）
     */
    public static byte[] renderToPdf(TransferFormRenderInput in, OfficeToPdfConverter converter) {
        if (in == null) throw new IllegalArgumentException("转移单渲染入参不能为空");
        byte[] docx;
        try (InputStream is = TransferFormRenderer.class.getResourceAsStream(TEMPLATE_PATH)) {
            if (is == null) {
                throw new IllegalStateException("转移单模板资源缺失：" + TEMPLATE_PATH + "（没打进 jar？）");
            }
            try (XWPFDocument doc = new XWPFDocument(is)) {
                if (doc.getTables().isEmpty()) {
                    throw new IllegalStateException("转移单模板里没有表格：" + TEMPLATE_PATH);
                }
                int n = in.getRows() == null ? 0 : in.getRows().size();
                CTTbl ctTbl = doc.getTables().get(0).getCTTbl();
                // 先插单号行：其后每一行都下移一格，expandDataRows 用的是位移后的 ROW_DATA
                insertDocNoRow(ctTbl);
                expandDataRows(ctTbl, ROW_DATA, n);
                // 重新包一层：XWPFTable 构造时把行缓存下来了，直接改 CTTbl 后
                // 旧包装器看不见新行，写进去的值不会出现在产物里。
                XWPFTable table = new XWPFTable(ctTbl, doc);
                fill(table, in, n);

                ByteArrayOutputStream out = new ByteArrayOutputStream();
                doc.write(out);
                docx = out.toByteArray();
            }
        } catch (IOException e) {
            throw new IllegalStateException("转移单模板读写失败：" + e.getMessage(), e);
        }
        try {
            return converter.convert(docx, "docx");
        } catch (IOException e) {
            throw new IllegalStateException("转移单转 PDF 失败：" + e.getMessage(), e);
        }
    }

    /**
     * 在表首插一行「单号」。克隆模板的**单位名称行**（同为整行 gridSpan=4 的合并格），
     * 版式不必另做；克隆下来的文字此刻还是「申请方单位名称：」，在 {@link #fill} 里换掉。
     *
     * <p>和插数据行同一个道理：必须在 CTTbl 层做完再 {@code new XWPFTable(...)}，
     * 否则包装器缓存的行列表还是旧的，写进去的值不生效（且不报错）。
     */
    private static void insertDocNoRow(CTTbl ctTbl) {
        CTRow copy = (CTRow) ctTbl.getTrArray(ROW_NO_TEMPLATE).copy();
        ctTbl.insertNewTr(ROW_NO_TEMPLATE);
        ctTbl.setTrArray(ROW_NO_TEMPLATE, copy);
    }

    /**
     * 把数据行克隆成 n 行（n&lt;=1 不克隆，模板那一行就是数据行）。
     *
     * <p>在 CTTbl 层做，模板全表无 vMerge 所以没有合并单元格要跟着复制。
     *
     * <p>整形（{@link #compactDataRow}）对**每一个** n 都做，包括 n=1：
     * <ol>
     *   <li>数据行是照一行数据设计的，品系格里有 7 个空段、行上还钉着 trHeight 43.7pt 的地板
     *       （纯撑高，109.7pt/行）；删掉这些空段并去掉地板，行高才落得下来。留着的话
     *       哪怕只填一行，表格最后的「复核人」也会被顶到第 2 页，而 3 行整形后反倒是一页 ——
     *       所以不整形没有理由，保持 1 行与 n 行同高才对得上。</li>
     *   <li>n&gt;1 时转移方式和包装盒数是整单一套值，不是每笼一个；把该列在数据行间纵向合并，
     *       只有第一行的内容可见（值也写在第一行）。数量、品系两列保持逐行。</li>
     * </ol>
     *
     * <p>n=0（全空单）没有数据行要整形，模板数据行原样留着。
     */
    private static void expandDataRows(CTTbl ctTbl, int dataRowIndex, int n) {
        if (n > 1) {
            CTRow template = ctTbl.getTrArray(dataRowIndex);
            for (int i = 1; i < n; i++) {
                CTRow copy = (CTRow) template.copy();
                ctTbl.insertNewTr(dataRowIndex + i);
                ctTbl.setTrArray(dataRowIndex + i, copy);
            }
        }
        for (int i = 0; i < n; i++) {
            compactDataRow(ctTbl.getTrArray(dataRowIndex + i));
        }
        if (n > 1) {
            vMergeBoxColumn(ctTbl, dataRowIndex, n);
        }
    }

    /**
     * 数据行的整形：每格删掉多余空段、清掉段后距，并清掉 trHeight 地板。
     *
     * <p>模板的行是照「一行数据」设计的：品系格塞了 7 个空段把行撑到 109.7pt，行上还钉着
     * 43.7pt 的 trHeight 地板（atLeast）。两样都是撑高的死重，每个 n 都得去掉 ——
     * 光删空段行高下不去，地板就有 131pt，3 行（以及整形前的 1 行）的注意事项照样被顶到第 2 页。
     * 各数据行删得一样多（每格只留带内容的那段），行高才会一致。
     */
    private static void compactDataRow(CTRow tr) {
        for (CTTc tc : tr.getTcArray()) {
            dropEmptyParagraphs(tc);
            zeroSpacingAfter(tc);
        }
        CTTrPr pr = tr.getTrPr();
        if (pr != null) {
            while (pr.sizeOfTrHeightArray() > 0) {
                pr.removeTrHeight(0);
            }
        }
    }

    /**
     * 清掉格内各段的段后距。
     *
     * <p>模板里有格的段只写了 {@code w:before} 没写 {@code w:after}（包装盒格就是），落在样式的
     * 默认 after 上 —— 一行数据白多出 ~16.5pt。它只在**单行**时把行高顶到 32.6pt：多行时那支格
     * 被 vMerge 吃进合并区，LibreOffice 不计它，行高才是正常的 16.1pt。所以不清就会出现
     * 「1 行比 n 行的每行高一倍」的不一致。
     */
    private static void zeroSpacingAfter(CTTc tc) {
        for (CTP p : tc.getPArray()) {
            CTPPr pPr = p.getPPr() != null ? p.getPPr() : p.addNewPPr();
            CTSpacing sp = pPr.getSpacing() != null ? pPr.getSpacing() : pPr.addNewSpacing();
            sp.setAfter(BigInteger.ZERO);
        }
    }

    /** 删掉格子里没有 run 的空段；至少留一段（品系格是空的，值靠这段回填）。 */
    private static void dropEmptyParagraphs(CTTc tc) {
        for (int i = tc.sizeOfPArray() - 1; i >= 0 && tc.sizeOfPArray() > 1; i--) {
            if (tc.getPArray(i).sizeOfRArray() == 0) {
                tc.removeP(i);
            }
        }
    }

    /** 「转移方式」列在 n 行数据行间纵向合并：首行 restart、其余 continue（模板原本没有 vMerge）。 */
    private static void vMergeBoxColumn(CTTbl ctTbl, int dataRowIndex, int n) {
        for (int i = 0; i < n; i++) {
            CTTc tc = ctTbl.getTrArray(dataRowIndex + i).getTcArray(DATA_COL_BOX);
            CTTcPr pr = tc.getTcPr() != null ? tc.getTcPr() : tc.addNewTcPr();
            if (i == 0) {
                pr.addNewVMerge().setVal(STMerge.RESTART);
            } else {
                pr.addNewVMerge();
            }
        }
    }

    /** 全量回填。空/空白值一律不写，模板原样留着。 */
    private static void fill(XWPFTable t, TransferFormRenderInput in, int n) {
        // 单号行是克隆来的，文字还是「申请方单位名称：」——整支换成「单号：<值>」。
        // 标签与值写在同一支 run 上，与模板「标签：值」一行的排法一致。
        setCellRun(cellAt(t, ROW_NO, 0), 0, DOC_NO_LABEL + (in.getDocNo() == null ? "" : in.getDocNo()));
        appendToRun(cellAt(t, ROW_UNIT, 0), 0, in.getUnitName());
        appendToRun(cellAt(t, ROW_PI, 0), 0, in.getPiName());
        appendToRun(cellAt(t, ROW_PI, 1), 1, in.getExperimenterName());
        appendToRun(cellAt(t, ROW_PI, 2), 0, in.getPhone());
        appendToRun(cellAt(t, ROW_DATE, 0), 0, in.getTransferDate());

        for (int i = 0; i < n; i++) {
            int r = ROW_DATA + i;
            TransferFormRenderInput.Row row = in.getRows().get(i);
            writeIntoBlank(cellAt(t, r, DATA_COL_STRAIN), row.getStrain());
            // 数量格：雌数填在 ♀ 前那支 run 的下划线上，雄数填在 ♂ 前那支空 run 上。
            // 数字写下去之后首支「_ _」那条装饰下划线就多余了（会读成「__3 ♀ 5♂」），清掉。
            XWPFTableCell count = cellAt(t, r, DATA_COL_COUNT);
            String female = digits(row.getFemale());
            String male = digits(row.getMale());
            if (female != null || male != null) {
                clearCellRun(count, COUNT_RUN_LEAD);
            }
            fillBlank(count, COUNT_RUN_FEMALE, female);
            fillBlank(count, COUNT_RUN_MALE, male);
        }
        // 包装盒数 = 笼位数，写在第一行数据行的「包装盒：_ 个」上：计数替换那支带下划线的「_」，
        // 数字就压在横线上；再清掉后面那支带下划线的空格 run —— 不清的话它会在计数右边多留一横。
        // 空格由计数那支自己补，读数才是「包装盒：1 个」（模板里的方框已删，不再有复选框）。
        if (n > 0) {
            XWPFTableCell box = cellAt(t, ROW_DATA, DATA_COL_BOX);
            setCellRun(box, BOX_RUN, boxCount(n) + " ");
            clearCellRun(box, BOX_RUN_LINE_SPACES);
        }

        // 数据行下面几行的下标随数据行数下移：插了 n-1 行，r5/r6/r8 各往后挪 n-1
        int shift = Math.max(0, n - 1);
        XWPFTableCell from = cellAt(t, ROW_LOCATION + shift, 0);
        appendToRun(from, 0, in.getFromLocation());
        appendToRun(from, 1, in.getOriginReviewerName());
        XWPFTableCell dest = cellAt(t, ROW_LOCATION + shift, 1);
        appendToRun(dest, 0, in.getToLocation());
        appendToRun(dest, 1, in.getDestReviewerName());

        appendToRun(cellAt(t, ROW_SIGN + shift, 0), 0, in.getPiName());
        appendToRun(cellAt(t, ROW_SIGN + shift, 1), 0, in.getExperimenterName());

        fillVetOutcome(cellAt(t, ROW_VET + shift, 0), in.getVetOutcome(), in.getVetReason(),
                in.getVetReviewerName());
    }

    /** 复核意见：打勾 + 把原因写在对应下划线上 + 补复核人姓名；未签则整块不动。 */
    private static void fillVetOutcome(XWPFTableCell cell, String outcome, String reason,
                                       String reviewerName) {
        if (cell != null && outcome != null && !outcome.isBlank()) {
            int boxRun;
            int reasonRun;
            if ("同意".equals(outcome)) {
                boxRun = VET_RUN_BOX_AGREE;
                reasonRun = -1;
            } else if ("暂缓".equals(outcome)) {
                boxRun = VET_RUN_BOX_HOLD;
                reasonRun = VET_RUN_REASON_HOLD;
            } else if ("不同意".equals(outcome)) {
                boxRun = VET_RUN_BOX_REJECT;
                reasonRun = VET_RUN_REASON_REJECT;
            } else {
                // 认不出的三态值：不打勾也不写原因，只补签字
                boxRun = -1;
                reasonRun = -1;
            }
            List<XWPFRun> runs = runsOf(cell);
            if (boxRun >= 0 && boxRun < runs.size()) {
                setRunText(runs.get(boxRun), BOX_TICK);
            }
            if (reasonRun >= 0 && reasonRun < runs.size() && reason != null && !reason.isBlank()) {
                replaceBlank(runs.get(reasonRun), reason);
            }
        }
        appendToRun(cell, VET_RUN_REVIEWER, reviewerName);
    }

    // ------------------------------------------------------------ run 级写入

    /** 单元格里所有段落的 run 按文档顺序拉平 —— 就是照着 PDF 数 run 时的编号。 */
    private static List<XWPFRun> runsOf(XWPFTableCell cell) {
        List<XWPFRun> out = new ArrayList<>();
        if (cell == null) return out;
        for (XWPFParagraph p : cell.getParagraphs()) {
            out.addAll(p.getRuns());
        }
        return out;
    }

    private static XWPFTableCell cellAt(XWPFTable t, int rowIndex, int colIndex) {
        List<XWPFTableRow> rows = t.getRows();
        if (rowIndex < 0 || rowIndex >= rows.size()) return null;
        List<XWPFTableCell> cells = rows.get(rowIndex).getTableCells();
        if (colIndex < 0 || colIndex >= cells.size()) return null;
        return cells.get(colIndex);
    }

    /**
     * 整支替换 run 的文字。
     *
     * <p>{@code XWPFRun.setText} 是「写第 pos 个 w:t」的语义，多支 w:t 的 run 换不干净，
     * 所以先把多余的 w:t 删掉、只留一支再写值 —— 留下原本那支能保住模板的
     * {@code xml:space="preserve"}（`_ ♀ ` 这类首尾带空格的 run 全靠它），
     * rPr（字体/下划线）一概不碰。
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

    /** 把 value 接到第 runIndex 支 run 的文字后面；空白值不写。 */
    private static void appendToRun(XWPFTableCell cell, int runIndex, String value) {
        XWPFRun run = runAt(cell, runIndex);
        if (run == null || value == null || value.isBlank()) return;
        setRunText(run, run.text() + value);
    }

    /** 清空第 runIndex 支 run 的文字（保留 run 本身，rPr 不动）。 */
    private static void clearCellRun(XWPFTableCell cell, int runIndex) {
        XWPFRun run = runAt(cell, runIndex);
        if (run != null) setRunText(run, "");
    }

    /** 整支替换第 runIndex 支 run；空白值不写。 */
    private static void setCellRun(XWPFTableCell cell, int runIndex, String value) {
        XWPFRun run = runAt(cell, runIndex);
        if (run == null || value == null || value.isBlank()) return;
        setRunText(run, value);
    }

    /** 把 value 填进第 runIndex 支 run 的下划线上；空白值不写。 */
    private static void fillBlank(XWPFTableCell cell, int runIndex, String value) {
        XWPFRun run = runAt(cell, runIndex);
        if (run == null || value == null || value.isBlank()) return;
        replaceBlank(run, value);
    }

    private static XWPFRun runAt(XWPFTableCell cell, int runIndex) {
        List<XWPFRun> runs = runsOf(cell);
        return runIndex >= 0 && runIndex < runs.size() ? runs.get(runIndex) : null;
    }

    /** 把 run 里第一串连续下划线换成 value；没有下划线就整支替换。 */
    private static void replaceBlank(XWPFRun run, String value) {
        String text = run.text();
        Matcher m = BLANK.matcher(text);
        if (m.find()) {
            setRunText(run, text.substring(0, m.start()) + value + text.substring(m.end()));
        } else {
            setRunText(run, value);
        }
    }

    /**
     * 往「空单元格」写：数据行的品系格是这个形状 —— 有段落（撑行高）但一支 run 都没有。
     * 有 run 就追加，没有就在第一段造一支（新 run 不带 rPr，字体得自己带上）。
     */
    private static void writeIntoBlank(XWPFTableCell cell, String value) {
        if (cell == null || value == null || value.isBlank()) return;
        if (!runsOf(cell).isEmpty()) {
            appendToRun(cell, 0, value);
            return;
        }
        XWPFParagraph p = cell.getParagraphs().isEmpty() ? cell.addParagraph() : cell.getParagraphs().get(0);
        XWPFRun run = p.createRun();
        run.setFontFamily(FONT);
        run.setText(value);
    }

    private static String digits(Integer n) {
        return n == null ? null : String.valueOf(n);
    }

    /** 取第 index 行的人工值；data / rows 为空、越界都返回 null（调用方各自退回自动值）。 */
    private static TransferFormData.Row rowAt(TransferFormData data, int index) {
        if (data == null || data.getRows() == null) return null;
        if (index < 0 || index >= data.getRows().size()) return null;
        return data.getRows().get(index);
    }
}
