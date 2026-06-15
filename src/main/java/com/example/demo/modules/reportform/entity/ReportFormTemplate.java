package com.example.demo.modules.reportform.entity;

import lombok.Data;
import java.time.LocalDateTime;

/** 发布模板缓存 — 源文件删除后模板仍然存活 */
@Data
public class ReportFormTemplate {
    private Long id;
    private String name;
    private String description;
    private Boolean isTemplate = true;
    private Boolean shared = false;
    private String layoutJson;
    private String themeJson;
    private String fillPolicyJson;
    private String permissionJson;
    private String scheduleJson;
    private String wordTemplateIdsJson;
    private String versionSnapshotsJson;
    private String createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
