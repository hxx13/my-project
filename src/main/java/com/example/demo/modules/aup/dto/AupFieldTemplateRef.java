package com.example.demo.modules.aup.dto;

import lombok.Data;

/** 引用某字段编码的原子域模板（字段域 usage 详情）。 */
@Data
public class AupFieldTemplateRef {
    private Long templateId;
    private String formKey;
    private String templateName;
    private Integer templateVersion;
    private String kind;
    private Long fieldId;
    private String fieldKey;
    private String fieldLabel;
}
