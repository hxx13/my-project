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
}
