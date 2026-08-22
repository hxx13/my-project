package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** NHP entity mapped to `crf_anesthesia`. */
@Data
public class CrfAnesthesia {
    private Long id;
    private String anesCode;
    private Long txId;
    private String anesMethod;
    private String depthMonitor;
    private BigDecimal ebl;
    private BigDecimal fluidTotal;
    private BigDecimal urineOutput;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
