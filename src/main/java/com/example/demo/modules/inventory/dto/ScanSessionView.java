package com.example.demo.modules.inventory.dto;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ScanSessionView {
    private Long id;
    private Long spaceId;
    private String operatorUserId;
    private String status;
    private LocalDateTime startedAt;
    private LocalDateTime committedAt;
    private Integer scannedCount;
    private Integer foundCount;
    private Integer newCount;
    private Integer missingCount;
}
