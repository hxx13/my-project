package com.example.demo.modules.smartsheet.dto;

import lombok.Data;

@Data
public class SmartsheetCreateRequest {
    private String name;
    private String description;
    private String layoutMode = "table";
    private Object columnsConfig;    // JSON array, deserialized by Jackson
    private Object rowEntitySource;  // JSON object, nullable
    private Long templateId;
}
