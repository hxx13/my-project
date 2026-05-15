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
    private String timezone;
    private String updatedBy;
    private LocalDateTime updatedAt;
    private String lastAutoFreezeRunDate;
}
