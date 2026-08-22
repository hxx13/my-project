package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP entity mapped to `crf_pathology_ihc`. */
@Data
public class CrfPathologyIhc {
    private Long id;
    private Long pathologyId;
    private String markerCode;
    private String panelVersion;
    private String result;
    private LocalDateTime createdAt;
}
