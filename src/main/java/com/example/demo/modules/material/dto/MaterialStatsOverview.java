package com.example.demo.modules.material.dto;

import lombok.Data;
import java.util.List;
import java.util.Map;

@Data
public class MaterialStatsOverview {
    /** 时间区间内总申领单数 */
    private Long totalRequests;
    /** 时间区间内总出库数量 */
    private Long totalFulfilledQty;
    /** 按学生维度聚合：userId, applicantName, applicantGroup, total, activeDays */
    private List<Map<String, Object>> byStudent;
    /** 按物品维度聚合：itemId, snapshotName, totalQty, requestCount */
    private List<Map<String, Object>> byItem;
}
