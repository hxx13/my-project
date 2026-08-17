package com.example.demo.modules.aup.dto;

import lombok.Data;

/**
 * aup_record 的轻量投影（评审链路自用，仅 SELECT，不改写主记录字段）。
 * 与实体 AupRecord 解耦，避免评审模块直接依赖主链路实体字段约定。
 */
@Data
public class AupRecordView {
    private Long id;
    private String currentStage;
    private Integer roundNo;
    private String reviewForm;
    private String draftSource;
    private Long templateId;
    private String templateVersion;
    private String piUserId;
    private String createdBy;
    private String projectName;
    private String registerNo;
    private Integer isDemo;
}
