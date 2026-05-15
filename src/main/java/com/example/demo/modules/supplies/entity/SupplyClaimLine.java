package com.example.demo.modules.supplies.entity;

import lombok.Data;

@Data
public class SupplyClaimLine {
    private Long id;
    private String orderId;
    private Long itemId;
    private Integer qty;
    private String snapshotName;
    private Integer fulfilledQty;
}
