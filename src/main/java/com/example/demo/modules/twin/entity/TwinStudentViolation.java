package com.example.demo.modules.twin.entity;

import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
public class TwinStudentViolation {
    private Long id;
    private String targetUserId;
    private String violationText;
    /** JSON array string */
    private String imageUrls;
    private Integer forbidEnter;
    private Integer maxEnterSuccess;
    private Integer enterSuccessCount;
    private Integer showNoticeEveryScan;
    private LocalDateTime expireAt;
    private String status;
    private String createdByUserId;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime clearedAt;
    private String clearedByUserId;
}
