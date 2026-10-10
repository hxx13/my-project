package com.example.demo.modules.telemetry.dto.longterm;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 某一天的矩阵表：列 = **平分槽位**（升序，只列当天真有数据的槽），行 = 变量。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetryLongtermDayMatrixDto {

    /** 日期（{@code yyyy-MM-dd}） */
    private String day;

    /** 这一天按采样间隔平分成多少个槽（间隔 2h → 12） */
    private int slotCount;

    /** 有数据的槽位（升序）；每行按此下标对齐 */
    private List<TelemetryLongtermSlotDto> columns;

    /** 变量行（只含当天真有数据的变量，顺序 = 配置里的排序） */
    private List<TelemetryLongtermMatrixRowDto> rows;
}
