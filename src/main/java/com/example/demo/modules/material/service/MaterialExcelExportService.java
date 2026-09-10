package com.example.demo.modules.material.service;

import com.example.demo.common.excel.ExcelExportColumnAutosizer;
import com.example.demo.common.excel.SubtotalConfig;
import com.example.demo.common.excel.SubtotalPlanBuilder;
import com.example.demo.common.excel.SubtotalPlanBuilder.SubtotalEvent;
import com.example.demo.common.excel.SubtotalRowStyles;
import com.example.demo.common.excel.SubtotalSummary;
import com.example.demo.modules.material.dto.MaterialAuditGridRow;
import com.example.demo.modules.material.dto.MaterialAuditTrailView;
import com.example.demo.modules.material.dto.MaterialItemFlowExportRow;
import com.example.demo.modules.material.dto.MaterialRequestView;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.util.WorkbookUtil;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.function.Function;

@Service
public class MaterialExcelExportService {

    /**
     * 申领审计导出页表格（列顺序与 Web 预览一致）。
     * 按 课题组 → 申领人 → 物品 排序并逐层插入小计，末尾总计。
     */
    public byte[] buildAuditGridSheet(List<MaterialAuditGridRow> rows) {
        return buildAuditGridSheet(rows, SubtotalConfig.all());
    }

