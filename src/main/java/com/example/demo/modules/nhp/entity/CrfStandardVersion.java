package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP entity mapped to `crf_standard_version`. */
@Data
public class CrfStandardVersion {
    private Long id;
    private String standardCode;
    private String objectRef;
    private Integer version;
    private String versionNote;
    private Boolean active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
