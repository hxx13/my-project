package com.example.demo.modules.supplies.dto;

import lombok.Data;

/**
 * 单件物资在某个时间窗口内的**消耗统计** —— 回答「哪些物资消耗得快 / 哪些该补货」用。
 *
 * <p>口径只来自库存流水表（{@code supply_inventory_movement}），与库存审计页同一份数据源；
 * 出库量取该表里 {@code OUTBOUND} 的数量（本模块存的是**正数**，与旧物资模块相反）。
 */
@Data
public class SupplyItemConsumptionView {
    private Long itemId;
    private String name;
    private Long categoryId;
    private String categoryName;
    /** 窗口内出库总量（件） */
    private Integer outboundQty;
    /** 窗口内入库总量（件）—— 与出库一起看才知道是「进得多」还是「消耗快」 */
    private Integer inboundQty;
    /** 窗口内库存纠偏的净变动（件，可为负） */
    private Integer adjustQty;
    private Integer stockQty;
    private Integer lockedQty;
    /** 可用量（现有 − 锁定，负锁定按 0 处理） */
    private Integer availableQty;
    /** 日均出库量（出库总量 ÷ 窗口天数，保留一位小数） */
    private Double dailyAvg;
    /** 按当前可用量「还能撑几天」；窗口内没消耗时为 null（不是 0，0 会被误读成「马上没了」） */
    private Double coverDays;
}
