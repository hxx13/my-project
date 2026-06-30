package com.example.demo.modules.twin.scan.delay.entity;

import lombok.Data;

@Data
public class TwinScanDelayOption {
    private Long id;
    /** 所属载体按钮 twin_scan_delay_carrier.id */
    private Long carrierId;
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
    /** 豁免延长至当日 HH:mm（优先于 durationMinutes） */
    private String extendUntilTime;
    private Integer maxCount;
    private String exemptRoomIds;
    private Integer enabled;
    private Integer sortOrder;
}
