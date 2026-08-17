package com.example.demo.modules.aup.dto;

import lombok.Data;

/** 字典分页列表项（GET /aup-dict）。 */
@Data
public class DictListItemVO {
    private String dictKey;
    private String name;
    /** 分类（分组/文件夹；NULL=未分类） */
    private String category;
    private Integer itemCount;
}
