package com.example.demo.modules.aup.dto;

import lombok.Data;

/** 字典项视图。 */
@Data
public class DictItemVO {
    private Long itemId;
    private String value;
    private String label;
    private Integer sortOrder;
}
