package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** NHP entity mapped to `crf_drug_level`. */
@Data
public class CrfDrugLevel {
    private Long id;
    private String levelCode;
    private Long regimenId;
    private Long txId;
    private String drugCode;
    private BigDecimal troughLevel;
    private String targetRange;
    private String adjEvent;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
