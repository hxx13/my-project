package com.example.demo.modules.aup.dto;

import lombok.Data;

/** 字典分页列表项（GET /aup-dict）。 */
@Data
public class DictListItemVO {
    private Long id;
    private String dictKey;
    private String name;
    /** 分类（分组/文件夹；NULL=未分类） */
    private String category;
    private Integer version;
    private String status;
    private Long folderId;
    /** LOCAL/EXTERNAL（外部引用码表头） */
    private String source;
    /** 外部引用类型：projectGroup/ANIMAL_BREED/ANIMAL_STRAIN */
    private String sourceRef;
    private Integer itemCount;
    private Integer refCount;
    private Integer versionCount;
}
