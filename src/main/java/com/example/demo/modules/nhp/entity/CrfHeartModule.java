package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** NHP entity mapped to `crf_heart_module`. */
@Data
public class CrfHeartModule {
    private Long id;
    private String heartCode;
    private Long txId;
    private String graftType;
    private BigDecimal graftFuncScore;
    private BigDecimal echoEf;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
