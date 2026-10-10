package com.example.demo.modules.telemetry.dto.longterm;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 长期归档导出请求。
 *
 * <p>时间范围**必填**（三选一，优先级：{@code days} → {@code month} → {@code from/to}）——
 * 用户口径：不选时间范围不允许导出（不默认导今天，避免误导出整表）。
 *
 * <p>形式：{@code layout} 决定表格形态（LONG 长表 / WIDE 宽表）；
 * {@code form} 决定产出物（TABLE=Excel / CURVE=A4 纵向 PDF 曲线）。
 */
@Data
public class TelemetryLongtermExportRequest {
    /** "LONG" / "WIDE"，大小写不敏感，其余按 LONG 处理 */
    private String layout;
    /** "TABLE" / "CURVE"，大小写不敏感，其余按 TABLE 处理 */
    private String form;
    /** 精确选中的日期（yyyy-MM-dd），可多选；非空时优先于 month 与 from/to */
    private List<String> days;
    /** 只导出这些变量；为空/空表 = 全部 */
    private List<String> variableNames;
    /** 形如 2026-10；非空时优先于 from/to */
    private String month;
    private LocalDateTime from;
    private LocalDateTime to;
}
