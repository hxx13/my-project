package com.example.demo.modules.inventory.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class InvItemLog {
    private Long id;
    private Long itemId;
    /** CREATE/UPDATE/TRANSFER/SCAN_FOUND/SCAN_NEW/SCAN_MISSING/RETIRE */
    private String logType;
    private Long fromSpaceId;
    private Long toSpaceId;
    private String operatorUserId;
    private String remark;
    private String extra;
    private LocalDateTime createdAt;
}
