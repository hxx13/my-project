package com.example.demo.modules.aup.dto;

import lombok.Data;

/** 字典改名请求（PUT /aup-dict/{dictKey}）；category 非空时一并更新分类。 */
@Data
public class DictRenameRequest {
    private String name;
    private String category;
    private Long folderId;
}
