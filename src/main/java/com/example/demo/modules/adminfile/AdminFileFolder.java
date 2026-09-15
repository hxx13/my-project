package com.example.demo.modules.adminfile;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/** 文件模板库的文件夹节点。children / directCount / totalCount 非数据库列，仅用于树构建结果。 */
@Data
public class AdminFileFolder {
    private Long id;
    private Long parentId;
    private String name;
    private Integer sortOrder;
    private Integer deleted;
    private String icon;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    private List<AdminFileFolder> children;
    /** 直属文件数（buildTree 填充） */
    private Integer directCount;
    /** 含子树的文件总数（buildTree 填充） */
    private Integer totalCount;
}
