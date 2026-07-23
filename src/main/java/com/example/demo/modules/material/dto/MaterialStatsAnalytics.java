package com.example.demo.modules.material.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

/** 物资申领统计看板：与申领审计导出同源记录，供坐标图直接消费 */
@Data
public class MaterialStatsAnalytics {
    private Long totalRequests;
    private Long totalRequestQty;
    private Long totalOutboundQty;
    private Long totalInboundQty;
    private Double passRate;
    private Long refuseCount;
    private Long activeStudents;
    private Long activeGroups;
    private List<Map<String, Object>> stockWarnings;
    /** 课题组维度（申领审计 · 课题组） */
    private List<Map<String, Object>> byGroup;
    /** 申领人维度（申领审计 · 个人） */
    private List<Map<String, Object>> byStudent;
    /** 物品维度（申领审计 · 按物品申领行） */
    private List<Map<String, Object>> byItem;
    /** 日趋势：date / requestCount / requestQty / outboundQty / inboundQty */
    private List<Map<String, Object>> dailyTrend;
    /** 状态分布：status / count */
    private List<Map<String, Object>> statusDistribution;
    /** 出库时段热力：dayOfWeek(1-7) / hour(0-23) / count */
    private List<Map<String, Object>> outboundHeatmap;
}
