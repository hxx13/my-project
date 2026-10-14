package com.example.demo.modules.dahua.entity;

import lombok.Data;

/** 监控（视频通道）分类树节点。parentId = 0 为根。 */
@Data
public class DahuaVideoChannelCategory {
    private Long id;
    private Long parentId;
    private String name;
    private Integer sortOrder;
    private String createdAt;
    /** 非持久化：挂在本节点下的通道数（仅直属，列表展示用） */
    private Integer channelCount;
}
