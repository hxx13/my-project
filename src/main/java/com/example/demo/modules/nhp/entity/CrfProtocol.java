package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP entity mapped to `crf_protocol`. */
@Data
public class CrfProtocol {
    private Long id;
    private String protocolCode;
    private Integer version;
    private String title;
    private String sourceDoc;
    private Boolean active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
