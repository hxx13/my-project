package com.example.demo.modules.aup.dto;

import lombok.Data;

/**
 * 组长审核请求：approve 通过进格式审查 / return 退回申请人（须带意见）。
 */
@Data
public class PiReviewRequest {
    /** approve | return */
    private String action;
    /** 退回意见（return 时必填） */
    private String comment;
}
