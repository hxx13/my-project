package com.example.demo.modules.referencedata.service;

import com.example.demo.common.excel.ExcelExportColumnAutosizer;
import com.example.demo.common.excel.SubtotalPlanBuilder;
import com.example.demo.common.excel.SubtotalPlanBuilder.SubtotalEvent;
import com.example.demo.modules.referencedata.dto.RefOrderLineView;
import com.example.demo.modules.referencedata.dto.RefOrderView;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
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
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sh = wb.createSheet(WorkbookUtil.createSafeSheetName("订购审核"));
            int r = 0;
            String[] cols = {"单号", "课题组", "申领人", "物品", "数量", "状态", "提交时间"};
            org.apache.poi.ss.usermodel.Row head = sh.createRow(r++);
            for (int i = 0; i < cols.length; i++) head.createCell(i).setCellValue(cols[i]);

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

            List<SubtotalEvent> details = new ArrayList<>();
            for (int i = 0; i < rows.size(); i++) {
                Detail d = rows.get(i);
                details.add(SubtotalPlanBuilder.detail(i, d.group(), d.person(), d.item(), qty(d.line()), 0, 0));
            }

            CellStyle bold = boldStyle(wb);
            for (SubtotalEvent e : SubtotalPlanBuilder.build(details)) {
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
                    continue;
                }
                int labelCol = switch (e.level()) {
                    case 3 -> 3;
                    case 2 -> 2;
                    case 1 -> 1;
                    default -> 0;
                };
                data.createCell(labelCol).setCellValue(SubtotalPlanBuilder.label(e));
                data.getCell(labelCol).setCellStyle(bold);
                data.createCell(4).setCellValue(e.net());
                data.getCell(4).setCellStyle(bold);
            }
            ExcelExportColumnAutosizer.autoSizeByContentWithHeaderFloorRow0(sh, 0, cols.length - 1);
            wb.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException("导出订购审核 Excel 失败: " + e.getMessage(), e);
        }
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

    private static CellStyle boldStyle(Workbook wb) {
        CellStyle style = wb.createCellStyle();
        Font f = wb.createFont();
        f.setBold(true);
        style.setFont(f);
        return style;
    }
}
