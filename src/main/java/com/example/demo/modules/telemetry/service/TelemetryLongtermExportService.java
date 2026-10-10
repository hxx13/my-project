package com.example.demo.modules.telemetry.service;

import com.example.demo.common.excel.ExcelExportColumnAutosizer;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermExportRequest;
import com.example.demo.modules.telemetry.entity.TelemetryLongtermSampleRow;
import com.example.demo.modules.telemetry.mapper.TelemetryLongtermSampleMapper;
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
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 变量长期归档导出。
 *
 * <p>表格（{@code layout}）：**LONG** 一行一条「时间 + 变量 + 值」；**WIDE** 一行一个时间点、变量一列
 * （列序 = 配置顺序）。
 *
 * <p>多天（{@code days} 多选）：**长表连成一张表、加一列「日期」**（时间拆成日期 + 时刻），
 * 各天的行按时间顺序**从上往下接排**，不是一天一张表；宽表因为列轴是时刻，只能按天分段上下堆叠。
 *
 * <p>时间范围**必填**：days / month / from-to 三样都没给就报错 —— 不默认导今天，避免误导出整表。
 */
@Service
public class TelemetryLongtermExportService {

    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter TIME_ONLY = DateTimeFormatter.ofPattern("HH:mm:ss");

    /** 单次导出行数上限。再大就该按月份分批导，而不是一次拉进内存。 */
    private static final int EXPORT_ROW_LIMIT = 200_000;

    private final TelemetryLongtermSampleMapper sampleMapper;

    public TelemetryLongtermExportService(TelemetryLongtermSampleMapper sampleMapper) {
        this.sampleMapper = sampleMapper;
    }

