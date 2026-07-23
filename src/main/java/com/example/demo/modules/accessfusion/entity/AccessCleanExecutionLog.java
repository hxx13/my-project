package com.example.demo.modules.accessfusion.entity;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class AccessCleanExecutionLog {
    private Long id;
    private Long statsPullTaskId;
    private Long cleanRuleProfileId;
    private String executionDate;
    /** 清洗覆盖的自然日（与 execution_date 一致时表示按日分段） */
    private String coverageDay;
    private String channelCode;
    private String windowStart;
    private String windowEnd;
    private String channelCodesJson;
    private String status;
    private Integer totalScanned;
    private Integer includedCount;
    private Integer excludedCount;
    private Integer reviewCount;
    private String configSnapshotJson;
    private String noteText;
    private String createdAt;
    private String updatedAt;
}
