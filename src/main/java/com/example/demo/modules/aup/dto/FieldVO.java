package com.example.demo.modules.aup.dto;

import lombok.Data;

/** 字段节点（请求/响应共用）。JSON 列 options/showWhen/config 用 Object，Service 用 Jackson 转 String。 */
@Data
public class FieldVO {
    private Long id;
    private String fieldKey;
    private String label;
    /** 说明文字（可空，支持富文本 HTML） */
    private String description;
    private String type;
    /** 选项 JSON：[{value,label}] 或 字符串数组 */
    private Object options;
    private String dictKey;
    private Boolean required;
    private Object showWhen;
    private Integer sortOrder;
    private Object config;
}
