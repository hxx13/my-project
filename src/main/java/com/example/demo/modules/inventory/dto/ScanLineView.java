package com.example.demo.modules.inventory.dto;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ScanLineView {
    private Long id;
    private String rfidCode;
    private Long matchedItemId;
    private String lineType;
    private LocalDateTime scannedAt;
}
