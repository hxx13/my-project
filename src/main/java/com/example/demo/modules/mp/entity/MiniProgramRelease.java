package com.example.demo.modules.mp.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class MiniProgramRelease {
    private String id;
    private String versionCode;
    private String title;
    private String summary;
    private String bodyHtml;
    private LocalDateTime publishedAt;
    private Integer showOnLaunch;
    private String createdBy;
    private LocalDateTime updatedAt;
}
