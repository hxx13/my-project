package com.example.demo.modules.twin.dto;

import lombok.Data;

/** 扫码 analyze 返回的单条公告 */
@Data
public class ScanPopupAnnouncementItemDTO {
    private Long id;
    private String title;
    private String contentHtml;
}
