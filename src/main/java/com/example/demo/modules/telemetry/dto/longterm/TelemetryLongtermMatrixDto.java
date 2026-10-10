package com.example.demo.modules.telemetry.dto.longterm;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 长期归档的**按天矩阵**：一天一张表，**行=变量、列=时间点**。
 *
 * <p>为什么不是扁平分页列表：用户看的是「某变量这些时刻的值」，扁平列表得自己在心里对齐时间列；
 * 矩阵把时间点提到列上，一眼能看出某个变量当天怎么走的。列用数组（与 {@code times} 按下标对齐）
 * 而不是 Map，省一半报文体积。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetryLongtermMatrixDto {

    /** 有数据的日期（{@code yyyy-MM-dd}），**新的在前** */
    private List<String> days;

    /** 每天的表格 */
    private List<TelemetryLongtermDayMatrixDto> dayTables;
}
