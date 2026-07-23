package com.example.demo.modules.supplies.dto;

import lombok.Data;

@Data
public class InboundSupplyRequest {
    private Long itemId;
    private Integer qty;
}
