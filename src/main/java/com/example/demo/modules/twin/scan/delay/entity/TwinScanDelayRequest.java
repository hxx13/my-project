package com.example.demo.modules.twin.scan.delay.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TwinScanDelayRequest {
    private Long id;
    private String subjectUserId;
    private String cardNo;
    private String roomId;
    private Long optionId;
    private Integer durationMinutes;
    private String reviewerUserId;
    private String status;
    private String requestedBy;
    private String reviewedBy;
    private LocalDateTime reviewedAt;
    private String rejectReason;
    private LocalDateTime createdAt;
}
