package com.example.demo.modules.telemetry.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 单点 WinCC 变量快照（只读展示）。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetryTagItemDto {

    private String variableName;
    /** 数据库配置的展示名；未配置时前端仍用 variableName */
    private String displayLabel;
    /** 数据库分区 code（watchlist-source=database 时可能有值） */
    private String bundleCode;
    /** 数据库分区显示名 */
    private String bundleDisplayName;
    /** 结构化映射：楼层 / 房间 / 指标（database 源） */
    private String floorCode;
    private String roomCanonical;
    private String metricKindCode;
    private String metricKindLabel;
    /** 指标字典 kind_role：METRIC | LIMIT_MIN | LIMIT_MAX | SWITCH | SETPOINT */
    private String kindRole;
    /** 报警下限（HTTP 响应前由 {@link com.example.demo.modules.telemetry.service.WatchlistAlarmLimitsFacadeService} 按全局配置写入） */
    private String alarmMinValue;
    /** 报警上限（同上） */
    private String alarmMaxValue;
    /** 保留字段；全局限值模式下一般为空 */
    private String alarmMinVariableName;
    /** 保留字段；全局限值模式下一般为空 */
    private String alarmMaxVariableName;
    /** 主测量点：数值越限（可解析为数字且上下限来自入库表缓存时） */
    private Boolean alarmOutOfRange;
    /** HIGH | LOW | OK；与 alarmOutOfRange 同源，供三色展示 */
    private String alarmBand;
    /** 滑动窗内相对开盘：UP | DOWN；死区内为 null（前端不显示箭头）。 */
    private String valueTrend;
    /** 数据库 telemetry_watchlist_tag.id（首分区命中）；详情 PATCH 用 */
    private Long watchlistTagId;
    /** 库内每点覆盖原始值（与 alarmMinValue 区分：后者为合并后的有效限） */
    private String alarmOverrideMin;
    private String alarmOverrideMax;
    private String value;
    private String timestamp;
    /** WinCC 原文，如 qualitycode 字段 */
    private String qualityCode;
    private Integer dataType;
    private Integer errorCode;
    /** 若 WinCC 返回 Not Found 等 */
    private String error;
}
