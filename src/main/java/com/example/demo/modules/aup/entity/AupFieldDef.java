package com.example.demo.modules.aup.entity;

import lombok.Data;
import java.time.LocalDateTime;

/** AUP 字段字典层字段定义（原子域引用的最小单元）。字段不做版本化。 */
@Data
public class AupFieldDef {
    private Long id;
    /** 稳定编码，全局唯一 */
    private String fieldCode;
    private String label;
    private String type;
    /** 字段角色 VALUE/DERIVED/PK/FK（对齐 cage/NHP），决定只读/自动取值/主外键 */
    private String role;
    /** 码表引用（与 options 二选一） */
    private String dictKey;
    /** 内联选项 JSON */
    private String options;
    private Boolean required;
    private String description;
    /** 与 form_field.config 同构 JSON */
    private String config;
    private String showWhen;
    private Long folderId;
    /** DRAFT / PENDING_REVIEW / PUBLISHED / RETIRED */
    private String status;
    private LocalDateTime frozenAt;
    private String frozenBy;
    private Integer sortOrder;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
