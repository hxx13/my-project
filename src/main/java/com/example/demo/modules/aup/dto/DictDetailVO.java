package com.example.demo.modules.aup.dto;

import lombok.Data;
import java.util.List;

/** 字典详情（含有序项）。 */
@Data
public class DictDetailVO {
    private Long id;
    private String dictKey;
    private String name;
    /** 分类（分组/文件夹；NULL=未分类，迁移数据源） */
    private String category;
    private Integer version;
    private String status;
    private Long folderId;
    private java.time.LocalDateTime publishedAt;
    private String publishedBy;
    private String reviewComment;
    /** LOCAL/EXTERNAL（外部引用码表头） */
    private String source;
    /** 外部引用类型：projectGroup/ANIMAL_BREED/ANIMAL_STRAIN */
    private String sourceRef;
    private List<DictItemVO> items;
}
