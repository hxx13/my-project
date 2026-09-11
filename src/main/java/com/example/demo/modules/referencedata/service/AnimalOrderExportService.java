package com.example.demo.modules.referencedata.service;

import com.example.demo.common.excel.ExcelExportColumnAutosizer;
import com.example.demo.common.excel.SubtotalConfig;
import com.example.demo.common.excel.SubtotalPlanBuilder;
import com.example.demo.common.excel.SubtotalPlanBuilder.SubtotalEvent;
import com.example.demo.common.excel.SubtotalRowStyles;
import com.example.demo.common.excel.SubtotalSummary;
import com.example.demo.modules.referencedata.dto.RefOrderLineView;
import com.example.demo.modules.referencedata.dto.RefOrderView;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.util.WorkbookUtil;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * 动物订购审核导出：按 课题组 → 申领人 → 物品 逐层插入小计（数量），末尾总计。
 * 小计算法复用 {@link SubtotalPlanBuilder}（与物资审计导出同一套）。
 */
@Service
public class AnimalOrderExportService {

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    /**
     * 列顺序与页面表格对齐（去掉「操作」）：订单级块 → 行级块 → 状态/提交时间。
     *
     * <p>「数量」列是小计的落点、前三列是小计标签的落点，所以这几个下标被下面的常量钉住；
     * 增删列时只改这份清单和常量，别在写单元格处散落魔法数字。
     */
    private static final String[] REVIEW_COLS = {
            "单号", "来源", "课题组", "负责人", "AUP", "校区", "总数", "总额", "整单备注",
            "物品 / 规格", "供应商", "雄数", "雌数", "数量", "小计",
            "领用人", "领用房间", "笼位", "到货日期", "行备注",
            "状态", "提交时间",
    };
    private static final int COL_NO = 0;
    private static final int COL_SOURCE = 1;
    private static final int COL_GROUP = 2;
    private static final int COL_PERSON = 3;
    private static final int COL_AUP = 4;
    private static final int COL_CAMPUS = 5;
    private static final int COL_TOTAL_QTY = 6;
    private static final int COL_TOTAL_AMT = 7;
    private static final int COL_ORDER_REMARK = 8;
    private static final int COL_ITEM = 9;
    private static final int COL_SUPPLIER = 10;
    private static final int COL_MALE = 11;
    private static final int COL_FEMALE = 12;
    private static final int COL_QTY = 13;
    private static final int COL_LINE_AMT = 14;
    private static final int COL_COLLECTOR = 15;
    private static final int COL_ROOM = 16;
    private static final int COL_CAGE = 17;
    private static final int COL_ARRIVAL = 18;
    private static final int COL_LINE_REMARK = 19;
    private static final int COL_STATUS = 20;
    private static final int COL_TIME = 21;

    private record Detail(RefOrderView order, RefOrderLineView line, String group, String person, String item) {
    }

    public byte[] buildReviewSheet(List<RefOrderView> orders) {
        return buildReviewSheet(orders, SubtotalConfig.all());
    }

