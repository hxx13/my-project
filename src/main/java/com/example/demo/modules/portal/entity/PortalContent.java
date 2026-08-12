package com.example.demo.modules.portal.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class PortalContent {
    private Long id;
    private String contentType;
    private Long categoryId;
    private String title;
    private String summary;
    private String coverUrl;
    private String contentHtml;
    private String extensionJson;
    private String status;
    private Integer sortOrder;
    private LocalDateTime publishedAt;
    private String createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private Integer deleted;
    private LocalDateTime deletedTime;
    private String deletedBy;
    private LocalDateTime purgeAfterTime;
}
