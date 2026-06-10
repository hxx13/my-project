package com.example.demo.modules.smartsheet.dto;

import lombok.Data;

@Data
public class SmartsheetRowUpdateRequest {
    private String rowLabel;
    private String cellData;   // JSON string of cell values
    private Integer version;
}
