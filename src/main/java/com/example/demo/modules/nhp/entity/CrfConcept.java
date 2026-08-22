package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * NHP 概念/指标库：肌酐/凝血等指标只定义一次，多域 crf_field 通过 concept_code 复用。
 * 对齐 22 §2.2 / V20260821026。
 */
@Data
public class CrfConcept {
    private Long id;
    private String conceptCode;
    private String nameCn;
    private String nameEn;
    private String dataType;
    private String unit;
    private Long codelistId;
    private Boolean active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
