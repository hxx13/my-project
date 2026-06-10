package com.example.demo.modules.smartsheet.dto;

import lombok.Data;

@Data
public class SmartsheetUpdateRequest {
    private String name;
    private String description;
    private String layoutMode;
    private String columnsConfig;
    private String rowEntitySource;
}
