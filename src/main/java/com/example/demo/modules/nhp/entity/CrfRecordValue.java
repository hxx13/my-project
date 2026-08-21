package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** NHP 字段值（EAV 权威存储，按 data_type 只用其一列）。 */
@Data
public class CrfRecordValue {
    private Long id;
    private Long recordId;
    private Long fieldId;
    private Long fieldVersionId;
    private String valueString;
    private String valueText;
    private Integer valueInt;
    private BigDecimal valueDecimal;
    private LocalDate valueDate;
    private LocalDateTime valueDatetime;
    private Boolean valueBool;
    private Long codelistItemId;
    private Long valueFileId;
    private String valueJson;
    /** MANUAL/IMPORT/PAPER */
    private String entryMode;
    /** 1=一录 2=二录（双录入） */
    private Integer entryPass;
    private String sourceRef;
    private LocalDateTime collectedAt;
    private String createdBy;
    private LocalDateTime createdAt;
    private String updatedBy;
    private LocalDateTime updatedAt;
}
