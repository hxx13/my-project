package com.example.demo.modules.inventory.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 物品留痕视图，与 {@link com.example.demo.modules.inventory.entity.InvItemLog} 同字段。
 */
@Data
public class ItemLogView {
    private Long id;
    private Long itemId;
    /** CREATE/UPDATE/TRANSFER/SCAN_FOUND/SCAN_NEW/SCAN_MISSING/RETIRE */
    private String logType;
    private Long fromSpaceId;
    private Long toSpaceId;
    private String operatorUserId;
    /** 操作人展示名（UserDisplayNameService） */
    private String operatorName;
    private String remark;
    private String extra;
    private LocalDateTime createdAt;
}
