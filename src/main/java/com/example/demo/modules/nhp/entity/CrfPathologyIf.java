package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP entity mapped to `crf_pathology_if`. */
@Data
public class CrfPathologyIf {
    private Long id;
    private Long pathologyId;
    private String markerCode;
    private String deposit;
    private LocalDateTime createdAt;
}
