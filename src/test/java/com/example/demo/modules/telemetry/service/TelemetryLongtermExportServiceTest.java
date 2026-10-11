package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermExportRequest;
import com.example.demo.modules.telemetry.entity.TelemetryLongtermSampleRow;
import com.example.demo.modules.telemetry.mapper.TelemetryLongtermSampleMapper;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 导出两个布局的校验：读回 xlsx 断言表头、列序与单元格值。
 */
class TelemetryLongtermExportServiceTest {

    private static TelemetryLongtermSampleRow row(LocalDateTime at, String name, String raw) {
        TelemetryLongtermSampleRow r = new TelemetryLongtermSampleRow();
        r.setSampleAt(at);
        r.setVariableName(name);
        r.setRawValue(raw);
        return r;
    }

    private static TelemetryLongtermExportService service(List<TelemetryLongtermSampleRow> rows) {
        TelemetryLongtermSampleMapper mapper = mock(TelemetryLongtermSampleMapper.class);
        when(mapper.selectForExport(any(), any(), any(), anyInt())).thenReturn(rows);
        // 变量配置（宽表第一列要拿它的单位）。这里给空表 —— 第一列就退回变量名。
        TelemetryLongtermArchiveService archive = mock(TelemetryLongtermArchiveService.class);
        when(archive.listVariables()).thenReturn(List.of());
        return new TelemetryLongtermExportService(mapper, archive);
    }

    private static XSSFWorkbook readBack(byte[] bytes) throws Exception {
        return new XSSFWorkbook(new ByteArrayInputStream(bytes));
    }

    @Test
    void wideRowsFollowConfigOrderNotReturnOrder() throws Exception {
        LocalDateTime t = LocalDateTime.of(2026, 10, 10, 8, 30, 0);
        // 故意让 VAR_B 先返回，且同一时刻
        List<TelemetryLongtermSampleRow> rows = List.of(
                row(t, "VAR_B", "20"),
                row(t, "VAR_A", "10"));

        TelemetryLongtermExportRequest req = new TelemetryLongtermExportRequest();
        req.setLayout("WIDE");
        req.setVariableNames(List.of("VAR_A", "VAR_B"));
        req.setDays(List.of("2026-10-10")); // 时间范围必填：不选范围直接拒

        byte[] bytes = service(rows).exportXlsx(req);
        try (XSSFWorkbook wb = readBack(bytes)) {
            Sheet sh = wb.getSheetAt(0);
            // 宽表 = 页面上那张矩阵的形状：行是房间、列是时刻
            Row head = sh.getRow(0);
            assertEquals("房间", head.getCell(0).getStringCellValue());
            assertEquals("08:30:00", head.getCell(1).getStringCellValue(), "列头是时刻");

            assertEquals("VAR_A", sh.getRow(1).getCell(0).getStringCellValue(), "行序按配置顺序，不是返回顺序");
            assertEquals("VAR_B", sh.getRow(2).getCell(0).getStringCellValue());
            assertEquals(10.0, sh.getRow(1).getCell(1).getNumericCellValue(), 0.001, "VAR_A 的值落在第 2 列");
            assertEquals(20.0, sh.getRow(2).getCell(1).getNumericCellValue(), 0.001, "VAR_B 的值落在第 2 列");
            assertEquals(2, sh.getLastRowNum(), "同一时刻两个房间各占一行（表头 0 + 数据 2）");
        }
    }

