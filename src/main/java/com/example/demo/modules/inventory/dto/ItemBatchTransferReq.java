package com.example.demo.modules.inventory.dto;

import lombok.Data;

import java.util.List;

/**
 * 物品批量调拨请求体。
 */
@Data
public class ItemBatchTransferReq {
    private List<Long> ids;
    private Long spaceId;
}
