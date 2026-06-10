package com.example.demo.modules.material.service;

import com.example.demo.common.excel.ExcelExportColumnAutosizer;
import com.example.demo.modules.material.dto.MaterialAuditTrailView;
import com.example.demo.modules.material.dto.MaterialRequestView;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.util.WorkbookUtil;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.util.List;

@Service
public class MaterialExcelExportService {

    /**
     * 审计流水导出为单工作表 Excel。
     * 列：申领单号 | 申领人 | 课题组 | 物品 | 申请数量 | 出库数量 | 状态 | 申请时间 | 出库时间 | 审核人 | 复审人
     */
    public byte[] buildAuditTrailSheet(List<MaterialAuditTrailView> rows) {
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
                data.createCell(9).setCellValue(safe(row.getFulfilledBy()));
                data.createCell(10).setCellValue(safe(row.getFirstReviewerId()));
                data.createCell(11).setCellValue(safe(row.getSecondReviewerId()));
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
    public byte[] buildPersonalRequestSheet(MaterialRequestView request) {
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
                    row.createCell(3).setCellValue(safe(request.getFirstReviewerId()));
                    row.createCell(4).setCellValue(safe(request.getSecondReviewerId()));
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
    private static String statusZh(String s) {
        if (s == null) return "";
        return switch (s) {
            case "DRAFT" -> "草稿"; case "PENDING" -> "待审核"; case "FIRST_OK" -> "初审通过";
            case "APPROVED" -> "已通过"; case "REJECTED" -> "已拒绝"; case "FULFILLED" -> "已出库";
            case "RECEIVED" -> "已完成"; default -> s;
        };
    }
}
