package com.example.demo.modules.telemetry.dto.archive;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class TelemetryChartGroupDto {
    private Long id;
    private String name;
    private String description;
    private List<String> variableNames;
    /** 来自 watchlist 的变量元数据（展示名/楼层/指标类型等） */
    private List<TelemetryChartGroupVariableMetaDto> variableMetadata;
    private String layoutMode;
    private String source;
    private Integer sortOrder;
    private String createTime;
    private String updateTime;
}
