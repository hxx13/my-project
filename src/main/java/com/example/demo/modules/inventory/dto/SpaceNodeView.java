package com.example.demo.modules.inventory.dto;

import lombok.Data;

import java.util.List;

@Data
public class SpaceNodeView {
    private Long id;
    private Long parentId;
    private String name;
    private String type;
    private String icon;
    private Double posX;
    private Double posY;
    private Double width;
    private Double height;
    private Integer sortOrder;
    private String code;
    private Integer itemCount;
    private List<SpaceNodeView> children;
}
