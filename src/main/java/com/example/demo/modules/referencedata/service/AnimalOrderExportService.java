package com.example.demo.modules.referencedata.service;

import com.example.demo.common.excel.ExcelExportColumnAutosizer;
import com.example.demo.common.excel.SubtotalConfig;
import com.example.demo.common.excel.SubtotalPlanBuilder;
import com.example.demo.common.excel.SubtotalPlanBuilder.SubtotalEvent;
import com.example.demo.common.excel.SubtotalRowStyles;
import com.example.demo.common.excel.SubtotalSummary;
import com.example.demo.modules.referencedata.dto.RefOrderLineView;
import com.example.demo.modules.referencedata.dto.RefOrderView;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.util.WorkbookUtil;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
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
            String[] cols = {"单号", "课题组", "申领人", "物品", "数量", "状态", "提交时间"};
            org.apache.poi.ss.usermodel.Row head = sh.createRow(r++);
            for (int i = 0; i < cols.length; i++) head.createCell(i).setCellValue(cols[i]);

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
                    data.createCell(0).setCellValue("#" + d.order().getId());
                    data.createCell(1).setCellValue(d.group());
                    data.createCell(2).setCellValue(d.person());
                    data.createCell(3).setCellValue(d.item());
                    data.createCell(4).setCellValue(qty(d.line()));
                    data.createCell(5).setCellValue(statusLabel(d.order().getStatus()));
                    data.createCell(6).setCellValue(timeText(d.order()));
                    SubtotalRowStyles.apply(data, cols.length - 1, planStyles.get(i));
                    continue;
                }
                int labelCol = switch (e.level()) {
                    case 3 -> 3;
                    case 2 -> 2;
                    case 1 -> 1;
                    default -> 0;
                };
                data.createCell(labelCol).setCellValue(SubtotalPlanBuilder.label(e));
                data.createCell(4).setCellValue(e.net());
                SubtotalRowStyles.apply(data, cols.length - 1, planStyles.get(i));
                if (e.level() == 1) r++;   // 一级小计后空一行，隔开各板块
            }
            ExcelExportColumnAutosizer.autoSizeByContentWithHeaderFloorRow0(sh, 0, cols.length - 1);
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
}
