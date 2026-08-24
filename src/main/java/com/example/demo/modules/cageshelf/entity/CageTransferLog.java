package com.example.demo.modules.cageshelf.entity;

/**
 * 笼位占用事件日志 — 占用周期 = 个人账号 + 笼位 + 起止时间。
 * operator/occupant 存「统一人员 personnel.id」+ 姓名快照,不裸存 sys_user.id
 * (一个人有 staff_id / aro_user_id 两套遗留 id,统一到 personnel 才唯一)。
 */
public class CageTransferLog {
    private Long id;
    private String eventType;    // start/transfer/copy/exit
    private Long occupantId;     // 占用者 统一人员 personnel.id
    private String occupantName; // 占用者姓名快照
    private Long fromAnimalCageId;
    private Long toAnimalCageId;
    private String dataSnapshot;
    private Long operatorId;     // 操作人 统一人员 personnel.id
    private String operatorName; // 操作人姓名快照
    private String reason;
    private String createdAt;

    public Long getId() { return id; }
    public void setId(Long v) { this.id = v; }

    public String getEventType() { return eventType; }
    public void setEventType(String v) { this.eventType = v; }

    public Long getOccupantId() { return occupantId; }
    public void setOccupantId(Long v) { this.occupantId = v; }

    public String getOccupantName() { return occupantName; }
    public void setOccupantName(String v) { this.occupantName = v; }

    public Long getFromAnimalCageId() { return fromAnimalCageId; }
    public void setFromAnimalCageId(Long v) { this.fromAnimalCageId = v; }

    public Long getToAnimalCageId() { return toAnimalCageId; }
    public void setToAnimalCageId(Long v) { this.toAnimalCageId = v; }

    public String getDataSnapshot() { return dataSnapshot; }
    public void setDataSnapshot(String v) { this.dataSnapshot = v; }

    public Long getOperatorId() { return operatorId; }
    public void setOperatorId(Long v) { this.operatorId = v; }

    public String getOperatorName() { return operatorName; }
    public void setOperatorName(String v) { this.operatorName = v; }

    public String getReason() { return reason; }
    public void setReason(String v) { this.reason = v; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String v) { this.createdAt = v; }
}
