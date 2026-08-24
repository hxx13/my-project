package com.example.demo.modules.aup.dto;

import lombok.Data;

/** 字段状态机审核请求（reject 意见必填）。 */
@Data
public class AupFieldReviewRequest {
    private String comment;
}
