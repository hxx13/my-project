package com.example.demo.modules.aup.dto;

import lombok.Data;

/** 新建草稿版本请求（POST /aup-template）。 */
@Data
public class TemplateCreateRequest {
    private String formKey;
    private String name;
}
