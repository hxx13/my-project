package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 字典项→子字典联动（级联，一项可指向多个子字典，纯配置）。 */
@Data
public class CrfCodelistLink {
    private Long id;
    /** FK→crf_codelist_item.id（源字典项） */
    private Long itemId;
    /** FK→crf_codelist.id（指向的子字典，级联下一级） */
    private Long childCodelistId;
    private Integer sortOrder;
    private LocalDateTime createdAt;
}
