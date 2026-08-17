package com.example.demo.modules.inventory.dto;

import lombok.Data;

@Data
public class ScanCommitResult {
    private Long sessionId;
    private Integer scannedCount;
    private Integer foundCount;
    private Integer newCount;
    private Integer missingCount;
}