    @Test
    void wideHighlightsExtremesLikeThePage() throws Exception {
        LocalDateTime t = LocalDateTime.of(2026, 10, 10, 8, 0, 0);
        List<TelemetryLongtermSampleRow> rows = List.of(
                row(t, "VAR_A", "10"),
                row(t.plusHours(2), "VAR_A", "30"),
                row(t.plusHours(4), "VAR_A", "20"));

        TelemetryLongtermExportRequest req = new TelemetryLongtermExportRequest();
        req.setLayout("WIDE");
        req.setVariableNames(List.of("VAR_A"));
        req.setDays(List.of("2026-10-10"));

        try (XSSFWorkbook wb = readBack(service(rows).exportXlsx(req))) {
            Sheet sh = wb.getSheetAt(0);
            Row data = sh.getRow(1);
            XSSFCellStyle maxStyle = (XSSFCellStyle) data.getCell(2).getCellStyle(); // 30
            XSSFCellStyle minStyle = (XSSFCellStyle) data.getCell(1).getCellStyle(); // 10
            assertEquals("FFFEF3C7", maxStyle.getFillForegroundColorColor().getARGBHex(), "最大值那格标黄（与页面同色）");
            assertEquals("FFDBEAFE", minStyle.getFillForegroundColorColor().getARGBHex(), "最小值那格标蓝（与页面同色）");
            assertEquals(FillPatternType.NO_FILL, data.getCell(3).getCellStyle().getFillPattern(), "中间值不上色");
        }
    }

    @Test
    void wideHighlightsBothWhenRoundedValuesTie() throws Exception {
        // 64.94 与 64.85 写进格子都是 64.9：两格都该标黄 —— 只标其中一个看着就像标错了
        LocalDateTime t = LocalDateTime.of(2026, 10, 10, 8, 0, 0);
        List<TelemetryLongtermSampleRow> rows = List.of(
                row(t, "VAR_A", "64.94"),
                row(t.plusHours(2), "VAR_A", "64.85"),
                row(t.plusHours(4), "VAR_A", "10"));

        TelemetryLongtermExportRequest req = new TelemetryLongtermExportRequest();
        req.setLayout("WIDE");
        req.setVariableNames(List.of("VAR_A"));
        req.setDays(List.of("2026-10-10"));

        try (XSSFWorkbook wb = readBack(service(rows).exportXlsx(req))) {
            Sheet sh = wb.getSheetAt(0);
            Row data = sh.getRow(1);
            assertEquals(64.9, data.getCell(1).getNumericCellValue(), 0.001);
            assertEquals(64.9, data.getCell(2).getNumericCellValue(), 0.001);
            assertEquals("FFFEF3C7",
                    ((XSSFCellStyle) data.getCell(1).getCellStyle()).getFillForegroundColorColor().getARGBHex());
            assertEquals("FFFEF3C7",
                    ((XSSFCellStyle) data.getCell(2).getCellStyle()).getFillForegroundColorColor().getARGBHex());
            assertEquals("FFDBEAFE",
                    ((XSSFCellStyle) data.getCell(3).getCellStyle()).getFillForegroundColorColor().getARGBHex());
        }
    }

    @Test
    void wideSkipsHighlightWhenOnlyOneDistinctValue() throws Exception {
        LocalDateTime t = LocalDateTime.of(2026, 10, 10, 8, 0, 0);
        List<TelemetryLongtermSampleRow> rows = List.of(
                row(t, "VAR_A", "10"),
                row(t.plusHours(2), "VAR_A", "10"),
                row(t.plusHours(4), "VAR_A", "OFF"));

        TelemetryLongtermExportRequest req = new TelemetryLongtermExportRequest();
        req.setLayout("WIDE");
        req.setVariableNames(List.of("VAR_A"));
        req.setDays(List.of("2026-10-10"));

        try (XSSFWorkbook wb = readBack(service(rows).exportXlsx(req))) {
            Sheet sh = wb.getSheetAt(0);
            Row data = sh.getRow(1);
            for (int c = 1; c <= 3; c++) {
                assertEquals(FillPatternType.NO_FILL, data.getCell(c).getCellStyle().getFillPattern(),
                        "只有一个数值、或全是同一个值时不上色");
            }
        }
    }

