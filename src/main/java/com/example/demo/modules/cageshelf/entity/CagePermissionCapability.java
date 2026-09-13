package com.example.demo.modules.cageshelf.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** 笼架能力注册表。code 唯一，只靠种子 SQL 注册，页面不做增删改。 */
@Data
public class CagePermissionCapability {
    private Long id;
    private String code;
    private String label;
    private String viewGroup;        // STAFF | STUDENT，仅用于矩阵行分组展示
    private Integer leaderExclusive; // 1=饲养组长专属（第四期启用）
    private Integer sortOrder;
    private Integer active;
    private LocalDateTime createdAt;
}
