package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** NHP entity mapped to `crf_crossmatch`. */
@Data
public class CrfCrossmatch {
    private Long id;
    private String xmCode;
    private Long donorSubjectId;
    private Long recipientSubjectId;
    private String cdcXmResult;
    private String flowXmResult;
    private String adccResult;
    private BigDecimal pairingScore;
    private String pairingDecision;
    private String decisionRationale;
    private String status;
    private Boolean active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
