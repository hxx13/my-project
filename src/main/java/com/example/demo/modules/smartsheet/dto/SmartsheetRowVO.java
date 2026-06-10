package com.example.demo.modules.smartsheet.dto;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class SmartsheetRowVO {
    private Long id;
    private Long sheetId;
    private Integer rowIndex;
    private String rowEntityId;
    private String rowLabel;
    private Object cellData;     // parsed JSON object
    private Integer version;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
