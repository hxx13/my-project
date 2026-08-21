package com.example.demo.modules.portal.dto;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class PortalContentView {
    private Long id;
    private String contentType;
    private Long categoryId;
    private String categoryName;
    private String title;
    private String summary;
    private String coverUrl;
    private String contentHtml;
    private String extensionJson;
    private String status;
    private Integer sortOrder;
    private LocalDateTime publishedAt;
    private String createdBy;
    /** 创建人展示名（UserDisplayNameService；createdBy 仍为技术 userId） */
    private String createdByName;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
