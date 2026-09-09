package com.example.demo.modules.asset.dto;

import lombok.Data;

/** 地点节点新增/更新请求 */
@Data
public class AssetLocationUpsertRequest {
    private String name;
    private Long parentId;
    private Integer sortOrder;
}
