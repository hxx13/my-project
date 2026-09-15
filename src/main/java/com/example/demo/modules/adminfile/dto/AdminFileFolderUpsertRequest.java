package com.example.demo.modules.adminfile.dto;

import lombok.Data;

/** 文件夹新增/更新请求。null 字段表示不修改。 */
@Data
public class AdminFileFolderUpsertRequest {
    private String name;
    private Long parentId;
    private String icon;
}
