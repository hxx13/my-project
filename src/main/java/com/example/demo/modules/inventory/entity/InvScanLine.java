package com.example.demo.modules.inventory.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class InvScanLine {
    private Long id;
    private Long sessionId;
    private String rfidCode;
    private Long matchedItemId;
    /** IN_PLACE=在册 / ELSEWHERE=异地 / NEW=新发现 */
    private String lineType;
    private LocalDateTime scannedAt;
}
