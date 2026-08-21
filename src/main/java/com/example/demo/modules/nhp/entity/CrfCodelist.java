package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 码表（含版本+冻结）。 */
@Data
public class CrfCodelist {
    private Long id;
    /** 码表编码 BREED/EDIT/FARM/ORG… */
    private String code;
    private String name;
    private Integer version;
    /** DRAFT/ACTIVE(存量)/PENDING_REVIEW/FROZEN/ARCHIVED/RETIRED — 冻结后改值须新建版本 */
    private String status;
    private Boolean active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    /** 被字段引用数（列表接口填充，非表列） */
    private Integer refCount;
}
