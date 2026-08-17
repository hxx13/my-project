package com.example.demo.modules.aup.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * AUP 每阶段不可变快照（aup_snapshot）。
 * mapper 只提供 insert/select，禁 update/delete。
 */
@Data
public class AupSnapshot {

    private Long id;
    private Long aupId;
    /** 快照序号（全计划单调递增） */
    private Integer versionNo;
    /** 该快照所处 stage */
    private String stage;
    /** 草稿来源（stage=draft 时有效）first/piReturn/formatReturn/expertReturn/rollback */
    private String draftSource;
    /** 快照 JSON（不可变） */
    private String data;
    private Long templateId;
    private String templateVersion;
    private String createdBy;
    private LocalDateTime createdAt;
}
