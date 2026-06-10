package com.example.demo.modules.smartsheet.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class SmartsheetDefinition {
    private Long id;
    private String name;
    private String description;
    private String layoutMode;       // matrix | table | checklist | calendar
    private String columnsConfig;    // JSON string (MyBatis maps to/from JSON column)
    private String rowEntitySource;  // JSON string, nullable
    private Long templateId;
    private Long createdBy;
    private Long updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
