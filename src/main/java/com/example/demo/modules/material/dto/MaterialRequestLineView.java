package com.example.demo.modules.material.dto;

import lombok.Data;

@Data
public class MaterialRequestLineView {
    private Long id;
    private Long itemId;
    private Integer qty;
    private String snapshotName;
    private Integer fulfilledQty;
}