    /**
     * 同上，但按 {@code config} 保留/排除部分小计层级与板块。
     */
    public byte[] buildAuditGridSheet(List<MaterialAuditGridRow> rows, SubtotalConfig config) {
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sh = wb.createSheet(WorkbookUtil.createSafeSheetName("申领审计"));
            int r = 0;
            Row head = sh.createRow(r++);
            String[] cols = { "单号", "物品", "数量", "状态", "申领人", "课题组", "时间" };
            for (int i = 0; i < cols.length; i++) head.createCell(i).setCellValue(cols[i]);

            List<MaterialAuditGridRow> sorted = sortAuditRows(rows);
            List<SubtotalEvent> details = toAuditDetails(sorted);

            SubtotalRowStyles styles = SubtotalRowStyles.create(wb);
            List<SubtotalEvent> plan = SubtotalPlanBuilder.build(details, config);
            List<CellStyle> planStyles = styles.planStyles(plan);
            for (int i = 0; i < plan.size(); i++) {
                SubtotalEvent e = plan.get(i);
                Row data = sh.createRow(r++);
                if (e.isDetail()) {
                    MaterialAuditGridRow row = sorted.get(e.rowIndex());
                    data.createCell(0).setCellValue(safe(row.getRequestId()));
                    data.createCell(1).setCellValue(safe(row.getItemName()));
                    data.createCell(2).setCellValue(safe(row.getQty()));
                    data.createCell(3).setCellValue(safe(row.getStatus()));
                    data.createCell(4).setCellValue(safe(row.getApplicantName()));
                    data.createCell(5).setCellValue(safe(row.getApplicantGroup()));
                    data.createCell(6).setCellValue(safe(row.getTime()));
                    SubtotalRowStyles.apply(data, cols.length - 1, planStyles.get(i));
                    continue;
                }
                int labelCol = switch (e.level()) {
                    case 3 -> 1;
                    case 2 -> 4;
                    case 1 -> 5;
                    default -> 0;
                };
                data.createCell(labelCol).setCellValue(SubtotalPlanBuilder.label(e));
                if (e.level() == 3) {
                    data.createCell(4).setCellValue(safe(e.lv2()));
                    data.createCell(5).setCellValue(safe(e.lv1()));
                } else if (e.level() == 2) {
                    data.createCell(5).setCellValue(safe(e.lv1()));
                }
                data.createCell(2).setCellValue(e.net());
                SubtotalRowStyles.apply(data, cols.length - 1, planStyles.get(i));
                if (e.level() == 1) r++;   // 一级小计后空一行，隔开各板块
            }
            ExcelExportColumnAutosizer.autoSizeByContentWithHeaderFloorRow0(sh, 0, cols.length - 1);
            wb.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException("导出申领审计表格 Excel 失败: " + e.getMessage(), e);
        }
    }

    /**
     * 审计导出结构摘要：全量层级与板块（供勾选），不受配置影响。
     * 与导出共用 {@link #sortAuditRows}/{@link #toAuditDetails}，保证摘要行数 == 成品行数。
     */
    public SubtotalSummary summarizeAuditGrid(List<MaterialAuditGridRow> rows) {
        List<SubtotalEvent> details = toAuditDetails(sortAuditRows(rows));
        return SubtotalPlanBuilder.summarize(SubtotalPlanBuilder.build(details, SubtotalConfig.all()));
    }

    /** 审计明细排序（排序规则导出与摘要共用）。 */
    private static List<MaterialAuditGridRow> sortAuditRows(List<MaterialAuditGridRow> rows) {
        List<MaterialAuditGridRow> sorted = new ArrayList<>(rows == null ? List.of() : rows);
        sorted.sort(Comparator
                .comparing((MaterialAuditGridRow x) -> safe(x.getApplicantGroup()))
                .thenComparing(x -> safe(x.getApplicantName()))
                .thenComparing(x -> safe(x.getItemName()))
                .thenComparing(x -> safe(x.getTime()), Comparator.reverseOrder()));
        return sorted;
    }

    /** 排序后的审计明细行 → 小计事件（导出与摘要同源，不复制两份）。 */
    private static List<SubtotalEvent> toAuditDetails(List<MaterialAuditGridRow> sorted) {
        List<SubtotalEvent> details = new ArrayList<>();
        for (int i = 0; i < sorted.size(); i++) {
            MaterialAuditGridRow row = sorted.get(i);
            Integer q = parseQtyText(row.getQty());
            long n = q == null ? 0 : q;
            details.add(new SubtotalEvent(-1, i, safe(row.getApplicantGroup()),
                    safe(row.getApplicantName()), safe(row.getItemName()), n, 0, 0));
        }
        return details;
    }

    /**
     * 按物品来去流水导出（列顺序与 Web 预览一致）。
     * 按 课题组 → 申领人 → 物品 排序并逐层插入小计，末尾总计（含入库/出库/净额）。
     */
    public byte[] buildItemFlowSheet(List<MaterialItemFlowExportRow> rows) {
        return buildItemFlowSheet(rows, SubtotalConfig.all());
    }

    /**
     * 同上，但按 {@code config} 保留/排除部分小计层级与板块。
     */
    public byte[] buildItemFlowSheet(List<MaterialItemFlowExportRow> rows, SubtotalConfig config) {
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sh = wb.createSheet(WorkbookUtil.createSafeSheetName("物品来去流水"));
            int r = 0;
            Row head = sh.createRow(r++);
            String[] cols = { "时间", "类型", "物品", "规格", "变动数量", "库存", "申领人", "课题组", "关联单号", "备注" };
            for (int i = 0; i < cols.length; i++) head.createCell(i).setCellValue(cols[i]);

            List<MaterialItemFlowExportRow> sorted = sortItemFlowRows(rows);
            List<SubtotalEvent> details = toItemFlowDetails(sorted);

            SubtotalRowStyles styles = SubtotalRowStyles.create(wb);
            List<SubtotalEvent> plan = SubtotalPlanBuilder.build(details, config);
            List<CellStyle> planStyles = styles.planStyles(plan);
            for (int i = 0; i < plan.size(); i++) {
                SubtotalEvent e = plan.get(i);
                Row data = sh.createRow(r++);
                if (e.isDetail()) {
                    MaterialItemFlowExportRow row = sorted.get(e.rowIndex());
                    data.createCell(0).setCellValue(safe(row.getTime()));
                    data.createCell(1).setCellValue(safe(row.getEventType()));
                    data.createCell(2).setCellValue(safe(row.getItemName()));
                    data.createCell(3).setCellValue(safe(row.getSpec()));
                    data.createCell(4).setCellValue(safe(row.getQty()));
                    data.createCell(5).setCellValue(safe(row.getStockAfter()));
                    data.createCell(6).setCellValue(safe(row.getApplicantName()));
                    data.createCell(7).setCellValue(safe(row.getApplicantGroup()));
                    data.createCell(8).setCellValue(safe(row.getRequestId()));
                    data.createCell(9).setCellValue(safe(row.getRemark()));
                    SubtotalRowStyles.apply(data, cols.length - 1, planStyles.get(i));
                    continue;
                }
                int labelCol = switch (e.level()) {
                    case 3 -> 2;
                    case 2 -> 6;
                    case 1 -> 7;
                    default -> 1;
                };
                data.createCell(labelCol).setCellValue(SubtotalPlanBuilder.label(e));
                if (e.level() == 3) {
                    data.createCell(6).setCellValue(safe(e.lv2()));
                    data.createCell(7).setCellValue(safe(e.lv1()));
                } else if (e.level() == 2) {
                    data.createCell(7).setCellValue(safe(e.lv1()));
                }
                data.createCell(4).setCellValue(e.net());
                data.createCell(9).setCellValue("入库合计 +" + e.inbound()
                        + "；出库合计 " + e.outbound() + "；净变动 " + e.net());
                SubtotalRowStyles.apply(data, cols.length - 1, planStyles.get(i));
                if (e.level() == 1) r++;   // 一级小计后空一行，隔开各板块
            }
            ExcelExportColumnAutosizer.autoSizeByContentWithHeaderFloorRow0(sh, 0, cols.length - 1);
            wb.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException("导出物品来去流水 Excel 失败: " + e.getMessage(), e);
        }
    }

    /**
     * 来去流水导出结构摘要：全量层级与板块（供勾选），不受配置影响。
     * 与导出共用 {@link #sortItemFlowRows}/{@link #toItemFlowDetails}，保证摘要行数 == 成品行数。
     */
    public SubtotalSummary summarizeItemFlow(List<MaterialItemFlowExportRow> rows) {
        List<SubtotalEvent> details = toItemFlowDetails(sortItemFlowRows(rows));
        return SubtotalPlanBuilder.summarize(SubtotalPlanBuilder.build(details, SubtotalConfig.all()));
    }

    /** 来去流水明细排序（排序规则导出与摘要共用）。 */
    private static List<MaterialItemFlowExportRow> sortItemFlowRows(List<MaterialItemFlowExportRow> rows) {
        List<MaterialItemFlowExportRow> sorted = new ArrayList<>(rows == null ? List.of() : rows);
        sorted.sort(Comparator
                .comparing((MaterialItemFlowExportRow x) -> safe(x.getApplicantGroup()))
                .thenComparing(x -> safe(x.getApplicantName()))
                .thenComparing(x -> safe(x.getItemName()))
                .thenComparing(x -> safe(x.getTime()), Comparator.reverseOrder()));
        return sorted;
    }

    /** 排序后的来去流水明细行 → 小计事件（导出与摘要同源，不复制两份）。 */
    private static List<SubtotalEvent> toItemFlowDetails(List<MaterialItemFlowExportRow> sorted) {
        List<SubtotalEvent> details = new ArrayList<>();
        for (int i = 0; i < sorted.size(); i++) {
            MaterialItemFlowExportRow row = sorted.get(i);
            Integer q = parseQtyText(row.getQty());
            long n = q == null ? 0 : q;
            details.add(new SubtotalEvent(-1, i, safe(row.getApplicantGroup()),
                    safe(row.getApplicantName()), safe(row.getItemName()),
                    n, Math.max(n, 0), Math.min(n, 0)));
        }
        return details;
    }

    /**
     * 审计流水导出为单工作表 Excel。
     * @param resolveName 将用户ID解析为展示名称的函数
     */
    public byte[] buildAuditTrailSheet(List<MaterialAuditTrailView> rows, Function<String, String> resolveName) {
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sh = wb.createSheet(WorkbookUtil.createSafeSheetName("物资审计流水"));
            int r = 0;
            Row head = sh.createRow(r++);
            String[] cols = { "申领单号", "申领人", "课题组", "物品名称", "申请数量", "出库数量", "状态", "申请时间", "出库时间", "出库人", "初审人", "复审人", "初审时间", "复审时间" };
            for (int i = 0; i < cols.length; i++) head.createCell(i).setCellValue(cols[i]);

            for (MaterialAuditTrailView row : rows) {
                Row data = sh.createRow(r++);
                data.createCell(0).setCellValue(safe(row.getRequestId()));
                data.createCell(1).setCellValue(safe(row.getApplicantName()));
                data.createCell(2).setCellValue(safe(row.getApplicantGroup()));
                data.createCell(3).setCellValue(safe(row.getItemName()));
                data.createCell(4).setCellValue(row.getQty() != null ? row.getQty() : 0);
                data.createCell(5).setCellValue(row.getFulfilledQty() != null ? row.getFulfilledQty() : 0);
                data.createCell(6).setCellValue(safe(statusZh(row.getStatus())));
                data.createCell(7).setCellValue(safe(row.getCreatedAt()));
                data.createCell(8).setCellValue(safe(row.getFulfilledAt()));
                data.createCell(9).setCellValue(safe(resolveName.apply(row.getFulfilledBy())));
                data.createCell(10).setCellValue(safe(resolveName.apply(row.getFirstReviewerId())));
                data.createCell(11).setCellValue(safe(resolveName.apply(row.getSecondReviewerId())));
                data.createCell(12).setCellValue(safe(row.getFirstReviewTime()));
                data.createCell(13).setCellValue(safe(row.getSecondReviewTime()));
            }
            ExcelExportColumnAutosizer.autoSizeByContentWithHeaderFloorRow0(sh, 0, cols.length - 1);
            wb.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException("导出物资审计流水 Excel 失败: " + e.getMessage(), e);
        }
    }

    /** 单张申领单导出 */
    public byte[] buildPersonalRequestSheet(MaterialRequestView request, Function<String, String> resolveName) {
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sh = wb.createSheet(WorkbookUtil.createSafeSheetName("申领单明细"));
            int r = 0;
            Row h1 = sh.createRow(r++); h1.createCell(0).setCellValue("申领单号"); h1.createCell(1).setCellValue(safe(request.getId()));
            Row h2 = sh.createRow(r++); h2.createCell(0).setCellValue("申领人"); h2.createCell(1).setCellValue(safe(request.getApplicantName()));
            Row h3 = sh.createRow(r++); h3.createCell(0).setCellValue("课题组"); h3.createCell(1).setCellValue(safe(request.getApplicantGroup()));
            Row h4 = sh.createRow(r++); h4.createCell(0).setCellValue("状态"); h4.createCell(1).setCellValue(statusZh(request.getStatus()));
            Row h5 = sh.createRow(r++); h5.createCell(0).setCellValue("申请时间"); h5.createCell(1).setCellValue(safe(request.getCreatedAt()));
            r++;
            Row head = sh.createRow(r++);
            String[] cols = {"物品名称","申请数量","出库数量","审核人","复审人"};
            for (int i = 0; i < cols.length; i++) head.createCell(i).setCellValue(cols[i]);
            if (request.getLines() != null) {
                for (var line : request.getLines()) {
                    Row row = sh.createRow(r++);
                    row.createCell(0).setCellValue(safe(line.getSnapshotName()));
                    row.createCell(1).setCellValue(line.getQty() != null ? line.getQty() : 0);
                    row.createCell(2).setCellValue(line.getFulfilledQty() != null ? line.getFulfilledQty() : 0);
                    row.createCell(3).setCellValue(safe(resolveName.apply(request.getFirstReviewerId())));
                    row.createCell(4).setCellValue(safe(resolveName.apply(request.getSecondReviewerId())));
                }
            }
            ExcelExportColumnAutosizer.autoSizeByContentWithHeaderFloorRow0(sh, 0, cols.length - 1);
            wb.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException("导出申领单Excel失败: " + e.getMessage(), e);
        }
    }

    private static String safe(String v) { return v != null ? v : ""; }

    /** 解析导出用数量文本（"+5" / "-3" / "0" / "无" / ""），非数字返回 null。 */
    static Integer parseQtyText(String s) {
        if (s == null) return null;
        String t = s.trim();
        if (t.isEmpty()) return null;
        if (t.startsWith("+")) t = t.substring(1);
        if (t.isEmpty()) return null;
        try {
            return Integer.valueOf(t);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String statusZh(String s) {
        if (s == null) return "";
        return switch (s) {
            case "DRAFT" -> "草稿"; case "PENDING" -> "待审核"; case "FIRST_OK" -> "初审通过";
            case "APPROVED" -> "已通过"; case "REJECTED" -> "已拒绝"; case "FULFILLED" -> "已出库";
            case "RECEIVED" -> "已完成"; default -> s;
        };
    }
}
