package com.example.demo.modules.twin.dto;

import lombok.Data;

import java.util.List;

/** 扫码弹窗公告包（多条，前端翻页） */
@Data
public class ScanPopupAnnouncementBundleDTO {
    private boolean enabled;
    private boolean showNoticeEveryScan;
    private int total;
    private List<ScanPopupAnnouncementItemDTO> items;
}
