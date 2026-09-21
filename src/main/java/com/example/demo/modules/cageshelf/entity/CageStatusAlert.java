package com.example.demo.modules.cageshelf.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 笼位特殊状态持续超时告警实例（cage_status_alert）。
 * 与老的快照告警链路（CageSpecialStatusSnapshot 等）零耦合。
 */
@Data
public class CageStatusAlert {

    public static final String STATE_PENDING = "PENDING";
    public static final String STATE_ACTIVE = "ACTIVE";
    public static final String STATE_CLEARED = "CLEARED";

    private Long id;
    private Long animalCageId;
    /** 所属笼架（join cage_cell_index 反查，供管理端左侧树按架聚合；孤儿告警为 null） */
    private Long shelveId;
    /** 所属房间（join cage_shelf_index 反查，供管理端左侧树按房聚合；孤儿告警为 null） */
    private Long roomId;
    private String statusCode;
    /**
     * 通知对象：DEFAULT（原有单目标语义）/ VET（通知兽医）/ OCCUPANT（通知笼位所有者）。
     * 与 status_code 一起构成实例身份 —— active_key 也是按 (笼位, 状态, 对象) 算的。
     */
    private String notifyTarget;
    private LocalDateTime startedAt;
    private LocalDateTime firedAt;
    private Integer thresholdDays;
    private String action;
    private String state;
    private LocalDateTime clearedAt;
    private Long violationId;
    private Boolean estimated;
    private String activeKey;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
