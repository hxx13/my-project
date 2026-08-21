package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 字段字典变更审计（ALCOA+，只追加）。 */
@Data
public class CrfDictChangeLog {
    private Long id;
    /** field/codelist/form */
    private String entity;
    private Long entityId;
    private String changeType;
    private String beforeJson;
    private String afterJson;
    private String operator;
    private LocalDateTime createdAt;
}
