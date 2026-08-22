package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

/** NHP entity mapped to `crf_transplant`. */
@Data
public class CrfTransplant {
    private Long id;
    private String txCode;
    private Long donorSubjectId;
    private Long recipientSubjectId;
    private Long xmId;
    private String txOrgan;
    private String procedureType;
    private LocalDate txDate;
    private BigDecimal coldIschemiaMin;
    private BigDecimal warmIschemiaMin;
    private LocalTime reperfusionTime;
    private String inductionRegimen;
    private String maintenanceRegimen;
    private Long parentTxId;
    private String status;
    private Boolean active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
