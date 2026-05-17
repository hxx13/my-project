package com.example.demo.modules.twin.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TwinScanPopupAnnouncement {
    private Long id;
    private String title;
    private String contentHtml;
    private Integer enabled;
    private Integer sortOrder;
    private String status;
    private LocalDateTime publishAt;
    private LocalDateTime expireAt;
    private String createdByUserId;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
