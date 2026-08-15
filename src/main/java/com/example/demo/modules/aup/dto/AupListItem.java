package com.example.demo.modules.aup.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 计划书列表项。summaryJson / miniSteps 由 Service 计算填充。
 */
@Data
public class AupListItem {

    private Long id;
    private String registerNo;
    private String projectName;
    private String piName;
    private String dept;
    private String currentStage;
    private Integer roundNo;
    private String draftSource;
    private LocalDateTime submittedAt;
    private LocalDateTime approvedAt;
    private LocalDateTime createdAt;
    /** 演示示例标记 0/1 */
    private Integer isDemo;
    private Integer snapshotCount;
    /** 评审意见条数（批注） */
    private Integer reviewCount;
    /** 不合规条数（评审意见中 verdict=nonCompliant） */
    private Integer nonCompliantCount;
    /** 申请人（实验员）userId，列表按钮矩阵「实验员填写」判定用 */
    private String createdBy;
    /** 组长（PI）userId，列表按钮矩阵「组长提交」判定用 */
    private String piUserId;
    /** 当前用户是否被分配为该计划书的审查专家（0/1 计数，>0 即被分配） */
    private Integer assignedExpertCount;
    /** 列表展示摘要 JSON */
    private String summaryJson;
    /** 迷你阶段指示 JSON */
    private String miniSteps;
}
