package com.example.demo.modules.twin.scan.delay.dto;

import lombok.Data;

import java.util.List;

@Data
public class ScanDelayOptionDTO {
    private Long id;
    private String roomId;
    private String roomName;
    private String optionLabel;
    private String buttonLabel;
    private String displayStart;
    private String displayEnd;
    private boolean requireApproval;
    private List<String> reviewerUserIds;
    private String exemptMode;
    private Integer durationMinutes;
    private Integer maxCount;
    private List<String> exemptRoomIds;
    private boolean enabled;
    private int sortOrder;
}
