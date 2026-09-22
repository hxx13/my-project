package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.adminfile.OfficeToPdfConverter;
import com.example.demo.modules.cageshelf.dto.TransferFormData;
import com.example.demo.modules.cageshelf.dto.TransferFormRenderInput;
import org.apache.poi.util.Units;
import org.apache.poi.xwpf.usermodel.Document;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.apache.xmlbeans.impl.xb.xmlschema.SpaceAttribute;
import org.openxmlformats.schemas.drawingml.x2006.wordprocessingDrawing.CTAnchor;
import org.openxmlformats.schemas.drawingml.x2006.wordprocessingDrawing.CTInline;
import org.openxmlformats.schemas.drawingml.x2006.wordprocessingDrawing.CTPosH;
import org.openxmlformats.schemas.drawingml.x2006.wordprocessingDrawing.CTPosV;
import org.openxmlformats.schemas.drawingml.x2006.wordprocessingDrawing.STRelFromH;
import org.openxmlformats.schemas.drawingml.x2006.wordprocessingDrawing.STRelFromV;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTDrawing;
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
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 转移单渲染器。
 *
 * <p>模板是校方文件《实验动物转移预约单》（页脚版本 2.0，启用日期 2020-04-13），
 * 放在 {@code src/main/resources/templates/transfer-form.docx}。正文只有一张 9 行表，
 * 数据行是第 4 行（0 基），全表无 vMerge。模板改版时字段行号会移，必须重新核对。
 *
 * <p>渲染时会在模板里**插两行**：表首一行「单号」（克隆单位名称行），拟定转移日期下面一行
 * 「申请方提交实验动物转移单日期」（克隆日期行）。插入后表是 11 行、其上所有行号 +2 ——
 * 本类里的 ROW_* 常量写的都是**插入后**的行号，别对着模板数。
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

    /** 表格行号（0 基）。第 0 行「单号」与第 4 行「提交日期」都是渲染时插进去的，模板里没有。 */
    private static final int ROW_NO = 0;
    private static final int ROW_UNIT = 1;
    private static final int ROW_PI = 2;
    private static final int ROW_DATE = 3;
    /** 提交日期行：克隆日期行插在它下面（见 {@link #insertSubmitDateRow}）。 */
    private static final int ROW_SUBMIT = 4;
    private static final int ROW_DATA = 6;
    private static final int ROW_LOCATION = 7;
    private static final int ROW_SIGN = 8;
    private static final int ROW_VET = 10;

    /** 插单号行时克隆哪一行：模板的「申请方单位名称」行，同为整行 gridSpan=4，版式直接复用。 */
    private static final int ROW_NO_TEMPLATE = 0;
    private static final String DOC_NO_LABEL = "单号：";
    /** 提交日期行的标签（克隆来的那行原本写的是拟定转移日期，整支换掉）。 */
    private static final String SUBMIT_LABEL = "申请方提交实验动物转移单日期:";

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
        byte[] docx = renderToDocx(in);
        try {
            return converter.convert(docx, "docx");
        } catch (IOException e) {
            throw new IllegalStateException("转移单转 PDF 失败：" + e.getMessage(), e);
        }
    }

    /**
     * 只出 docx 字节、不转 PDF。转 PDF 要本机装 LibreOffice（每次冷启动 3.5s），
     * 所以单测走这条路 —— 填了哪些值、插没插签名图，解包 docx 就能查。
     */
    public static byte[] renderToDocx(TransferFormRenderInput in) {
        if (in == null) throw new IllegalArgumentException("转移单渲染入参不能为空");
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
                // 再插提交日期行：它在数据行**上面**，所以必须在 expandDataRows 之前插，
                // 否则数据行下标对不上（插完 ROW_DATA 也跟着下移一格）。
                insertSubmitDateRow(ctTbl);
                expandDataRows(ctTbl, ROW_DATA, n);
                // 重新包一层：XWPFTable 构造时把行缓存下来了，直接改 CTTbl 后
                // 旧包装器看不见新行，写进去的值不会出现在产物里。
                XWPFTable table = new XWPFTable(ctTbl, doc);
                fill(table, in, n);
                // 行前留白放在 fill **之后**：adaptVetSpacing 会把复核意见那格的 before 清零，
                // 先加就会被它抹掉。有余量才给，见 rowPadPt。
                applyRowPadding(table, rowPadPt(n, in.getFromLocation(), in.getToLocation()));

                ByteArrayOutputStream out = new ByteArrayOutputStream();
                doc.write(out);
                return out.toByteArray();
            }
        } catch (IOException e) {
            throw new IllegalStateException("转移单模板读写失败：" + e.getMessage(), e);
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
     * 在拟定转移日期行下面插一行「申请方提交实验动物转移单日期」。
     *
     * <p>克隆**拟定日期行**（同为整行 gridSpan=4 的单格），版式不必另做；克隆下来的文字此刻还是
     * 拟定日期的标签，在 {@link #fill} 里整支换掉。
     *
     * <p>必须在 {@link #expandDataRows} 之前插：插完它下面每一行都再下移一格，数据行也就从
     * 模板的第 4 行变成 {@link #ROW_DATA}。
     */
    private static void insertSubmitDateRow(CTTbl ctTbl) {
        CTRow copy = (CTRow) ctTbl.getTrArray(ROW_DATE).copy();
        ctTbl.insertNewTr(ROW_SUBMIT);
        ctTbl.setTrArray(ROW_SUBMIT, copy);
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
        if (tc == null) return;
        for (CTP p : tc.getPArray()) {
            CTPPr pPr = p.getPPr() != null ? p.getPPr() : p.addNewPPr();
            CTSpacing sp = pPr.getSpacing() != null ? pPr.getSpacing() : pPr.addNewSpacing();
            sp.setAfter(BigInteger.ZERO);
        }
    }

    private static void zeroSpacingAfter(XWPFTableCell cell) {
        if (cell != null) zeroSpacingAfter(cell.getCTTc());
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
        // 拟定日期与提交日期挨着，两行都清段后距才像一对紧挨的字段；不清各白空一行
        // （模板的段落只写了 before，after 落在样式默认值上）。
        zeroSpacingAfter(cellAt(t, ROW_DATE, 0));
        zeroSpacingAfter(cellAt(t, ROW_SUBMIT, 0));
        appendToRun(cellAt(t, ROW_DATE, 0), 0, in.getTransferDate());
        // 提交日期行是克隆日期行来的，文字仍是拟定日期的标签 —— 整支换成「提交日期:<值>」。
        // 值取不到就只留标签（setCellRun 只拒整串空白，标签本身不是空白）。
        setCellRun(cellAt(t, ROW_SUBMIT, 0), 0,
                SUBMIT_LABEL + (in.getSubmitDate() == null ? "" : in.getSubmitDate()));

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
        XWPFTableCell dest = cellAt(t, ROW_LOCATION + shift, 1);
        // 段后距清零：模板这两格只写了 before 没写 after，落在样式的默认 after 上，段落边界
        // 白吃 ~16.5pt —— 地点那格是多笼位换行 + 签字两段，不清就会在地点与签字行之间空一整行。
        zeroSpacingAfter(from);
        zeroSpacingAfter(dest);
        // 「实验动物转出地点：」自己占一行，值从下一行起。接在标题后面的话，第一项会被标题挤掉
        // 大半格宽、被迫断行，看着比换行更乱（用户 2026-09-22 定）。
        appendLocation(from, 0, in.getFromLocation());
        fillSignatureOrName(from, 1, in.getOriginReviewerName(), in.getOriginReviewerSignature());
        appendLocation(dest, 0, in.getToLocation());
        fillSignatureOrName(dest, 1, in.getDestReviewerName(), in.getDestReviewerSignature());

        // 「负责人（PI签字）」那格没有账号（值只是笼位表单里填的名字串），永远只有姓名文字。
        appendToRun(cellAt(t, ROW_SIGN + shift, 0), 0, in.getPiName());
        fillSignatureOrName(cellAt(t, ROW_SIGN + shift, 1), 0,
                in.getExperimenterName(), in.getExperimenterSignature());

        fillVetOutcome(cellAt(t, ROW_VET + shift, 0), in.getVetOutcome(), in.getVetReason(),
                in.getVetReviewerName(), in.getVetReviewerSignature());
        adaptVetSpacing(cellAt(t, ROW_VET + shift, 0), n, in.getFromLocation(), in.getToLocation());
    }

    /**
     * 复核意见块「同意 / 暂缓 / 不同意」之间的段间距，按本次笼位数自适应。
     *
     * <p>这几处空档是模板用来**占满一页**的（顺带给兽医留写原因的地方），但模板给的是死值：
     * 笼位少时整张表缩在页面上半截，笼位多时直接顶到第 2 页。这里反算 —— 先算「段间距全清掉」
     * 时这张表会停在哪，再把到页底的距离平分给 4 处段间距。于是 1~5 笼位都落在同一条底边上，
     * 笼位再多就自然顶到第 2 页（那时本来也放不下）。
     */
    private static void adaptVetSpacing(XWPFTableCell cell, int cageCount,
                                        String fromLocation, String toLocation) {
        if (cell == null) return;
        int gap = vetGapPt(cageCount, fromLocation, toLocation);
        List<XWPFParagraph> ps = cell.getParagraphs();
        // 最后一段是「复核人（签字）」，它后面不留间距；模板自带的段后距也别动，那已算进标定量里。
        for (int i = 0; i < ps.size() - 1; i++) {
            CTP ctp = ps.get(i).getCTP();
            CTPPr pPr = ctp.isSetPPr() ? ctp.getPPr() : ctp.addNewPPr();
            CTSpacing sp = pPr.isSetSpacing() ? pPr.getSpacing() : pPr.addNewSpacing();
            sp.setBefore(BigInteger.ZERO);
            sp.setAfter(BigInteger.valueOf(gap * 20L));   // w:spacing 的单位是二十分之一磅
        }
    }

    /**
     * 三个标定量都是**照着渲染出来的 PDF 量出来的**，字体或模板一改就得重量（量法：
     * 渲染 n=1..5 的单子，取每张正文最后一行的 y）。
     *
     * <p>{@link #PAGE_TARGET_PT} 内容底边想落到的位置。取 686 而不是贴着页脚：地点名长的时候
     * 会多折行，每多一行整张表往下 {@link #LINE_PT}；留出约两行余量才不会偶发顶到第 2 页。
     * {@link #NATURAL_BOTTOM_PT} 1 个笼位、地点各占一行、且把 4 处段间距全清空时的底边
     * （2026-09-22 插入「提交日期」行后重量的，那次净增高约 13pt）；
     * {@link #PER_CAGE_PT} 每多一个笼位往下推多少（数据行 + 地点行各一行）。
     */
    private static final double PAGE_TARGET_PT = 686;
    private static final double NATURAL_BOTTOM_PT = 580;
    private static final double PER_CAGE_PT = 31.7;
    /** 一行正文的高度（pt）。 */
    private static final double LINE_PT = 15.6;
    /** 复核意见块里的段间距处数（5 段之间 4 处）。 */
    private static final int VET_GAP_COUNT = 4;
    /** 单处段间距的上限（pt）——再多字就要被推开了，1 个笼位时也用不到这么宽。 */
    private static final int VET_GAP_MAX_PT = 40;
    /**
     * 每行上方留的空（pt）。模板 {@code w:tblCellMar} 的 top/bottom 是 0，正文紧贴表格横线，
     * 行与行之间看着挤（用户 2026-09-22 要求「适当留一点间距」）。
     *
     * <p>走**段落的 {@code w:before}** 而不是表格单元格边距：{@code tblCellMar} 的 top/bottom
     * 在 LibreOffice 里几乎不生效（实测 11 行上下各设 2pt 只长了约 3pt，而不是 44pt），
     * 而段前距一定吃行高。加在模板已有值**之上**，原有留白不会被冲掉。
     */
    private static final int ROW_PAD_MAX_PT = 2;

    static int vetGapPt(int cageCount, String fromLocation, String toLocation) {
        double natural = baseBottom(cageCount, fromLocation, toLocation)
                + rowPadTotalPt(cageCount, fromLocation, toLocation);
        double fill = (PAGE_TARGET_PT - natural) / VET_GAP_COUNT;
        return (int) Math.max(0, Math.min(VET_GAP_MAX_PT, fill));
    }

    /** 不留任何行内空、也不留段间距时，这张表正文的底边。 */
    private static double baseBottom(int cageCount, String fromLocation, String toLocation) {
        return NATURAL_BOTTOM_PT + (Math.max(1, cageCount) - 1) * PER_CAGE_PT
                + extraLocationLines(cageCount, fromLocation, toLocation) * LINE_PT;
    }

    /** 表格行数：模板 9 行 + 渲染时插的 2 行（单号、提交日期）+ 多出来的数据行。 */
    static int tableRows(int cageCount) {
        return 11 + (Math.max(1, cageCount) - 1);
    }

    /**
     * 每个格子里第一段之前留的空（pt，单侧）。**有余量才给**：拿「到目标底边还剩多少」摊到每一行，
     * 笼位多到本来就要两页时收到 0 —— 不为了好看把单子顶到第 2 页。
     */
    static int rowPadPt(int cageCount, String fromLocation, String toLocation) {
        double slack = PAGE_TARGET_PT - baseBottom(cageCount, fromLocation, toLocation);
        if (slack <= 0) return 0;
        return (int) Math.min(ROW_PAD_MAX_PT, slack / tableRows(cageCount));
    }

    /** 行前留白吃掉的总高度。 */
    private static double rowPadTotalPt(int cageCount, String fromLocation, String toLocation) {
        return rowPadPt(cageCount, fromLocation, toLocation) * (double) tableRows(cageCount);
    }

    /**
     * 给每一行的**每个格子的第一段**加段前距 —— 行高取格子里最高的那格，所以一行就长这么多。
     * 加在已有值之上：模板里 {@code ROW_SIGN} 那行本来就有 8.4pt 的段前距，不能被冲掉。
     */
    private static void applyRowPadding(XWPFTable t, int padPt) {
        if (t == null || padPt <= 0) return;
        BigInteger tw = BigInteger.valueOf(padPt * 20L);   // w:spacing 的单位是二十分之一磅
        for (XWPFTableRow row : t.getRows()) {
            for (XWPFTableCell cell : row.getTableCells()) {
                List<XWPFParagraph> ps = cell.getParagraphs();
                if (ps.isEmpty()) continue;
                CTP ctp = ps.get(0).getCTP();
                CTPPr pPr = ctp.isSetPPr() ? ctp.getPPr() : ctp.addNewPPr();
                CTSpacing sp = pPr.isSetSpacing() ? pPr.getSpacing() : pPr.addNewSpacing();
                sp.setBefore(existingBefore(sp).add(tw));
            }
        }
    }

    /** 读现有的 {@code w:before}（XMLBeans 给的是 union，取回来是 Object，按文本解析）。 */
    private static BigInteger existingBefore(CTSpacing sp) {
        if (!sp.isSetBefore()) return BigInteger.ZERO;
        try {
            return new BigInteger(String.valueOf(sp.getBefore()).trim());
        } catch (NumberFormatException e) {
            return BigInteger.ZERO;
        }
    }

    /** 地点格的内宽（pt）——模板 tcW 4168 二十分之一磅。 */
    private static final double LOC_WIDTH_PT = 208;
    /** 正文全角 / 半角字符的宽度（pt）。按字宽估折行，比数字符准得多（同一格里英文数字只占半宽）。 */
    private static final double LOC_FULL_PT = 10.5;
    private static final double LOC_HALF_PT = 5.25;

    /**
     * 地点格比「一个笼位一行」多占了几个折行 —— 地点名长的时候每项都会折成两行，
     * 那部分高度是表格自己长的，段间距再怎么算也补不回来，只能先把余量扣掉。
     */
    private static int extraLocationLines(int cageCount, String fromLocation, String toLocation) {
        int onePerCage = Math.max(1, cageCount);
        return Math.max(0, wrappedLines(fromLocation) - onePerCage)
                + Math.max(0, wrappedLines(toLocation) - onePerCage);
    }

    /** 地点串折行后占几行：按 {@code \n} 分段，每段再按字宽除以格宽向上取整。 */
    private static int wrappedLines(String location) {
        if (location == null || location.isBlank()) return 0;
        int lines = 0;
        for (String part : location.split("\n")) {
            lines += Math.max(1, (int) Math.ceil(textWidthPt(part) / LOC_WIDTH_PT));
        }
        return lines;
    }

    /** 全角（中日韩标点也算）按 {@link #LOC_FULL_PT}，其余按半宽计。 */
    private static double textWidthPt(String text) {
        double width = 0;
        for (int i = 0; i < text.length(); i++) {
            width += text.charAt(i) >= 0x2E80 ? LOC_FULL_PT : LOC_HALF_PT;
        }
        return width;
    }

    /** 复核意见：打勾 + 把原因写在对应下划线上 + 补复核人签字；未签则整块不动。 */
    private static void fillVetOutcome(XWPFTableCell cell, String outcome, String reason,
                                       String reviewerName, String reviewerSignature) {
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
        fillSignatureOrName(cell, VET_RUN_REVIEWER, reviewerName, reviewerSignature);
    }

    // ------------------------------------------------------------ 电子签名

    /**
     * 签位落地规则：**有电子签名就打签名图（纯图，旁边不再印姓名），没有就退回姓名文字。**
     *
     * <p>签名是自愿提交的、不是人人都有，所以「没有」是常态而不是异常 —— 退回姓名文字即可，
     * 单据不会因此开天窗。图坏了（dataUrl 解不开、不是图）也走同一条退路，不让一张坏图把整单卡死。
     */
    private static void fillSignatureOrName(XWPFTableCell cell, int runIndex, String name,
                                            String signatureDataUrl) {
        if (cell == null) return;
        if (addPictureToRun(cell, runIndex, signatureDataUrl)) return;
        appendToRun(cell, runIndex, name);
    }

    /** 签名图的最大边长（pt）—— 浮动图不占行高，所以能比签位那一行本身大。 */
    private static final double SIGN_MAX_W_PT = 64;
    private static final double SIGN_MAX_H_PT = 22;
    /** 锚定以「行」为纵向参照，再往上抬这么多 pt，签名才压在签字线上而不是悬在字顶。 */
    private static final double SIGN_LIFT_PT = 4;
    /** 裁白边时四周留的呼吸空间（像素）；贴边裁出来像被切了一刀。 */
    private static final int SIGN_PAD_PX = 6;

    /** 把签名图插到第 runIndex 支 run 上。返回 false = 没插（调用方退回姓名文字）。 */
    private static boolean addPictureToRun(XWPFTableCell cell, int runIndex, String dataUrl) {
        XWPFRun run = runAt(cell, runIndex);
        if (run == null) return false;
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
            try (InputStream in = new ByteArrayInputStream(png.toByteArray())) {
                run.addPicture(in, Document.PICTURE_TYPE_PNG, "signature", Units.toEMU(w), Units.toEMU(h));
            }
            floatThePicture(run);
        } catch (Exception e) {
            return false;
        }
        return true;
    }

    /**
     * 把 POI 生成的**内联**图改成**浮动锚定**图 —— 这是签名放得下的关键。
     *
     * <p>内联图要占一行：只要比那一行高，整行就被撑高。实测每多一个内联签位，整张表往下顶
     * 15.6pt，四个签位足以把「复核人（签字）」挤到第 2 页去。锚定图不参与排版，签位那一行的
     * 高度纹丝不动，于是签名才能放到比行高更大、看着像真的签名（量法见
     * {@code TransferFormSignatureTest} 旁边的渲染实测）。
     *
     * <p>横向落在**锚点所在的字符位置**（就是标签之后），不必去量标签有多宽；纵向按「行」对齐，
     * 再抬 {@link #SIGN_LIFT_PT}。压在文字下面（behindDoc）—— 签名盖住签字线可以，盖住标签不行。
     */
    private static void floatThePicture(XWPFRun run) {
        CTR ctr = run.getCTR();
        if (ctr.sizeOfDrawingArray() == 0) return;
        CTDrawing drawing = ctr.getDrawingArray(ctr.sizeOfDrawingArray() - 1);
        if (drawing.sizeOfInlineArray() == 0) return;
        CTInline inline = drawing.getInlineArray(0);

        CTAnchor anchor = drawing.addNewAnchor();
        anchor.setSimplePos2(false);
        anchor.addNewSimplePos();
        anchor.setRelativeHeight(2);
        anchor.setBehindDoc(true);
        anchor.setLocked(false);
        anchor.setLayoutInCell(true);
        anchor.setAllowOverlap(true);
        CTPosH posH = anchor.addNewPositionH();
        posH.setRelativeFrom(STRelFromH.CHARACTER);
        posH.setPosOffset(0);
        CTPosV posV = anchor.addNewPositionV();
        posV.setRelativeFrom(STRelFromV.LINE);
        posV.setPosOffset(-Units.toEMU(SIGN_LIFT_PT));
        anchor.setExtent(inline.getExtent());
        anchor.addNewWrapNone();
        anchor.setDocPr(inline.getDocPr());
        anchor.setGraphic(inline.getGraphic());
        drawing.removeInline(0);
    }

    /**
     * 裁掉画布四周的白边，返回墨迹的包围盒（外扩 {@link #SIGN_PAD_PX} 像素留呼吸空间）。
     *
     * <p>前端给的画布是固定 800×300，真人笔下往往只占其中一角；不裁的话整块白底按比例一缩，
     * 签字就缩成一个小墨点，还浮在签名线上方。整张全白 = 没签，返回 null 让调用方退回姓名文字。
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
     * 整支替换 run 的文字；{@code \n} 落成真正的换行（{@code <w:br/>}）。
     *
     * <p>{@code XWPFRun.setText} 是「写第 pos 个 w:t」的语义，多支 w:t 的 run 换不干净，
     * 所以先把多余的 w:t 删掉、只留一支再写值 —— 留下原本那支能保住模板的
     * {@code xml:space="preserve"}（`_ ♀ ` 这类首尾带空格的 run 全靠它），
     * rPr（字体/下划线）一概不碰。
     *
     * <p><b>{@code \n} 必须换成 {@code <w:br/>}</b>：塞进 {@code w:t} 里的换行符 Word/LibreOffice
     * 只当普通空白，多笼位的地点串会挤成一坨（用户 2026-09-22 报「没换行、中间空格太多」）。
     */
    private static void setRunText(XWPFRun run, String text) {
        CTR ctr = run.getCTR();
        for (int i = ctr.sizeOfBrArray() - 1; i >= 0; i--) {
            ctr.removeBr(i);
        }
        while (ctr.sizeOfTArray() > 1) {
            ctr.removeT(ctr.sizeOfTArray() - 1);
        }
        String[] parts = (text == null ? "" : text).split("\n", -1);
        CTText first = ctr.sizeOfTArray() == 0 ? ctr.addNewT() : ctr.getTArray(0);
        setText(first, parts[0]);
        for (int i = 1; i < parts.length; i++) {
            ctr.addNewBr();
            setText(ctr.addNewT(), parts[i]);
        }
    }

    /** 写一支 {@code w:t}；首尾带空格要补 {@code xml:space="preserve"}，否则会被吞掉。 */
    private static void setText(CTText t, String value) {
        t.setStringValue(value);
        if (!value.isEmpty() && (Character.isWhitespace(value.charAt(0))
                || Character.isWhitespace(value.charAt(value.length() - 1)))) {
            t.setSpace(SpaceAttribute.Space.PRESERVE);
        }
    }

    /**
     * 写地点格：标题自己占一行、值从下一行起。
     *
     * <p>先判空再拼 {@code \n} —— {@code "\n" + null} 在 Java 里会拼成 {@code "\nnull"}，
     * 既不 blank 也判不出空，单子上就真的印出「null」（测试抓到的）。地点解析不到时整格不动。
     */
    private static void appendLocation(XWPFTableCell cell, int runIndex, String value) {
        if (value == null || value.isBlank()) return;
        appendToRun(cell, runIndex, "\n" + value);
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
