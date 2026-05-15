package com.example.demo.modules.supplies.service;

import com.example.demo.common.excel.ExcelExportColumnAutosizer;
import com.example.demo.modules.supplies.dto.SupplyAuditRestoredRow;
import com.example.demo.modules.supplies.dto.SupplyInventoryMovementRowView;
import com.example.demo.modules.supplies.dto.SupplyClaimLineView;
import com.example.demo.modules.supplies.dto.SupplyClaimOrderView;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.util.WorkbookUtil;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;

@Service
public class SuppliesExcelExportService {

    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    /** 领用单明细表头所在行（上方为单据摘要行） */
    private static final int PERSONAL_CLAIM_DETAIL_HEADER_ROW = 6;
    /** 领用聚合明细表头所在行 */
    private static final int AGGREGATE_CLAIM_DETAIL_HEADER_ROW = 5;

    /** 单个领用单导出（个人）：不含「当前库存」列；库存类列仅在按物品审计导出中存在。 */
    public byte[] buildPersonalClaimSheet(SupplyClaimOrderView order,
                                          List<SupplyClaimLineView> lines,
                                          Function<String, String> displayName) {
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sh = wb.createSheet(WorkbookUtil.createSafeSheetName("领用单明细"));
            int r = 0;
            Row h1 = sh.createRow(r++);
            h1.createCell(0).setCellValue("单据状态");
            h1.createCell(1).setCellValue(claimStatusZh(order.getStatus()));
            Row h2 = sh.createRow(r++);
            h2.createCell(0).setCellValue("领用申请时间");
            h2.createCell(1).setCellValue(formatDateTime(order.getCreatedAt()));
            Row h3 = sh.createRow(r++);
            h3.createCell(0).setCellValue("出库完成时间");
            h3.createCell(1).setCellValue(formatDateTime(order.getFulfilledAt()));
            Row h4 = sh.createRow(r++);
            h4.createCell(0).setCellValue("申请领用人");
            h4.createCell(1).setCellValue(safe(firstNonBlank(order.getApplicantName(), displayName.apply(order.getUserId()))));
            Row h5 = sh.createRow(r++);
            h5.createCell(0).setCellValue("出库处理人");
            h5.createCell(1).setCellValue(safe(firstNonBlank(order.getFulfilledByName(), displayName.apply(order.getFulfilledBy()))));
            r++;
            Row head = sh.createRow(r++);
            String[] cols = new String[]{
                    "物资名称",
                    "领用申请时间",
                    "出库完成时间",
                    "申请领用数量",
                    "出库数量",
                    "出入库类型",
                    "出库处理人",
                    "申请领用人",
                    "备注"
            };
            for (int i = 0; i < cols.length; i++) {
                head.createCell(i).setCellValue(cols[i]);
            }
            String applicant = safe(firstNonBlank(order.getApplicantName(), displayName.apply(order.getUserId())));
            String op = safe(firstNonBlank(order.getFulfilledByName(), displayName.apply(order.getFulfilledBy())));
            String applyTime = formatDateTime(order.getCreatedAt());
            String doneTime = formatDateTime(order.getFulfilledAt());
            for (SupplyClaimLineView line : lines) {
                Row row = sh.createRow(r++);
                int fq = line.getFulfilledQty() == null ? 0 : line.getFulfilledQty();
                int rq = line.getQty() == null ? 0 : line.getQty();
                String type;
                if (fq > 0) {
                    type = "出库";
                } else if ("FULFILLED".equalsIgnoreCase(order.getStatus()) || "WITHDRAWN".equalsIgnoreCase(order.getStatus())) {
                    type = "—";
                } else {
                    type = "待出库";
                }
                row.createCell(0).setCellValue(safe(line.getSnapshotName()));
                row.createCell(1).setCellValue(applyTime);
                row.createCell(2).setCellValue(doneTime);
                row.createCell(3).setCellValue(rq);
                row.createCell(4).setCellValue(fq);
                row.createCell(5).setCellValue(type);
                row.createCell(6).setCellValue(op);
                row.createCell(7).setCellValue(applicant);
                row.createCell(8).setCellValue("");
            }
            ExcelExportColumnAutosizer.autoSizeByContentWithHeaderFloor(sh, PERSONAL_CLAIM_DETAIL_HEADER_ROW, 0, cols.length - 1);
            wb.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException("导出Excel失败: " + e.getMessage(), e);
        }
    }

    /**
     * 多领用单按申请日期区间合并为一张「领用聚合明细」表（无库存列）。
     */
    public byte[] buildPersonalClaimsAggregateSheet(LocalDate from,
                                                    LocalDate to,
                                                    String applicantLabel,
                                                    List<SupplyClaimOrderView> orders,
                                                    Function<String, String> displayName) {
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sh = wb.createSheet(WorkbookUtil.createSafeSheetName("领用聚合明细"));
            int r = 0;
            Row t0 = sh.createRow(r++);
            t0.createCell(0).setCellValue("筛选开始");
            t0.createCell(1).setCellValue(from == null ? "" : from.toString());
            Row t1 = sh.createRow(r++);
            t1.createCell(0).setCellValue("筛选结束");
            t1.createCell(1).setCellValue(to == null ? "" : to.toString());
            Row t2 = sh.createRow(r++);
            t2.createCell(0).setCellValue("领用人");
            t2.createCell(1).setCellValue(safe(applicantLabel));
            Row t3 = sh.createRow(r++);
            t3.createCell(0).setCellValue("说明");
            t3.createCell(1).setCellValue("按领用人与领用单申请日期汇总；代查他人领用人需超级管理员及以上。");
            r++;
            Row head = sh.createRow(r++);
            // 明细表头与 buildPersonalClaimSheet 行表头一致（顺序相同，无领用单号列）
            String[] cols = new String[]{
                    "物资名称",
                    "领用申请时间",
                    "出库完成时间",
                    "申请领用数量",
                    "出库数量",
                    "出入库类型",
                    "出库处理人",
                    "申请领用人",
                    "备注"
            };
            for (int i = 0; i < cols.length; i++) {
                head.createCell(i).setCellValue(cols[i]);
            }
            for (SupplyClaimOrderView order : orders) {
                if (order == null) {
                    continue;
                }
                String applicant = safe(firstNonBlank(order.getApplicantName(), displayName.apply(order.getUserId())));
                String op = safe(firstNonBlank(order.getFulfilledByName(), displayName.apply(order.getFulfilledBy())));
                String applyTime = formatDateTime(order.getCreatedAt());
                String doneTime = formatDateTime(order.getFulfilledAt());
                List<SupplyClaimLineView> lines = order.getLines() == null ? List.of() : order.getLines();
                for (SupplyClaimLineView line : lines) {
                    Row row = sh.createRow(r++);
                    int fq = line.getFulfilledQty() == null ? 0 : line.getFulfilledQty();
                    int rq = line.getQty() == null ? 0 : line.getQty();
                    String type;
                    if (fq > 0) {
                        type = "出库";
                    } else if ("FULFILLED".equalsIgnoreCase(order.getStatus()) || "WITHDRAWN".equalsIgnoreCase(order.getStatus())) {
                        type = "—";
                    } else {
                        type = "待出库";
                    }
                    row.createCell(0).setCellValue(safe(line.getSnapshotName()));
                    row.createCell(1).setCellValue(applyTime);
                    row.createCell(2).setCellValue(doneTime);
                    row.createCell(3).setCellValue(rq);
                    row.createCell(4).setCellValue(fq);
                    row.createCell(5).setCellValue(type);
                    row.createCell(6).setCellValue(op);
                    row.createCell(7).setCellValue(applicant);
                    row.createCell(8).setCellValue("");
                }
            }
            ExcelExportColumnAutosizer.autoSizeByContentWithHeaderFloor(sh, AGGREGATE_CLAIM_DETAIL_HEADER_ROW, 0, cols.length - 1);
            wb.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException("导出Excel失败: " + e.getMessage(), e);
        }
    }

    /**
     * 按物品导出：单工作表「审计明细」——库存流水与领用单还原行合并为统一表头（不含领用单号列；变动数量列合并原入库/出库数量语义），按时间倒序。
     */
    public byte[] buildAuditWorkbook(String itemName,
                                       List<SupplyInventoryMovementRowView> movements,
                                       List<SupplyAuditRestoredRow> restoredRows,
                                       Function<String, String> displayName) {
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            String raw = (itemName == null || itemName.isBlank()) ? "物资" : itemName.replaceAll("[\\\\/*?\\[\\]:]", "_");
            Sheet sh = wb.createSheet(WorkbookUtil.createSafeSheetName(raw + "-审计明细"));
            List<MergedAuditLine> merged = new ArrayList<>();
            for (SupplyInventoryMovementRowView m : movements) {
                String opn = m.getOperatorName();
                if (opn == null || opn.isBlank()) {
                    opn = displayName.apply(m.getOperatorUserId());
                }
                String apn = m.getApplicantName();
                if (apn == null || apn.isBlank()) {
                    apn = displayName.apply(m.getApplicantUserId());
                }
                String[] cells = new String[8];
                cells[0] = safe(m.getCreatedAt());
                cells[1] = safe(m.getItemName());
                cells[2] = movementInOutLabel(m.getMovementType(), m.getQty());
                cells[3] = movementChangeQtySigned(m);
                cells[4] = m.getStockAfter() == null ? "" : String.valueOf(m.getStockAfter());
                cells[5] = safe(opn);
                cells[6] = safe(apn);
                cells[7] = safe(m.getRemark());
                merged.add(new MergedAuditLine(parseSortTime(cells[0]), cells));
            }
            for (SupplyAuditRestoredRow h : restoredRows) {
                String[] cells = new String[8];
                cells[0] = safe(h.getOutboundTime());
                cells[1] = safe(h.getItemName());
                cells[2] = "出库";
                int oq = h.getOutboundQty() == null ? 0 : h.getOutboundQty();
                cells[3] = String.valueOf(-Math.abs(oq));
                cells[4] = "";
                cells[5] = safe(displayName.apply(h.getFulfilledByUserId()));
                cells[6] = safe(displayName.apply(h.getApplicantUserId()));
                cells[7] = "自领用单还原";
                merged.add(new MergedAuditLine(parseSortTime(cells[0]), cells));
            }
            merged.sort(Comparator.comparing((MergedAuditLine line) -> line.sortTime).reversed());
            int r = 0;
            Row head = sh.createRow(r++);
            String[] headers = new String[]{
                    "变动时间",
                    "物资名称",
                    "类型",
                    "变动数量",
                    "现存",
                    "处理人",
                    "领用人",
                    "备注"
            };
            for (int i = 0; i < headers.length; i++) {
                head.createCell(i).setCellValue(headers[i]);
            }
            for (MergedAuditLine line : merged) {
                Row row = sh.createRow(r++);
                for (int i = 0; i < line.cells.length; i++) {
                    row.createCell(i).setCellValue(line.cells[i]);
                }
            }
            ExcelExportColumnAutosizer.autoSizeByContentWithHeaderFloorRow0(sh, 0, headers.length - 1);
            wb.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException("导出Excel失败: " + e.getMessage(), e);
        }
    }

    /**
     * 与「类型」列一致：入库为正、出库为负、调整按实际符号。
     */
    private static String movementChangeQtySigned(SupplyInventoryMovementRowView m) {
        if (m == null) {
            return "";
        }
        String t = m.getMovementType() == null ? "" : m.getMovementType().trim().toUpperCase(Locale.ROOT);
        int q = m.getQty() == null ? 0 : m.getQty();
        if ("INBOUND".equals(t)) {
            return String.valueOf(Math.abs(q));
        }
        if ("OUTBOUND".equals(t)) {
            return String.valueOf(-Math.abs(q));
        }
        if ("ADJUST".equals(t)) {
            return String.valueOf(q);
        }
        return m.getQty() == null ? "" : String.valueOf(m.getQty());
    }

    /** 与小程序聚合表一致：类型仅「入库/出库」 */
    private static String movementInOutLabel(String movementType, Integer qty) {
        String t = movementType == null ? "" : movementType.trim().toUpperCase(Locale.ROOT);
        int q = qty == null ? 0 : qty;
        if ("INBOUND".equals(t)) {
            return "入库";
        }
        if ("OUTBOUND".equals(t)) {
            return "出库";
        }
        if ("ADJUST".equals(t)) {
            return q < 0 ? "出库" : "入库";
        }
        return "—";
    }

    private static LocalDateTime parseSortTime(String s) {
        if (s == null || s.isBlank()) {
            return LocalDateTime.MIN;
        }
        try {
            return LocalDateTime.parse(s.trim(), DT);
        } catch (Exception e) {
            return LocalDateTime.MIN;
        }
    }

    private static final class MergedAuditLine {
        final LocalDateTime sortTime;
        final String[] cells;

        MergedAuditLine(LocalDateTime sortTime, String[] cells) {
            this.sortTime = sortTime;
            this.cells = cells;
        }
    }

    private static String formatDateTime(LocalDateTime t) {
        if (t == null) {
            return "";
        }
        return t.format(DT);
    }

    private static String claimStatusZh(String s) {
        if (s == null) {
            return "";
        }
        return switch (s.trim().toUpperCase()) {
            case "PENDING" -> "待出库";
            case "FULFILLED" -> "已完成";
            case "WITHDRAWN" -> "已撤回";
            case "DELETED" -> "已删除";
            default -> s;
        };
    }

    private static String safe(String s) {
        return s == null ? "" : s;
    }

    private static String firstNonBlank(String a, String b) {
        if (a != null && !a.isBlank()) {
            return a;
        }
        return b == null ? "" : b;
    }
}
