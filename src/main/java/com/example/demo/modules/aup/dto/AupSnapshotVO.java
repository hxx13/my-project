package com.example.demo.modules.aup.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 快照 VO。轻量列表不返 data；单快照详情返 data。
 */
@Data
public class AupSnapshotVO {

    private Long snapshotId;
    private Integer versionNo;
    private String stage;
    /** 草稿来源（stage=draft 时有效）first/piReturn/formatReturn/expertReturn/rollback */
    private String draftSource;
    private String data;
    private LocalDateTime createdAt;
    private String createdBy;
}
