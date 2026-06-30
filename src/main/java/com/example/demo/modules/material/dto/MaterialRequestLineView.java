package com.example.demo.modules.material.dto;

import lombok.Data;

@Data
public class MaterialRequestLineView {
    private Long id;
    private Long itemId;
    private Integer qty;
    private String snapshotName;
    private Integer fulfilledQty;
    /** 物品封面（来自 material_item，便于客户端展示预览图） */
    private String coverUrl;
}
