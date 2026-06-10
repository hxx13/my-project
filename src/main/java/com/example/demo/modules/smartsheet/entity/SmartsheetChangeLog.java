package com.example.demo.modules.smartsheet.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class SmartsheetChangeLog {
    private Long id;
    private Long sheetId;
    private Long rowId;
    private String columnKey;
    private String oldValue;
    private String newValue;
    private Long changedBy;
    private LocalDateTime changedAt;
}
