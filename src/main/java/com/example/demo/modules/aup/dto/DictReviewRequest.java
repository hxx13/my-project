package com.example.demo.modules.aup.dto;

import lombok.Data;

/** 码表状态机审核请求（approve/reject 共用，comment 驳回/通过意见）。 */
@Data
public class DictReviewRequest {
    private String comment;
}
