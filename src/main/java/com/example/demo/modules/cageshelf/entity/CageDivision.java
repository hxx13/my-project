package com.example.demo.modules.cageshelf.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 笼位划分：一行 = 一个「笼位 × 人」对。同一笼位多行即多个人。
 * 独立于笼位状态存在，不随笼位被占用而失效；撤销/改划由管家手动做。
 */
@Data
public class CageDivision {
    private Long id;
    private Long animalCageId;
    private String assigneeId;      // 被划分人（统一人员口径 accountId）
    private String assigneeName;
    private String groupName;       // 划分时的课题组快照
    private String createdBy;       // 操作管家 accountId
    private String createdByName;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
