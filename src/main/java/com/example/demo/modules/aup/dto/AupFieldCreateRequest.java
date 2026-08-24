package com.example.demo.modules.aup.dto;

import lombok.Data;

/** 新建字段字典请求（POST /api/aup-field）。 */
@Data
public class AupFieldCreateRequest {
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
    private Integer sortOrder;
}
