package com.example.demo.modules.inventory.dto;

import lombok.Data;

/**
 * 物品废弃请求体。
 */
@Data
public class ItemRetireReq {
    private String reason;
    private String remark;
}
