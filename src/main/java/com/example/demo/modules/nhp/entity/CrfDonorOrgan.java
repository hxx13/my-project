package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** NHP entity mapped to `crf_donor_organ`. */
@Data
public class CrfDonorOrgan {
    private Long id;
    private Long donorSubjectId;
    private String organCode;
    private BigDecimal donorWeight;
    private String organHistologyBaseline;
    private String organFunctionGrade;
    private String releaseDecision;
    private String releaseCriteriaVer;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
