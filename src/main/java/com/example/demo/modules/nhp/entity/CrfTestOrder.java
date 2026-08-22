package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** NHP entity mapped to `crf_test_order`. */
@Data
public class CrfTestOrder {
    private Long id;
    private String testCode;
    private String labId;
    private String panelVersion;
    private String testItems;
    private BigDecimal tatHours;
    private String status;
    private Long sampleId;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
