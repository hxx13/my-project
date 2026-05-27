package com.example.demo.modules.twin.entity;

import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
public class TwinFreezeConfigRow {
    private Integer id;
    private Integer enabled;
    private String freezeTime;
    private String secondFreezeTime;
    private Integer secondFreezeAutoSignoutEnabled;
    /** 每日豁免回收任务收回豁免后是否自动签离 */
    private Integer dailyExemptRevokeAutoSignoutEnabled;
    private String timezone;
    private String updatedBy;
    private LocalDateTime updatedAt;
    private String lastAutoFreezeRunDate;
}
