package com.example.demo.modules.smartsheet.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.Map;

@Data
public class SmartsheetDefinitionVO {
    private Long id;
    private String name;
    private String description;
    private String layoutMode;
    private Object columnsConfig;    // parsed JSON array (deserialized by Jackson)
    private Object rowEntitySource;  // parsed JSON object, nullable
    private String templateId;
    private Long createdBy;
    private Long updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private Integer rowLimit;
    private Map<String, Object> themeConfig;
    private Boolean isTemplate;
    private int rowCount;
}