    public byte[] exportXlsx(TelemetryLongtermExportRequest req) {
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            List<String> days = normalizeDays(req == null ? null : req.getDays());
            LocalDateTime[] monthRange = days.isEmpty()
                    ? TelemetryLongtermArchiveService.monthRange(req == null ? null : req.getMonth())
                    : null;
            LocalDateTime from;
            LocalDateTime to;
            if (!days.isEmpty()) {
                from = LocalDate.parse(days.get(0)).atStartOfDay();
                to = LocalDate.parse(days.get(days.size() - 1)).atTime(23, 59, 59, 999_000_000);
            } else if (monthRange != null) {
                from = monthRange[0];
                to = monthRange[1];
            } else {
                from = req == null ? null : req.getFrom();
                to = req == null ? null : req.getTo();
            }
            if (from == null && to == null) {
                throw new IllegalArgumentException("未选择时间范围");
            }

            List<String> requested = normalize(req == null ? null : req.getVariableNames());
            List<TelemetryLongtermSampleRow> rows = sampleMapper.selectForExport(
                    requested.isEmpty() ? null : requested, from, to, EXPORT_ROW_LIMIT);
            // 非连续多选时上面取的是并集区间，这里按真正选中的那些天精确筛一遍
            if (!days.isEmpty()) {
                Set<String> daySet = new HashSet<>(days);
                rows = rows.stream()
                        .filter(r -> r.getSampleAt() != null && daySet.contains(r.getSampleAt().toLocalDate().format(DAY)))
                        .toList();
            }

            Sheet sh = wb.createSheet(WorkbookUtil.createSafeSheetName("数据监测"));
            boolean wide = req != null && "WIDE".equalsIgnoreCase(req.getLayout());
            boolean multiDay = distinctDayCount(rows) > 1;
            if (wide) {
                writeWide(sh, rows, requested, multiDay);
            } else {
                writeLong(sh, rows, multiDay);
            }
            Row head = sh.getRow(0);
            ExcelExportColumnAutosizer.autoSizeByContentWithHeaderFloorRow0(sh, 0, head.getLastCellNum() - 1);
            wb.write(out);
            return out.toByteArray();
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("导出Excel失败: " + e.getMessage(), e);
        }
    }

    /** 长表：多天时**加一列日期**、时间列只留时刻，各天的行按时间从上往下接排（一整张连续表）。 */
    private void writeLong(Sheet sh, List<TelemetryLongtermSampleRow> rows, boolean multiDay) {
        Row head = sh.createRow(0);
        List<String> cols = new ArrayList<>();
        if (multiDay) {
            cols.add("日期");
            cols.add("时刻");
        } else {
            cols.add("时间");
        }
        cols.addAll(List.of("变量", "值", "原始值", "房间", "楼层"));
        for (int i = 0; i < cols.size(); i++) {
            head.createCell(i).setCellValue(cols.get(i));
        }
        int r = 1;
        for (TelemetryLongtermSampleRow row : rows) {
            Row out = sh.createRow(r++);
            int c = 0;
            if (multiDay) {
                out.createCell(c++).setCellValue(row.getSampleAt() == null ? "" : row.getSampleAt().format(DAY));
                out.createCell(c++).setCellValue(row.getSampleAt() == null ? "" : row.getSampleAt().format(TIME_ONLY));
            } else {
                out.createCell(c++).setCellValue(formatTime(row.getSampleAt()));
            }
            out.createCell(c++).setCellValue(safe(row.getVariableName()));
            Double nv = row.getNumericValue();
            if (nv != null) {
                out.createCell(c++).setCellValue(nv);
            } else {
                out.createCell(c).setCellValue("");
                c++;
            }
            out.createCell(c++).setCellValue(safe(row.getRawValue()));
            out.createCell(c++).setCellValue(safe(row.getRoomCanonical()));
            out.createCell(c).setCellValue(safe(row.getFloorCode()));
        }
    }

    /** 宽表：单天一张表；多天**按天分段上下堆叠**（列轴是时刻，跨天没法共用一个表头）。 */
    private void writeWide(Sheet sh, List<TelemetryLongtermSampleRow> rows, List<String> requested, boolean multiDay) {
        // 列序 = 配置顺序；请求里没点名但数据里出现的变量，按首次出现追加在后
        List<String> cols = new ArrayList<>(requested);
        Set<String> colSet = new LinkedHashSet<>(requested);
        for (TelemetryLongtermSampleRow row : rows) {
            String n = trim(row.getVariableName());
            if (n != null && colSet.add(n)) {
                cols.add(n);
            }
        }

        // 按天分组（数据已按 sample_at 升序）：LinkedHashMap 保序，同一天的分到一组
        LinkedHashMap<String, List<TelemetryLongtermSampleRow>> byDay = new LinkedHashMap<>();
        for (TelemetryLongtermSampleRow row : rows) {
            String day = row.getSampleAt() == null ? "" : row.getSampleAt().format(DAY);
            byDay.computeIfAbsent(day, k -> new ArrayList<>()).add(row);
        }

        int r = 0;
        boolean first = true;
        for (Map.Entry<String, List<TelemetryLongtermSampleRow>> e : byDay.entrySet()) {
            if (multiDay) {
                if (!first) {
                    r++; // 段间空一行
                }
                Row title = sh.createRow(r++);
                title.createCell(0).setCellValue("日期");
                title.createCell(1).setCellValue(e.getKey());
            }
            Row head = sh.createRow(r++);
            head.createCell(0).setCellValue("时间");
            for (int i = 0; i < cols.size(); i++) {
                head.createCell(i + 1).setCellValue(cols.get(i));
            }
            LinkedHashMap<String, Map<String, String>> byTime = new LinkedHashMap<>();
            for (TelemetryLongtermSampleRow row : e.getValue()) {
                String n = trim(row.getVariableName());
                if (n == null) {
                    continue;
                }
                byTime.computeIfAbsent(formatTime(row.getSampleAt()), k -> new LinkedHashMap<>())
                        .put(n, safe(row.getRawValue()));
            }
            for (Map.Entry<String, Map<String, String>> t : byTime.entrySet()) {
                Row out = sh.createRow(r++);
                out.createCell(0).setCellValue(t.getKey());
                for (int i = 0; i < cols.size(); i++) {
                    String v = t.getValue().get(cols.get(i));
                    out.createCell(i + 1).setCellValue(v == null ? "" : v);
                }
            }
            first = false;
        }
        if (r == 0) {
            sh.createRow(0).createCell(0).setCellValue("时间");
        }
    }

    /** 数据里跨了几个自然日（决定长表要不要加日期列）。 */
    private static int distinctDayCount(List<TelemetryLongtermSampleRow> rows) {
        Set<String> days = new LinkedHashSet<>();
        for (TelemetryLongtermSampleRow row : rows) {
            if (row.getSampleAt() != null) {
                days.add(row.getSampleAt().toLocalDate().format(DAY));
            }
        }
        return days.size();
    }

    /** 归一化选中的日期：只保留 yyyy-MM-dd、去重、升序（区间两端取最小/最大）。 */
    private static List<String> normalizeDays(List<String> days) {
        if (days == null || days.isEmpty()) {
            return List.of();
        }
        java.util.TreeSet<String> set = new java.util.TreeSet<>();
        for (String d : days) {
            String t = trim(d);
            if (t == null || t.length() != 10) {
                continue;
            }
            try {
                set.add(LocalDate.parse(t).format(DAY));
            } catch (Exception ignored) {
                // 非法日期直接跳过（前端与 AI 侧也会拦）
            }
        }
        return new ArrayList<>(set);
    }

    private static List<String> normalize(List<String> names) {
        List<String> out = new ArrayList<>();
        if (names != null) {
            for (String n : names) {
                String t = trim(n);
                if (t != null) {
                    out.add(t);
                }
            }
        }
        return out;
    }

    private static String formatTime(LocalDateTime t) {
        return t == null ? "" : t.format(DT);
    }

    private static String safe(String s) {
        return s == null ? "" : s;
    }

    private static String trim(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }
}
