package com.example.demo.modules.aup.dto;

import lombok.Data;

/** 模板状态机审核请求（reject 意见必填）。 */
@Data
public class TemplateReviewRequest {
    private String comment;
}
