package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** NHP entity mapped to `crf_test_result`. */
@Data
public class CrfTestResult {
    private Long id;
    private String resultCode;
    private Long testOrderId;
    private String assayCode;
    private String conceptCode;
    private String valueString;
    private BigDecimal valueDecimal;
    private String valueText;
    private String qcStatus;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
