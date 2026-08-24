package com.example.demo.modules.aup.dto;

import lombok.Data;

/** 修改字段字典请求（PUT /api/aup-field/{id}，仅 DRAFT 可改）。 */
@Data
public class AupFieldUpdateRequest {
    private String label;
    private String type;
    private String role;
    private String dictKey;
    private Object options;
    private Boolean required;
    private String description;
    private Object config;
    private Object showWhen;
    private Integer sortOrder;
}
