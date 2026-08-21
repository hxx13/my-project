package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** NHP 分层参考范围（血肌酐等按种属/性别/年龄分层）。 */
@Data
public class CrfReferenceRange {
    private Long id;
    private Long fieldId;
    private String species;
    private String sex;
    private Integer ageMin;
    private Integer ageMax;
    private BigDecimal min;
    private BigDecimal max;
    private String source;
    private String version;
    private Boolean active;
    private LocalDateTime createdAt;
}