    @Test
    void wideRoundsToOneDecimalAndKeepsNonNumericAsText() throws Exception {
        LocalDateTime t = LocalDateTime.of(2026, 10, 10, 8, 30, 0);
        List<TelemetryLongtermSampleRow> rows = List.of(
                row(t, "VAR_A", "64.48553"),
                row(t.plusHours(2), "VAR_A", "OFF"));

        TelemetryLongtermExportRequest req = new TelemetryLongtermExportRequest();
        req.setLayout("WIDE");
        req.setVariableNames(List.of("VAR_A"));
        req.setDays(List.of("2026-10-10"));

        try (XSSFWorkbook wb = readBack(service(rows).exportXlsx(req))) {
            Sheet sh = wb.getSheetAt(0);
            Row data = sh.getRow(1);
            assertEquals(64.5, data.getCell(1).getNumericCellValue(), 0.001, "数值取一位小数，且写成数字格");
            assertEquals("OFF", data.getCell(2).getStringCellValue(), "非数值原样留成文本");
        }
    }

    @Test
    void longTableWritesOneRowPerSample() throws Exception {
        LocalDateTime t1 = LocalDateTime.of(2026, 10, 10, 8, 30, 0);
        LocalDateTime t2 = LocalDateTime.of(2026, 10, 10, 8, 31, 0);
        TelemetryLongtermSampleRow a = row(t1, "VAR_A", "10");
        a.setNumericValue(10.0);
        TelemetryLongtermSampleRow b = row(t2, "VAR_B", "OFF");

        TelemetryLongtermExportRequest req = new TelemetryLongtermExportRequest();
        req.setLayout("LONG");
        req.setVariableNames(List.of()); // 空 = 全部，服务端应传 null
        req.setDays(List.of("2026-10-10"));

        byte[] bytes = service(List.of(a, b)).exportXlsx(req);
        try (XSSFWorkbook wb = readBack(bytes)) {
            Sheet sh = wb.getSheetAt(0);
            Row head = sh.getRow(0);
            assertEquals("变量", head.getCell(1).getStringCellValue(), "长表第 2 列是「变量」");

            Row r1 = sh.getRow(1);
            assertEquals("VAR_A", r1.getCell(1).getStringCellValue());
            assertEquals(10.0, r1.getCell(2).getNumericCellValue(), 1e-9, "值列写入数值");
            assertEquals("10", r1.getCell(3).getStringCellValue(), "原始值列写入原始串");

            Row r2 = sh.getRow(2);
            assertEquals("VAR_B", r2.getCell(1).getStringCellValue());
            assertEquals("OFF", r2.getCell(3).getStringCellValue());

            assertEquals(2, sh.getLastRowNum(), "表头 1 行 + 两条采样");
        }
    }

