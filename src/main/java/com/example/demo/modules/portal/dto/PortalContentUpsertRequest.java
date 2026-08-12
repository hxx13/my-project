package com.example.demo.modules.portal.dto;

import lombok.Data;

@Data
public class PortalContentUpsertRequest {
    private String contentType;
    private Long categoryId;
    private String title;
    private String summary;
    private String coverUrl;
    private String contentHtml;
    private String extensionJson;
    private String status;
    private String publishedAt;
}
