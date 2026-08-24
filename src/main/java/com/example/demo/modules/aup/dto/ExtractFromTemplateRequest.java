package com.example.demo.modules.aup.dto;

import lombok.Data;

/** 从已发布计划书模板反向抽取字段请求（POST /api/aup-field/actions/extract-from-template）。 */
@Data
public class ExtractFromTemplateRequest {
    private Long templateId;
    /** templateId 为空时按 formKey 解析（kind=PROTOCOL 已发布版）。 */
    private String formKey;
}
