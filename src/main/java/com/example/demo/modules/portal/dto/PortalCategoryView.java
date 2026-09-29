package com.example.demo.modules.portal.dto;

import lombok.Data;

@Data
public class PortalCategoryView {
    private Long id;
    private String name;
    private String scope;
    private Long parentId;
    private Integer sortOrder;
    private Integer status;
    private String coverUrl;
    /** 该分类下未删除的内容条数。只有管理端接口会填，公开分类接口留 null */
    private Long contentCount;
}
