package com.example.demo.modules.aup.dto;

import lombok.Data;

/** 新建字典请求（POST /aup-dict）。 */
@Data
public class DictCreateRequest {
    private String dictKey;
    private String name;
    /** 分类（分组/文件夹；NULL=未分类，迁移数据源） */
    private String category;
    /** → aup_folder(owner_type=CODELIST)；NULL=未分类 */
    private Long folderId;
}
