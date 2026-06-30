package com.example.demo.modules.twin.scan.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** 被扫码人员对某条通告选择「下次不再自动弹出」 */
@Data
public class TwinScanNoticeAutoSuppress {
    private Long id;
    private String targetUserId;
    /** violation | unbound | announcement */
    private String noticeKind;
    private Long recordId;
    /** suppress 时被扫通告内容的 updated_at 快照（公告更新后失效） */
    private LocalDateTime sourceUpdatedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
