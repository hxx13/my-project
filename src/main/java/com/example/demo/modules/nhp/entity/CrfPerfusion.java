package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** NHP entity mapped to `crf_perfusion`. */
@Data
public class CrfPerfusion {
    private Long id;
    private String perfCode;
    private Long donorSubjectId;
    private Long recipientSubjectId;
    private String perfMode;
    private String perfusate;
    private LocalDateTime perfStart;
    private BigDecimal perfDuration;
    private BigDecimal liverColdIschemia;
    private BigDecimal vascResistance;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
