package com.example.demo.modules.aup.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * AUP 计划书主记录（aup_record）。
 * current_stage 为唯一状态字段：draft/formatReview/expertReview/approved/terminated/expired。
 */
@Data
public class AupRecord {

    private Long id;
    /** FK→form_template.id（发布版本=一行） */
    private Long templateId;
    /** 冗余版本号 */
    private String templateVersion;
    /** 乐观锁（流转/保存 CAS 用） */
    private Long version;
    /** JUMC{年}-{序}[-字母]，提交时生成并锁定，unlock 不清空 */
    private String registerNo;
    private Integer registerYear;
    private Integer registerSeq;
    private String currentStage;
    /** 第几轮（≥1） */
    private Integer roundNo;
    /** first/formatReturn/expertReturn/rollback */
    private String draftSource;
    /** 专家审查形式 member/meeting */
    private String reviewForm;
    private String originRegisterNo;
    /** 结转未用动物数（暂不支持自动结转，续期时置 0，待接动物用量数据源） */
    private Integer carriedOverCount;
    /** approved+3年 */
    private LocalDateTime expireAt;
    /** 项目名称（冗余自 A1） */
    private String projectName;
    /** 课题组长 userId */
    private String piUserId;
    private String piName;
    private String dept;
    private String projectSource;
    /** 课题组名称（冗余自 aro_personnel.project_group_name，供学生端按课题组查看/协作编辑） */
    private String projectGroupName;
    /** 课题组外键 → project_group.id（关键枢纽，计划文档 §6.1 补齐） */
    private Long projectGroupId;
    /** 动物类型白名单（结构化 JSON，后续补） */
    private String animalAllowlist;
    /** 有效期状态 active/expired（与 current_stage 流程状态互补） */
    private String status;
    private LocalDateTime submittedAt;
    private LocalDateTime approvedAt;
    private String createdBy;
    /** 演示示例标记 0/1（1=演示，阻止流转，可恢复重置） */
    private Integer isDemo;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
