package com.example.demo.modules.referencedata.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class RefOrderView {
    private Long id;
    /** ARO 订单号；本地自建单为空 */
    private String sn;
    /** 来源：LOCAL | ARO */
    private String source;
    private String groupId;
    private String submitterId;
    private String submitterName;
    private String projectGroupName;
    private Long projectGroupId;
    private Long aupRecordId;
    private String registerNo;
    /** 下单校区：浦东 | 浦西 */
    private String campus;
    /** ARO 原文校区名（本地自建单为空） */
    private String aroAreaName;
    private String status;
    private String submitRemark;
    private LocalDateTime submittedAt;
    private LocalDate estimatedDeliveryDate;
    private LocalDateTime createdAt;
    /** 订单总金额（元）= 各行单价 × 数量求和；无任何定价行时为 null */
    private BigDecimal totalAmount;
    /** 订单内是否含已开启价格的物品 */
    private Boolean priceEnabled;
    /**
     * 当前登录人能否编辑这张单（订单待处理 + 本人就是该单提交人/PI）。
     * 由服务端按 personnel 级身份判定后下发，三端只按这个标记渲染编辑入口。
     */
    private Boolean editable;
    private List<RefOrderLineView> lines;
}
