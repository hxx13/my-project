package com.example.demo.modules.aup.dto;

import lombok.Data;
import java.util.List;

/** 字典详情（含有序项）。 */
@Data
public class DictDetailVO {
    private String dictKey;
    private String name;
    /** 分类（分组/文件夹；NULL=未分类） */
    private String category;
    private List<DictItemVO> items;
}