    /**
     * 同上，但按 {@code config} 保留/排除部分小计层级与板块。
     */
    public byte[] buildReviewSheet(List<RefOrderView> orders, SubtotalConfig config) {
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sh = wb.createSheet(WorkbookUtil.createSafeSheetName("订购审核"));
            int r = 0;
            // 明细行本来就是行级的（一单展开成多行），列口径与页面表格保持一致，
            // 行级字段（供应商/雄雌/小计/领用人/房间/笼位/到货/行备注）逐行落列。
            org.apache.poi.ss.usermodel.Row head = sh.createRow(r++);
            for (int i = 0; i < REVIEW_COLS.length; i++) head.createCell(i).setCellValue(REVIEW_COLS[i]);

            List<Detail> rows = sortDetails(orders);
            List<SubtotalEvent> details = toDetails(rows);

            SubtotalRowStyles styles = SubtotalRowStyles.create(wb);
            List<SubtotalEvent> plan = SubtotalPlanBuilder.build(details, config);
            List<CellStyle> planStyles = styles.planStyles(plan);
            for (int i = 0; i < plan.size(); i++) {
                SubtotalEvent e = plan.get(i);
                org.apache.poi.ss.usermodel.Row data = sh.createRow(r++);
                if (e.isDetail()) {
                    Detail d = rows.get(e.rowIndex());
                    RefOrderView o = d.order();
                    RefOrderLineView ln = d.line();
                    data.createCell(COL_NO).setCellValue("#" + o.getId());
                    data.createCell(COL_SOURCE).setCellValue("ARO".equalsIgnoreCase(o.getSource()) ? "ARO" : "本地");
                    data.createCell(COL_GROUP).setCellValue(d.group());
                    data.createCell(COL_PERSON).setCellValue(d.person());
                    data.createCell(COL_AUP).setCellValue(safe(o.getRegisterNo()));
                    data.createCell(COL_CAMPUS).setCellValue(campusText(o));
                    data.createCell(COL_TOTAL_QTY).setCellValue(totalQty(o));
                    amountCell(data.createCell(COL_TOTAL_AMT), o.getTotalAmount());
                    data.createCell(COL_ORDER_REMARK).setCellValue(safe(o.getSubmitRemark()));
                    data.createCell(COL_ITEM).setCellValue(d.item());
                    data.createCell(COL_SUPPLIER).setCellValue(supplierText(ln));
                    data.createCell(COL_MALE).setCellValue(sexQty(ln, true));
                    data.createCell(COL_FEMALE).setCellValue(sexQty(ln, false));
                    data.createCell(COL_QTY).setCellValue(qty(ln));
                    amountCell(data.createCell(COL_LINE_AMT), ln == null ? null : ln.getLineAmount());
                    data.createCell(COL_COLLECTOR).setCellValue(safe(ln == null ? null : ln.getCollectorName()));
                    data.createCell(COL_ROOM).setCellValue(safe(ln == null ? null : ln.getPickupRoomName()));
                    data.createCell(COL_CAGE).setCellValue(safe(ln == null ? null : ln.getTargetCageLabel()));
                    data.createCell(COL_ARRIVAL).setCellValue(arrivalText(o, ln));
                    data.createCell(COL_LINE_REMARK).setCellValue(safe(ln == null ? null : ln.getLineRemark()));
                    data.createCell(COL_STATUS).setCellValue(statusLabel(o.getStatus()));
                    data.createCell(COL_TIME).setCellValue(timeText(o));
                    SubtotalRowStyles.apply(data, REVIEW_COLS.length - 1, planStyles.get(i));
                    continue;
                }
                int labelCol = switch (e.level()) {
                    case 3 -> COL_ITEM;
                    case 2 -> COL_PERSON;
                    case 1 -> COL_GROUP;
                    default -> COL_NO;
                };
                data.createCell(labelCol).setCellValue(SubtotalPlanBuilder.label(e));
                data.createCell(COL_QTY).setCellValue(e.net());
                SubtotalRowStyles.apply(data, REVIEW_COLS.length - 1, planStyles.get(i));
                if (e.level() == 1) r++;   // 一级小计后空一行，隔开各板块
            }
            ExcelExportColumnAutosizer.autoSizeByContentWithHeaderFloorRow0(sh, 0, REVIEW_COLS.length - 1);
            wb.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException("导出订购审核 Excel 失败: " + e.getMessage(), e);
        }
    }

    /**
     * 导出结构摘要：全量层级与板块（供勾选），不受 levels/excludeBlocks 影响。
     * 与导出共用 {@link #sortDetails}/{@link #toDetails}，保证摘要行数 == 成品行数。
     */
    public SubtotalSummary summarizeReview(List<RefOrderView> orders) {
        List<SubtotalEvent> details = toDetails(sortDetails(orders));
        return SubtotalPlanBuilder.summarize(SubtotalPlanBuilder.build(details, SubtotalConfig.all()));
    }

    /** 展开并排序明细行（排序规则导出与摘要共用）。 */
    private static List<Detail> sortDetails(List<RefOrderView> orders) {
        List<Detail> rows = new ArrayList<>();
        for (RefOrderView o : orders == null ? List.<RefOrderView>of() : orders) {
            String group = safe(o.getProjectGroupName());
            String person = safe(o.getSubmitterName());
            List<RefOrderLineView> lines = o.getLines() == null ? List.of() : o.getLines();
            for (RefOrderLineView line : lines) {
                rows.add(new Detail(o, line, group, person, itemLabel(line)));
            }
        }
        rows.sort(Comparator.comparing((Detail d) -> d.group())
                .thenComparing(d -> d.person())
                .thenComparing(d -> d.item())
                .thenComparing(d -> d.order().getCreatedAt(), Comparator.nullsLast(Comparator.reverseOrder())));
        return rows;
    }

    /** 排序后的明细行 → 小计事件（导出与摘要同源，不复制两份）。 */
    private static List<SubtotalEvent> toDetails(List<Detail> rows) {
        List<SubtotalEvent> details = new ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            Detail d = rows.get(i);
            details.add(SubtotalPlanBuilder.detail(i, d.group(), d.person(), d.item(), qty(d.line()), 0, 0));
        }
        return details;
    }

    private static long qty(RefOrderLineView line) {
        return line != null && line.getQuantity() != null ? line.getQuantity() : 0L;
    }

    /** 物品名：取层级链最末（叶子）的展示名，缺失时回退物品 id。 */
    private static String itemLabel(RefOrderLineView line) {
        if (line == null) return "";
        Object chain = line.getHierarchyChain();
        if (chain instanceof List<?> list) {
            for (Object o : list) {
                if (o instanceof Map<?, ?> m) {
                    Object name = m.get("displayName");
                    if (name != null && !String.valueOf(name).isBlank()) {
                        return String.valueOf(name).trim();
                    }
                }
            }
        }
        return line.getRefDataId() == null ? "" : "物品 #" + line.getRefDataId();
    }

    private static String statusLabel(String s) {
        if (s == null) return "";
        return switch (s) {
            case "PENDING" -> "待处理";
            case "APPROVED" -> "已批准";
            case "REJECTED" -> "已驳回";
            case "COMPLETED" -> "已完成";
            case "CANCELLED" -> "已取消";
            default -> s;
        };
    }

    private static String timeText(RefOrderView o) {
        LocalDateTime t = o.getCreatedAt() != null ? o.getCreatedAt() : o.getSubmittedAt();
        return t == null ? "" : TS.format(t);
    }

    private static String safe(String v) {
        return v != null ? v : "";
    }

    /** 订单总数量：各行数量之和（与页面表格的「总数」同口径）。 */
    private static long totalQty(RefOrderView o) {
        if (o == null || o.getLines() == null) return 0L;
        long n = 0;
        for (RefOrderLineView l : o.getLines()) n += qty(l);
        return n;
    }

    /** 金额列：无定价留空单元格，别写 0（0 会被当成「免费」，空才是「没定价」）。 */
    private static void amountCell(Cell cell, BigDecimal v) {
        if (v != null) cell.setCellValue(v.doubleValue());
    }

    /** 行级雄/雌数量：性别写在规格选项里（`{"option":"雌性 8-9W"}`），一行最多落一边。 */
    private static long sexQty(RefOrderLineView line, boolean male) {
        String sel = line == null ? null : line.getSpecSelections();
        if (sel == null) return 0L;
        boolean isMale = sel.contains("雄性");
        boolean isFemale = sel.contains("雌性");
        if (male ? !isMale : !isFemale) return 0L;
        return qty(line);
    }

    /** 供应商：优先导入的结构化列，本地自建行走层级链的 SUPPLIER 节点（与页面 lineNames 同规则）。 */
    private static String supplierText(RefOrderLineView line) {
        if (line == null) return "";
        String s = safe(line.getSupplierName()).trim();
        return !s.isEmpty() ? s : chainName(line, "SUPPLIER");
    }

    /** 到货日期：实际到货优先；本地单没有实际到货时回退订单的预计送达（页面也一样标注「预计」）。 */
    private static String arrivalText(RefOrderView o, RefOrderLineView line) {
        String a = line == null ? "" : safe(line.getArrivalDate()).trim();
        if (!a.isEmpty()) return a;
        LocalDate eta = o == null ? null : o.getEstimatedDeliveryDate();
        return eta == null ? "" : "预计 " + eta;
    }

    private static String campusText(RefOrderView o) {
        if (o == null) return "";
        String c = safe(o.getCampus()).trim();
        return !c.isEmpty() ? c : safe(o.getAroAreaName());
    }

    /** 层级链里某个 refType 节点的展示名（链是 Jackson 解析后的 List&lt;Map&gt;）。 */
    private static String chainName(RefOrderLineView line, String refType) {
        Object chain = line.getHierarchyChain();
        if (!(chain instanceof List<?> list)) return "";
        for (Object o : list) {
            if (o instanceof Map<?, ?> m && refType.equalsIgnoreCase(String.valueOf(m.get("refType")))) {
                Object name = m.get("displayName");
                if (name != null && !String.valueOf(name).isBlank()) return String.valueOf(name).trim();
            }
        }
        return "";
    }
}
