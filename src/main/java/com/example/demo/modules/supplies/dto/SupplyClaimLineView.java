package com.example.demo.modules.supplies.dto;

import lombok.Data;

@Data
public class SupplyClaimLineView {
    private Long id;
    private Long itemId;
    private Integer qty;
    private String snapshotName;
    private Integer fulfilledQty;
}
