package com.example.demo.modules.reportform.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ReportFormSubmission {
    private Long id;
    private Long formId;
    private Long userId;
    /** 个人多份填报时的子文件名称；空字符串表示默认单份 */
    private String instanceLabel;
    private String status;
    private String fieldValuesJson;
    private Integer version;
    private LocalDateTime submittedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
