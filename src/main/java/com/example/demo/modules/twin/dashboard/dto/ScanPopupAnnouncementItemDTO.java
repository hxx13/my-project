package com.example.demo.modules.twin.dashboard.dto;

import lombok.Data;

/** 扫码 analyze 返回的单条公告 */
@Data
public class ScanPopupAnnouncementItemDTO {
    private Long id;
    private String title;
    private String contentHtml;
    /** 公告内容更新时间（用于判断「不再弹出」是否仍有效） */
    private java.time.LocalDateTime updatedAt;
    /** 被扫码人员已选择「下次不再自动弹出」此条 */
    private Boolean autoOpenSuppressed;
}
