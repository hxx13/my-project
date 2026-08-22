package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** NHP entity mapped to `crf_outcome`. */
@Data
public class CrfOutcome {
    private Long txId;
    private Integer survivalDays;
    private String endpointType;
    private String endpointCause;
    private String necropsyStatus;
    private String tissueArchive;
    private LocalDate lockDate;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
