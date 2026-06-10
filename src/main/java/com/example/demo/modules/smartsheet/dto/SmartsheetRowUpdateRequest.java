package com.example.demo.modules.smartsheet.dto;

import lombok.Data;

@Data
public class SmartsheetRowUpdateRequest {
    private String rowLabel;
    private Object cellData;     // JSON object, deserialized by Jackson
    private Integer version;
}
