package com.example.demo.modules.accessfusion.entity;

import lombok.Data;

@Data
public class AccessDoorRule {
    private Long id;
    private Long ruleSetId;
    /** 统计拉取任务 ID，0 表示全局默认规则 */
    private Long statsTaskId;
    private String channelCode;
    private String channelName;
    private String doorMode;
    private String pairedEntryChannel;
    private String pairedExitChannel;
    private String zoneId;
    private String campus;
    private String floor;
    private Integer debounceSeconds;
    private Integer maxSwipesPerMinute;
    private Integer enabled;
}
