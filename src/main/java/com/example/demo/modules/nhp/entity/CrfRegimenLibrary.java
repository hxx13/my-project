package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP entity mapped to `crf_regimen_library`. */
@Data
public class CrfRegimenLibrary {
    private Long id;
    private String immuCode;
    private Integer version;
    private String doseRule;
    private String targetRange;
    private String status;
    private Boolean active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
