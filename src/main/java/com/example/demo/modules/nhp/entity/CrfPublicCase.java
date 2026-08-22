package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP entity mapped to `crf_public_case`. */
@Data
public class CrfPublicCase {
    private Long id;
    private String pubcaseCode;
    private String sourceRef;
    private String species;
    private String organ;
    private String summary;
    private Long importBatchId;
    private Boolean active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
