package com.example.demo.modules.telemetry.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TelemetryLongtermVariableRow {
    private Long id;
    private String winccVariableName;
    private Integer sortOrder;
    private String displayLabel;
    private String unit;
    /** 所属导入分区 code；空=未分区 */
    private String bundleCode;
    /** 自定义分区 id；空=未分区 */
    private Long partitionId;
    private Boolean enabled;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
