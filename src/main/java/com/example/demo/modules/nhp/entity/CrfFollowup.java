package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** NHP entity mapped to `crf_followup`. */
@Data
public class CrfFollowup {
    private Long id;
    private String fuCode;
    private Long txId;
    private String timepointCode;
    private Long visitInstanceId;
    private BigDecimal clinicalScore;
    private String regimenChange;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
