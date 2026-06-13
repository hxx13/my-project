package com.example.demo.modules.reportform.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ReportFormDefinition {
    private Long id;
    private String name;
    private String description;
    private String status;
    private String layoutJson;
    private String themeJson;
    private String fillPolicyJson;
    private String permissionJson;
    private String scheduleJson;
    private String wordTemplateIdsJson;
    private String versionSnapshotsJson;
    private String createdBy;
    private String updatedBy;
    private String publishedBy;
    private LocalDateTime publishedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
