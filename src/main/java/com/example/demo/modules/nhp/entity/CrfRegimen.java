package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** NHP entity mapped to `crf_regimen`. */
@Data
public class CrfRegimen {
    private Long id;
    private String regimenCode;
    private Long txId;
    private String immuCode;
    private Integer immuVersion;
    private String regimenPhase;
    private LocalDate regimenStart;
    private String changeReason;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
