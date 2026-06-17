package com.example.demo.modules.twin.scan.delay.entity;

import lombok.Data;

@Data
public class TwinScanDelayOption {
    private Long id;
    private String roomId;
    private String roomName;
    private String optionLabel;
    private String buttonLabel;
    private String displayStart;
    private String displayEnd;
    private Integer requireApproval;
    private String reviewerUserIds;
    private String exemptMode;
    private Integer durationMinutes;
    private Integer maxCount;
    private String exemptRoomIds;
    private Integer enabled;
    private Integer sortOrder;
}
