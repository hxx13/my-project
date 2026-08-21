package com.example.demo.modules.mp.dto;

import lombok.Data;

@Data
public class MpAnnouncementAdminView {
    private String id;
    private String title;
    private String summary;
    private String bodyHtml;
    private String contentJson;
    private String publishedAtText;
    private Integer enabled;
    private Integer sortOrder;
    private String createdBy;
    /** 创建人展示名（UserDisplayNameService） */
    private String createdByName;
}
