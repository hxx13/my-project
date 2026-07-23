package com.example.demo.modules.accessfusion.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AccessCleanPackageItem {
    private Long id;
    private Long packageId;
    /** 最近一次写入本行的清洗批次 */
    private Long lastRunId;
    private Long swingRowId;
    private String recordId;
    private LocalDateTime swingTime;
    private String channelCode;
    private String channelName;
    private String personCode;
    private String personName;
    private String mappingUserId;
    private String departmentId;
    private String departmentName;
    private String audienceType;
    private String disposition;
    private String autoReason;
    private String manualOverride;
    private String manualVerdict;
    private String direction;
    private String directionOverride;
    private String flagsJson;
}