    @Test
    void missingTimeRangeIsRejected() {
        // 用户口径：不选时间范围不允许导出 —— 不默认导今天，也不整表导出
        TelemetryLongtermExportRequest req = new TelemetryLongtermExportRequest();
        req.setLayout("LONG");
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> service(List.of()).exportXlsx(req));
    }

    @Test
    void multiDayLongExportAddsDateColumnAndStacksRowsInTimeOrder() throws Exception {
        LocalDateTime d1 = LocalDateTime.of(2026, 10, 1, 8, 0, 0);
        LocalDateTime d2 = LocalDateTime.of(2026, 10, 2, 8, 0, 0);
        List<TelemetryLongtermSampleRow> rows = List.of(
                row(d1, "VAR_A", "11"),
                row(d2, "VAR_A", "22"));

        TelemetryLongtermExportRequest req = new TelemetryLongtermExportRequest();
        req.setLayout("LONG");
        req.setDays(List.of("2026-10-02", "2026-10-01")); // 乱序传入也要能用

        byte[] bytes = service(rows).exportXlsx(req);
        try (XSSFWorkbook wb = readBack(bytes)) {
            Sheet sh = wb.getSheetAt(0);
            Row head = sh.getRow(0);
            assertEquals("日期", head.getCell(0).getStringCellValue(), "多天时加一列日期");
            assertEquals("时刻", head.getCell(1).getStringCellValue());
            assertEquals("变量", head.getCell(2).getStringCellValue());

            // 连续一张表：两天的行从上往下接排（表头 1 行 + 2 条）
            // 列序：日期(0) 时刻(1) 变量(2) 值(3) 原始值(4) 房间(5) 楼层(6)
            Row r1 = sh.getRow(1);
            assertEquals("2026-10-01", r1.getCell(0).getStringCellValue());
            assertEquals("08:00:00", r1.getCell(1).getStringCellValue());
            assertEquals("11", r1.getCell(4).getStringCellValue(), "原始值列");
            Row r2 = sh.getRow(2);
            assertEquals("2026-10-02", r2.getCell(0).getStringCellValue());
            assertEquals("22", r2.getCell(4).getStringCellValue());
            assertEquals(2, sh.getLastRowNum());
        }
    }

    @Test
    void dayListFiltersOutDaysNotSelected() throws Exception {
        // 非连续多选：取的是并集区间，落在未选中那天的行必须被筛掉
        LocalDateTime keep = LocalDateTime.of(2026, 10, 1, 8, 0, 0);
        LocalDateTime drop = LocalDateTime.of(2026, 10, 2, 8, 0, 0);
        List<TelemetryLongtermSampleRow> rows = List.of(
                row(keep, "VAR_A", "1"),
                row(drop, "VAR_A", "2"));

        TelemetryLongtermExportRequest req = new TelemetryLongtermExportRequest();
        req.setLayout("LONG");
        req.setDays(List.of("2026-10-01", "2026-10-03"));

        try (XSSFWorkbook wb = readBack(service(rows).exportXlsx(req))) {
            Sheet sh = wb.getSheetAt(0);
            assertEquals(1, sh.getLastRowNum(), "只留选中那天的行");
            // 筛完只剩一天 → 不拆日期列，第 1 列仍是完整时间
            assertEquals("2026-10-01 08:00:00", sh.getRow(1).getCell(0).getStringCellValue());
        }
    }

    @Test
    void multiDayWideStacksOneBlockPerDay() throws Exception {
        LocalDateTime d1 = LocalDateTime.of(2026, 10, 1, 8, 0, 0);
        LocalDateTime d2 = LocalDateTime.of(2026, 10, 2, 9, 0, 0);
        List<TelemetryLongtermSampleRow> rows = List.of(
                row(d1, "VAR_A", "11"),
                row(d2, "VAR_A", "22"));

        TelemetryLongtermExportRequest req = new TelemetryLongtermExportRequest();
        req.setLayout("WIDE");
        req.setVariableNames(List.of("VAR_A"));
        req.setDays(List.of("2026-10-01", "2026-10-02"));

        try (XSSFWorkbook wb = readBack(service(rows).exportXlsx(req))) {
            Sheet sh = wb.getSheetAt(0);
            // 第一天：日期行 + 表头 + 1 行数据；空一行；第二天同样
            assertEquals("日期", sh.getRow(0).getCell(0).getStringCellValue());
            assertEquals("2026-10-01", sh.getRow(0).getCell(1).getStringCellValue());
            assertEquals("房间", sh.getRow(1).getCell(0).getStringCellValue());
            assertEquals("08:00:00", sh.getRow(1).getCell(1).getStringCellValue(), "列头是时刻");
            assertEquals("VAR_A", sh.getRow(2).getCell(0).getStringCellValue(), "行是房间");
            assertEquals(11.0, sh.getRow(2).getCell(1).getNumericCellValue(), 0.001);
            assertEquals("日期", sh.getRow(4).getCell(0).getStringCellValue(), "第二天另起一段（中间空一行）");
            assertEquals("2026-10-02", sh.getRow(4).getCell(1).getStringCellValue());
            assertEquals("09:00:00", sh.getRow(5).getCell(1).getStringCellValue());
            assertEquals(22.0, sh.getRow(6).getCell(1).getNumericCellValue(), 0.001);
            assertEquals(6, sh.getLastRowNum());
        }
    }
}
