package com.example.demo.modules.sop.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** SOP 操作文档分类树节点。 */
@Data
public class SopNode {
    private Long id;
    private Long parentId;
    private String name;
    private Integer sortOrder;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
