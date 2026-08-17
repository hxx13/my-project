package com.example.demo.modules.inventory.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class InvScanSession {
    private Long id;
    private Long spaceId;
    private String operatorUserId;
    /** IN_PROGRESS/COMMITTED/CANCELLED */
    private String status;
    private LocalDateTime startedAt;
    private LocalDateTime committedAt;
    private Integer scannedCount;
    private Integer foundCount;
    private Integer newCount;
    private Integer missingCount;
    private String remark;
}
