package com.example.demo.modules.telemetry.dto.longterm;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 矩阵里的一行：一个变量在该天各时刻的值。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetryLongtermMatrixRowDto {

    private String variableName;

    /** 展示名（取配置里的导出表头，没有就退回变量名） */
    private String displayLabel;

    /** 单位（配置里补的，可能为空） */
    private String unit;

    /** 指标类型（TEMP/HUM/PRESSURE…，取自样本行）——曲线要按它画合规区间与越限参考线 */
    private String metricKindCode;

    /**
     * 这个变量映射的**房间**（取自样本行）。表格第一列显示的是它，不是变量名 ——
     * 用户看的是「哪个房间的温湿度」，变量名只是实现细节（要追溯时看行的 title 提示）。
     */
    private String roomCanonical;

    /** 与所属表的 {@code times} 按下标对齐；该时刻没采到就是 null */
    private List<String> values;
}
