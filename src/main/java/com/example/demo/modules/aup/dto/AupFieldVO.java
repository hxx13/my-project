package com.example.demo.modules.aup.dto;

import lombok.Data;

import java.time.LocalDateTime;

/** 字段字典视图。options/config/showWhen 解析为 Object。 */
@Data
public class AupFieldVO {
    private Long id;
    private String fieldCode;
    private String label;
    private String type;
    private String role;
    private String dictKey;
    private Object options;
    private Boolean required;
    private String description;
    private Object config;
    private Object showWhen;
    private Long folderId;
    private String status;
    private LocalDateTime frozenAt;
    private String frozenBy;
    private Integer sortOrder;
    private Integer refCount;
}
