package com.example.demo.modules.mp.dto;

import lombok.Data;

@Data
public class MpAnnouncementAdminView {
    private String id;
    private String title;
    private String summary;
    private String bodyHtml;
    private String publishedAtText;
    private Integer enabled;
    private Integer sortOrder;
    private String createdBy;
}
