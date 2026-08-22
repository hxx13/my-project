package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** NHP entity mapped to `crf_sample_coc_event`. */
@Data
public class CrfSampleCocEvent {
    private Long id;
    private Long sampleId;
    private String handler;
    private LocalDateTime eventTime;
    private BigDecimal temperature;
    private String note;
    private LocalDateTime createdAt;
}
