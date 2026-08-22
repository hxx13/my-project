package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** NHP entity mapped to `crf_medication`. */
@Data
public class CrfMedication {
    private Long id;
    private String medCode;
    private Long regimenId;
    private Long anesthesiaId;
    private String drugCode;
    private BigDecimal doseValue;
    private String doseUnit;
    private String route;
    private LocalDateTime doseTime;
    private String missedFlag;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
