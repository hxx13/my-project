package com.example.demo.modules.aup.dto;

import lombok.Data;

/** 码表引用链中的单个引用。 */
@Data
public class DictUsageRef {
    /** TEMPLATE_FIELD（模板字段） / FIELD_DEF（字段字典） */
    private String refType;
    private String fieldKey;
    private String fieldLabel;
    private Long templateId;
    private String formKey;
    private String templateName;
    private Integer templateVersion;
    /** form_field.dict_version（可能为 null=跟随最新） */
    private Integer dictVersion;
    private Long fieldDefId;
}
