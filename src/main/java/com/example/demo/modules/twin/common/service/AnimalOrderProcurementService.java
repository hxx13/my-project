package com.example.demo.modules.twin.common.service;

import com.example.demo.common.excel.ExcelExportColumnAutosizer;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.util.WorkbookUtil;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 采购汇总：面向供应商的备货口径统计。
 * 维度固定为 到货日期 × 供应商 × 品系 × 规格 × 性别，刻意不含 PI / 课题组。
 */
@Service
public class AnimalOrderProcurementService {

    public static final String ROW_DETAIL = "DETAIL";
    public static final String ROW_SUPPLIER_SUBTOTAL = "SUPPLIER_SUBTOTAL";
    public static final String ROW_GRAND_TOTAL = "GRAND_TOTAL";

    private static final DateTimeFormatter EXPORT_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final String[] HEADERS = {"到货日期", "供应商", "品系", "规格", "雄（只）", "雌（只）", "合计（只）"};

    private final TwinDashboardMapper dashboardMapper;

    public AnimalOrderProcurementService(TwinDashboardMapper dashboardMapper) {
        this.dashboardMapper = dashboardMapper;
    }

    /** 明细行 + 每个「到货日期/供应商」的小计 + 全表总计，供前端表格与 Excel 共用。 */
    public List<Map<String, Object>> buildRows(String dateField, String startDate, String endDate) {
        return assembleRows(dashboardMapper.getProcurementSummary(
                normalizeDateField(dateField), trimToNull(startDate), trimToNull(endDate)));
    }

    /** 输入须已按 到货日期 / 供应商 / 品系 / 规格 排序。 */
    static List<Map<String, Object>> assembleRows(List<Map<String, Object>> groups) {
        List<Map<String, Object>> rows = new ArrayList<>();
        if (groups == null) {
            return rows;
        }
        long grandMale = 0, grandFemale = 0;
        long subMale = 0, subFemale = 0;
        String prevArrival = null, prevSupplier = null;

        for (Map<String, Object> g : groups) {
            String arrival = str(g.get("arrivalDate"));
            String supplier = str(g.get("supplierName"));
            if (prevArrival == null || !arrival.equals(prevArrival) || !supplier.equals(prevSupplier)) {
                if (prevArrival != null) {
                    rows.add(subtotalRow(prevArrival, prevSupplier, subMale, subFemale));
                }
                prevArrival = arrival;
                prevSupplier = supplier;
                subMale = 0;
                subFemale = 0;
            }
            long male = toLong(g.get("maleQty"));
            long female = toLong(g.get("femaleQty"));
            subMale += male;
            subFemale += female;
            grandMale += male;
            grandFemale += female;

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("rowType", ROW_DETAIL);
            row.put("arrivalDate", arrival);
            row.put("supplierName", supplier);
            row.put("strainName", str(g.get("strainName")));
            row.put("specName", str(g.get("specName")));
            row.put("maleQty", male);
            row.put("femaleQty", female);
            row.put("totalQty", male + female);
            rows.add(row);
        }
        if (prevArrival != null) {
            rows.add(subtotalRow(prevArrival, prevSupplier, subMale, subFemale));
        }
        if (!groups.isEmpty()) {
            rows.add(subtotalRow("", "", grandMale, grandFemale, ROW_GRAND_TOTAL));
        }
        return rows;
    }

    public byte[] buildExcel(String dateField, String startDate, String endDate) {
        List<Map<String, Object>> rows = buildRows(dateField, startDate, endDate);
        String basis = "order".equals(normalizeDateField(dateField)) ? "下单时间" : "到货日期";
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sh = wb.createSheet(WorkbookUtil.createSafeSheetName("采购汇总"));
            int r = 0;
            r = meta(sh, r, "采购汇总表（供应商备货口径）", "");
            r = meta(sh, r, "筛选口径", basis);
            r = meta(sh, r, "日期区间", blankTo(str(startDate), "不限") + " ~ " + blankTo(str(endDate), "不限"));
            r = meta(sh, r, "导出时间", LocalDateTime.now().format(EXPORT_TIME));
            r = meta(sh, r, "说明", "已排除取消/审批不通过/驳回订单；按到货日期×供应商×品系×规格统计只数，不含课题组/PI 维度。");
            r++;

            Row head = sh.createRow(r++);
            for (int i = 0; i < HEADERS.length; i++) {
                head.createCell(i).setCellValue(HEADERS[i]);
            }
            int dataStart = r;
            for (Map<String, Object> row : rows) {
                Row xr = sh.createRow(r++);
                String type = str(row.get("rowType"));
                if (ROW_GRAND_TOTAL.equals(type)) {
                    xr.createCell(0).setCellValue("总计");
                } else if (ROW_SUPPLIER_SUBTOTAL.equals(type)) {
                    xr.createCell(0).setCellValue(str(row.get("arrivalDate")));
                    xr.createCell(1).setCellValue(str(row.get("supplierName")));
                    xr.createCell(2).setCellValue("小计");
                } else {
                    xr.createCell(0).setCellValue(str(row.get("arrivalDate")));
                    xr.createCell(1).setCellValue(str(row.get("supplierName")));
                    xr.createCell(2).setCellValue(str(row.get("strainName")));
                    xr.createCell(3).setCellValue(str(row.get("specName")));
                }
                xr.createCell(4).setCellValue(toLong(row.get("maleQty")));
                xr.createCell(5).setCellValue(toLong(row.get("femaleQty")));
                xr.createCell(6).setCellValue(toLong(row.get("totalQty")));
            }
            if (r > dataStart) {
                ExcelExportColumnAutosizer.autoSizeWithData(sh, dataStart - 1, dataStart, r - 1, 0, HEADERS.length - 1);
            }
            wb.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException("导出采购汇总 Excel 失败: " + e.getMessage(), e);
        }
    }

    private static int meta(Sheet sh, int r, String label, String value) {
        Row row = sh.createRow(r);
        row.createCell(0).setCellValue(label);
        row.createCell(1).setCellValue(value);
        return r + 1;
    }

    private static Map<String, Object> subtotalRow(String arrival, String supplier, long male, long female) {
        return subtotalRow(arrival, supplier, male, female, ROW_SUPPLIER_SUBTOTAL);
    }

    private static Map<String, Object> subtotalRow(String arrival, String supplier, long male, long female, String type) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("rowType", type);
        row.put("arrivalDate", arrival);
        row.put("supplierName", supplier);
        row.put("strainName", "");
        row.put("specName", "");
        row.put("maleQty", male);
        row.put("femaleQty", female);
        row.put("totalQty", male + female);
        return row;
    }

    private static String normalizeDateField(String dateField) {
        return "order".equalsIgnoreCase(dateField == null ? "" : dateField.trim()) ? "order" : "arrival";
    }

    private static String trimToNull(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    private static String blankTo(String s, String fallback) {
        return s == null || s.isEmpty() ? fallback : s;
    }

    private static long toLong(Object o) {
        if (o instanceof Number n) {
            return n.longValue();
        }
        if (o == null) {
            return 0;
        }
        try {
            return Long.parseLong(String.valueOf(o).trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
