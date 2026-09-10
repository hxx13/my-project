package com.example.demo.modules.referencedata.entity;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
public class RefOrder {
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
}
