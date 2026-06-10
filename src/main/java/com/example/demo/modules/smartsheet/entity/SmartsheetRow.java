package com.example.demo.modules.smartsheet.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class SmartsheetRow {
    private Long id;
    private Long sheetId;
    private Integer rowIndex;
    private String rowEntityId;
    private String rowLabel;
    private String cellData;     // JSON string
    private Integer version;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
