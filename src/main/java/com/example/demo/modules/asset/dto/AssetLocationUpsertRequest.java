package com.example.demo.modules.asset.dto;

import lombok.Data;

/** 地点节点新增/更新请求 */
@Data
public class AssetLocationUpsertRequest {
    private String name;
    private Long parentId;
    private Integer sortOrder;
    /** 地点图标 emoji，null = 不改 */
    private String icon;
}
