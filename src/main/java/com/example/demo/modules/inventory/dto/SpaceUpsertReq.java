package com.example.demo.modules.inventory.dto;

import lombok.Data;

@Data
public class SpaceUpsertReq {
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
    /** 是否清空几何坐标（posX/posY/width/height 置 null） */
    private Boolean clearGeometry;
    /** 是否移回根节点（parentId 置 null） */
    private Boolean moveToRoot;
}
