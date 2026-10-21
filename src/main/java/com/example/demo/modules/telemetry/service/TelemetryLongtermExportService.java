package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermExportRequest;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermVariableDto;
import com.example.demo.modules.telemetry.entity.TelemetryLongtermSampleRow;
import com.example.demo.modules.telemetry.mapper.TelemetryLongtermSampleMapper;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.util.WorkbookUtil;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.apache.poi.xssf.usermodel.XSSFColor;
import org.apache.poi.xssf.usermodel.XSSFFont;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 变量长期归档导出。
 *
 * <p>表格（{@code layout}）：**LONG** 一行一条「时间 + 变量 + 值」；**WIDE** 一行一个房间、一列一个时刻
 * —— **与页面上那张矩阵同一个形状**（行 = 房间、列 = 时刻），用户在页面上核对完再来导，两边长得一样才对得上。
 *
 * <p>多天（{@code days} 多选）：**长表连成一张表、加一列「日期」**（时间拆成日期 + 时刻），
 * 各天的行按时间顺序**从上往下接排**，不是一天一张表；宽表因为列轴是时刻，只能按天分段上下堆叠。
 *
 * <p>分区：按当前自定义分区导出，只包含该分区下的已选变量；不传分区时导出全部。
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
    private final TelemetryLongtermArchiveService archiveService;

    public TelemetryLongtermExportService(TelemetryLongtermSampleMapper sampleMapper,
                                          TelemetryLongtermArchiveService archiveService) {
        this.sampleMapper = sampleMapper;
        this.archiveService = archiveService;
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
            List<String> partitionNames = archiveService.partitionVariableNames(
                    req == null ? null : req.getPartitionId());
            List<String> queryNames;
            if (partitionNames.isEmpty()) {
                queryNames = List.of();
            } else if (requested.isEmpty()) {
                queryNames = partitionNames;
            } else {
                Set<String> allowed = new HashSet<>(partitionNames);
                queryNames = requested.stream().filter(allowed::contains).toList();
            }
            List<TelemetryLongtermSampleRow> rows = queryNames.isEmpty()
                    ? List.of()
                    : sampleMapper.selectForExport(queryNames, from, to, EXPORT_ROW_LIMIT);
            // 非连续多选时上面取的是并集区间，这里按真正选中的那些天精确筛一遍
            if (!days.isEmpty()) {
                Set<String> daySet = new HashSet<>(days);
                rows = rows.stream()
                        .filter(r -> r.getSampleAt() != null && daySet.contains(r.getSampleAt().toLocalDate().format(DAY)))
                        .toList();
            }

            boolean wide = req != null && "WIDE".equalsIgnoreCase(req.getLayout());
            Map<String, String> displayByVar = new LinkedHashMap<>();
            Map<String, String> unitByVar = new LinkedHashMap<>();
            List<TelemetryLongtermVariableDto> configured = archiveService.listVariables();
            if (configured != null) {
                for (TelemetryLongtermVariableDto v : configured) {
                    if (v == null) {
                        continue;
                    }
                    String name = trim(v.getWinccVariableName());
                    if (name == null) {
                        continue;
                    }
                    String label = trim(v.getDisplayLabel());
                    if (label != null) {
                        displayByVar.put(name, label);
                    }
                    String unit = trim(v.getUnit());
                    if (unit != null) {
                        unitByVar.put(name, unit);
                    }
                }
            }

            Sheet sh = wb.createSheet(WorkbookUtil.createSafeSheetName("数据监测"));
            if (rows.isEmpty()) {
                sh.createRow(0).createCell(0).setCellValue("展示映射");
            } else {
                boolean multiDay = distinctDayCount(rows) > 1;
                if (wide) {
                    writeWide(sh, rows, queryNames, unitByVar, displayByVar, multiDay);
                } else {
                    writeLong(sh, rows, multiDay, displayByVar);
                }
            }
            setColumnWidths(sh);
            wb.write(out);
            return out.toByteArray();
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("导出Excel失败: " + e.getMessage(), e);
        }
    }

    /** 长表：多天时**加一列日期**、时间列只留时刻，各天的行按时间从上往下接排（一整张连续表）。 */
    private void writeLong(Sheet sh, List<TelemetryLongtermSampleRow> rows, boolean multiDay,
                           Map<String, String> displayByVar) {
        Row head = sh.createRow(0);
        List<String> cols = new ArrayList<>();
        if (multiDay) {
            cols.add("日期");
            cols.add("时刻");
        } else {
            cols.add("时间");
        }
        cols.addAll(List.of("变量", "值", "原始值", "展示映射", "楼层"));
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
            out.createCell(c++).setCellValue(labelOf(row, displayByVar));
            out.createCell(c).setCellValue(safe(row.getFloorCode()));
        }
    }

    /**
     * 宽表：**行 = 房间、列 = 时刻**，列头直接写那个时刻 —— 与页面上那张矩阵同一个形状。
     *
     * <p>之所以反过来（早先是「一行一个时刻、变量一列」）：用户在页面上核对完再来导，
     * 两边长得一样才对得上，否则每导一次都得自己在脑子里转置一遍。
     *
     * <p>行只含**当天有数据的**房间，配置里有的按配置顺序排前面、其余按首次出现追加在后 ——
     * 与页面列表同一条口径。
     *
     * <p>多天时按天分段上下堆叠（列轴是时刻，跨天没法共用一个表头），段间空一行。
     */
    private void writeWide(Sheet sh, List<TelemetryLongtermSampleRow> rows, List<String> requested,
                           Map<String, String> unitByVar, Map<String, String> displayByVar, boolean multiDay) {
        // 按天分组（数据已按 sample_at 升序）：LinkedHashMap 保序，同一天的分到一组
        LinkedHashMap<String, List<TelemetryLongtermSampleRow>> byDay = new LinkedHashMap<>();
        for (TelemetryLongtermSampleRow row : rows) {
            String day = row.getSampleAt() == null ? "" : row.getSampleAt().format(DAY);
            byDay.computeIfAbsent(day, k -> new ArrayList<>()).add(row);
        }

        // 极值底色（最大/最小），与页面上的高亮同一个色；两个样式整张表复用，别一格建一个
        CellStyle[] ext = extremeStyles(sh.getWorkbook());
        CellStyle stMax = ext[0];
        CellStyle stMin = ext[1];

        int r = 0;
        boolean first = true;
        for (Map.Entry<String, List<TelemetryLongtermSampleRow>> e : byDay.entrySet()) {
            if (!first) {
                r++; // 段间空一行
            }
            if (multiDay) {
                Row title = sh.createRow(r++);
                title.createCell(0).setCellValue("日期");
                title.createCell(1).setCellValue(e.getKey());
            }

            // 走一遍这天的数据，同时收齐三样：有哪些房间、时刻的先后、每个格子里的值
            Set<String> inDay = new LinkedHashSet<>();
            LinkedHashMap<String, String> labelOf = new LinkedHashMap<>();
            List<String> slots = new ArrayList<>();
            Map<String, Map<String, String>> bySlot = new LinkedHashMap<>();
            for (TelemetryLongtermSampleRow row : e.getValue()) {
                String n = trim(row.getVariableName());
                if (n == null) {
                    continue;
                }
                inDay.add(n);
                if (!labelOf.containsKey(n)) {
                    labelOf.put(n, roomLabel(row, unitByVar.get(n), displayByVar));
                }
                // 列头只写时刻 —— 一段就是一天，带上日期既啰嗦又把列撑宽（页面上的列头也是这个粒度）
                String t = row.getSampleAt() == null ? "" : row.getSampleAt().format(TIME_ONLY);
                Map<String, String> bucket = bySlot.get(t);
                if (bucket == null) {
                    bucket = new LinkedHashMap<>();
                    bySlot.put(t, bucket);
                    slots.add(t);
                }
                bucket.put(n, safe(row.getRawValue()));
            }

            Row head = sh.createRow(r++);
            head.createCell(0).setCellValue("展示映射");
            for (int i = 0; i < slots.size(); i++) {
                head.createCell(i + 1).setCellValue(slots.get(i));
            }

            List<String> order = new ArrayList<>();
            for (String v : requested) {
                if (inDay.contains(v)) {
                    order.add(v);
                }
            }
            for (String v : inDay) {
                if (!order.contains(v)) {
                    order.add(v);
                }
            }
            for (String v : order) {
                Row out = sh.createRow(r++);
                out.createCell(0).setCellValue(labelOf.getOrDefault(v, v));
                // 这一行有哪些数值，先解析出来才好定极值 —— 与页面同一条口径：
                // **要有两个以上不同的数值才标**（只采到一个值时标「最大」等于没标），
                // 且有多个格子同值时它们都标（页面上也是这么标的）。
                int slotN = slots.size();
                Double[] nums = new Double[slotN];
                List<Double> valid = new ArrayList<>();
                for (int i = 0; i < slotN; i++) {
                    nums[i] = displayNumber(bySlot.get(slots.get(i)).get(v));
                    if (nums[i] != null) {
                        valid.add(nums[i]);
                    }
                }
                boolean distinct = new HashSet<>(valid).size() > 1;
                double min = distinct ? Collections.min(valid) : 0;
                double max = distinct ? Collections.max(valid) : 0;
                for (int i = 0; i < slotN; i++) {
                    CellStyle st = null;
                    if (distinct && nums[i] != null) {
                        if (nums[i] == max) {
                            st = stMax;
                        } else if (nums[i] == min) {
                            st = stMin;
                        }
                    }
                    writeValue(out, i + 1, bySlot.get(slots.get(i)).get(v), st);
                }
            }
            first = false;
        }
        if (r == 0) {
            sh.createRow(0).createCell(0).setCellValue("房间");
        }
    }

    /**
     * 第一列写什么：与页面同一个口径 —— **展示映射**，变量配了单位就带上「(单位)」。
     * 归档表里没存展示映射，靠 {@code displayByVar} 现查；查不到的老数据退回房间名。
     */
    private static String roomLabel(TelemetryLongtermSampleRow row, String unit, Map<String, String> displayByVar) {
        String label = labelOf(row, displayByVar);
        return unit == null ? label : label + "(" + unit + ")";
    }

    /** 展示映射 → 房间名 → 变量名，与页面上那一列的取值顺序一致 */
    private static String labelOf(TelemetryLongtermSampleRow row, Map<String, String> displayByVar) {
        String vn = trim(row.getVariableName());
        String mapped = vn == null ? null : displayByVar.get(vn);
        if (mapped != null) {
            return mapped;
        }
        String room = trim(row.getRoomCanonical());
        if (room != null) {
            return room;
        }
        return vn == null ? "" : vn;
    }

    /**
     * 写一个数值格：能当数字读的**取一位小数写进去**（页面上显示的就是一位），
     * 「OFF」这类非数值原样留成文本，空值留空格。
     *
     * <p>写成数字而不是文本，是为了让它还能排序、还能直接拉图 —— 存成文本的数字在 Excel 里是废的。
     */
    private static void writeValue(Row row, int col, String raw, CellStyle style) {
        Cell cell = row.createCell(col);
        if (style != null) {
            cell.setCellStyle(style);
        }
        String v = raw == null ? "" : raw.trim();
        if (v.isEmpty()) {
            cell.setCellValue("");
            return;
        }
        try {
            cell.setCellValue(new BigDecimal(v).setScale(1, RoundingMode.HALF_UP).doubleValue());
        } catch (NumberFormatException e) {
            cell.setCellValue(v);
        }
    }

    /** 极值底色：与页面上一个色 —— 最大淡黄、最小淡蓝，字换成对应深色 */
    private static CellStyle[] extremeStyles(Workbook wb) {
        return new CellStyle[]{
                solidFill(wb, new byte[]{(byte) 0xFE, (byte) 0xF3, (byte) 0xC7},
                        new byte[]{(byte) 0xB4, (byte) 0x53, (byte) 0x09}),
                solidFill(wb, new byte[]{(byte) 0xDB, (byte) 0xEA, (byte) 0xFE},
                        new byte[]{(byte) 0x1D, (byte) 0x4E, (byte) 0xD8}),
        };
    }

    private static CellStyle solidFill(Workbook wb, byte[] bg, byte[] fg) {
        XSSFCellStyle st = (XSSFCellStyle) wb.createCellStyle();
        st.setFillForegroundColor(new XSSFColor(bg, null));
        st.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        XSSFFont f = (XSSFFont) wb.createFont();
        f.setColor(new XSSFColor(fg, null));
        st.setFont(f);
        return st;
    }

    /**
     * 能当数字读的给出**写进格子的那个数**（已取一位小数），读不出来（OFF 之类）给 null。
     *
     * <p>取整要跟写格子那步一致：极值是按这个数比的 —— 文件里两格都写着 64.9，
     * 却只标了其中一个，看着就是标错了（原始值一个 64.94 一个 64.85，肉眼分不出来）。
     */
    private static Double displayNumber(String raw) {
        String v = raw == null ? "" : raw.trim();
        if (v.isEmpty()) {
            return null;
        }
        try {
            return new BigDecimal(v).setScale(1, RoundingMode.HALF_UP).doubleValue();
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * 列宽。
     *
     * <p>没用公共的 ExcelExportColumnAutosizer：那个工具按「每个字符都算中文宽」估，
     * 而这张表以时刻和数字为主，量出来的宽度差不多是需要的两倍 —— 第一列的房间名宽出一大截、
     * 8 个字符的时刻列也被撑到 20。这里按实际字符算：中文（含全角）算 2、其余算 1。
     */
    private static void setColumnWidths(Sheet sh) {
        DataFormatter fmt = new DataFormatter();
        int lastRow = Math.min(sh.getLastRowNum(), 200); // 只为列宽，不必扫全表
        int lastCol = 0;
        for (Row row : sh) {
            if (row != null) {
                lastCol = Math.max(lastCol, row.getLastCellNum());
            }
        }
        for (int c = 0; c < lastCol; c++) {
            int need = 0;
            for (int r = 0; r <= lastRow; r++) {
                Row row = sh.getRow(r);
                if (row == null) {
                    continue;
                }
                Cell cell = row.getCell(c);
                if (cell != null) {
                    need = Math.max(need, displayWidth(fmt.formatCellValue(cell)));
                }
            }
            // POI 的宽度单位是 1/256 个字符宽；留 3 字余量、封顶 40 字（再长就让它自己截断）
            int units = (Math.min(need, 40) + 3) * 256;
            sh.setColumnWidth(c, Math.max(units, 2200));
        }
    }

    /** 显示宽度：中文（含全角）算 2，其余算 1 */
    private static int displayWidth(String s) {
        if (s == null) {
            return 0;
        }
        int w = 0;
        for (int i = 0; i < s.length(); i++) {
            w += s.charAt(i) > 0x2E80 ? 2 : 1;
        }
        return w;
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
