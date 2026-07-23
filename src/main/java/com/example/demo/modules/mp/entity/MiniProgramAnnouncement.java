package com.example.demo.modules.mp.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class MiniProgramAnnouncement {
    private String id;
    private String title;
    private String summary;
    private String bodyHtml;
    private LocalDateTime publishedAt;
    private Integer enabled;
    private Integer sortOrder;
    private String createdBy;
    private LocalDateTime updatedAt;
}
