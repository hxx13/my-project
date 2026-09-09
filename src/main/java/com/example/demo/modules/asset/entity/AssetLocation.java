package com.example.demo.modules.asset.entity;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 资产存放地点树节点。
 * children / directCount / totalCount 非数据库列，仅用于树构建结果。
 */
@Data
public class AssetLocation {
    private Long id;
    private Long parentId;
    private String name;
    private Integer sortOrder;
    private Integer deleted;
    /** 地点图标 emoji */
    private String icon;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    /** 子节点（buildTree 填充） */
    private List<AssetLocation> children;
    /** 直属资产数（buildTree 填充） */
    private Integer directCount;
    /** 含子树的资产总数（buildTree 填充） */
    private Integer totalCount;
}
