package com.example.demo.modules.aup.dto;

import lombok.Data;

/** 新建配置面文件夹请求（POST /api/aup-folder）。 */
@Data
public class AupFolderCreateRequest {
    /** CODELIST / FIELD / ATOM */
    private String ownerType;
    private Long parentId;
    private String name;
    private Integer sortOrder;
    private String description;
}
