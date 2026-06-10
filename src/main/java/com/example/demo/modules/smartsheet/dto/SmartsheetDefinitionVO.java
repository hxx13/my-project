package com.example.demo.modules.smartsheet.dto;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class SmartsheetDefinitionVO {
    private Long id;
    private String name;
    private String description;
    private String layoutMode;
    private Object columnsConfig;    // parsed JSON array (deserialized by Jackson)
    private Object rowEntitySource;  // parsed JSON object, nullable
    private Long templateId;
    private Long createdBy;
    private Long updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
