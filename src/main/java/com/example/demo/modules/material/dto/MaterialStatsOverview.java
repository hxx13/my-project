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
    /** 审核通过率 (APPROVED+FULFILLED+RECEIVED) / (APPROVED+FULFILLED+RECEIVED+REJECTED) */
    private Double passRate;
    /** 拒绝数量 */
    private Long refuseCount;
    /** 库存预警：stockQty <= 5 的数量型物品 */
    private List<Map<String, Object>> stockWarnings;
    /** 按学生维度聚合 */
    private List<Map<String, Object>> byStudent;
    /** 按物品维度聚合 */
    private List<Map<String, Object>> byItem;
}
