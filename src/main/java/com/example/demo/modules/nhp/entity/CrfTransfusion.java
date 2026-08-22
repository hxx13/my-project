package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** NHP entity mapped to `crf_transfusion`. */
@Data
public class CrfTransfusion {
    private Long id;
    private Long anesthesiaId;
    private String component;
    private BigDecimal volumeMl;
    private LocalDateTime createdAt;
}
