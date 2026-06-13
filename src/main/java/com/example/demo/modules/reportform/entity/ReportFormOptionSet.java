package com.example.demo.modules.reportform.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ReportFormOptionSet {
    private Long id;
    private String name;
    private String scope;
    private Long formId;
    private String itemsJson;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
