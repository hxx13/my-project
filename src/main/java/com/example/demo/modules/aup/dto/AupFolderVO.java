package com.example.demo.modules.aup.dto;

import lombok.Data;

import java.util.List;

/** 配置面文件夹树节点。 */
@Data
public class AupFolderVO {
    private Long id;
    private String ownerType;
    private Long parentId;
    private String name;
    private Integer sortOrder;
    private String description;
    private List<AupFolderVO> children;
}
