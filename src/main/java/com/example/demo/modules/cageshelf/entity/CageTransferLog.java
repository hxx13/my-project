package com.example.demo.modules.cageshelf.entity;

/**
 * 笼位数据转移日志 — 审计回溯。
 */
public class CageTransferLog {
    private Long id;
    private Long fromAnimalCageId;
    private Long toAnimalCageId;
    private String dataSnapshot;
    private Long operatorId;
    private String operatorName;
    private String reason;
    private String createdAt;

    public Long getId() { return id; }
    public void setId(Long v) { this.id = v; }

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
