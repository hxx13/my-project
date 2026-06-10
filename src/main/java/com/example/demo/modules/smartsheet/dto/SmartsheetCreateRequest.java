package com.example.demo.modules.smartsheet.dto;

import lombok.Data;

@Data
public class SmartsheetCreateRequest {
    private String name;
    private String description;
    private String layoutMode = "table";
    private String columnsConfig;  // JSON string
    private String rowEntitySource; // JSON string, nullable
    private Long templateId;
}
