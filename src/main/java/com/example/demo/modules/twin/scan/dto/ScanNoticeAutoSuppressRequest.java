package com.example.demo.modules.twin.scan.dto;

import lombok.Data;

/** 扫码端：被扫人员某条通告「下次不再自动弹出」 */
@Data
public class ScanNoticeAutoSuppressRequest {
    /** 被扫码人员 ARO user_id（非操作员） */
    private String targetUserId;
    /** violation | unbound | announcement */
    private String noticeKind;
    private Long recordId;
}
