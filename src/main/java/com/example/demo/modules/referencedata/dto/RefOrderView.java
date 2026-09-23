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
    /**
     * 预约单标记（永久保留，含已完成）：下单时目标周期晚于当时的当前周期。
     * 审核页据此打「预约单」标签与筛选 —— 不能靠 estimatedDeliveryDate 推断，
     * 那只是「哪天到货」，看不出「下单当时是不是提前订的」。
     */
    private Integer isPreorder;
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
