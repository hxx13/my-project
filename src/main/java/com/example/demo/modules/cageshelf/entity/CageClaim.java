package com.example.demo.modules.cageshelf.entity;

import java.util.Set;

/**
 * 笼位申请记录 — 管理申请全生命周期（pool → pending_approval → locked/confirmed → released）。
 * cageTypeCode 不变（始终=2），claim_status 独立驱动认领状态机。
 */
public class CageClaim {

    /** active claim：笼位被占用，不可再认领 */
    public static final Set<String> ACTIVE_STATUSES = Set.of(
        "pending_approval", "locked", "confirmed", "pending_release_approval"
    );

    /** 终态 claim：笼位已释放/取消/驳回，回到 pool */
    public static final Set<String> FINAL_STATUSES = Set.of(
        "rejected", "cancelled", "released"
    );

    private Long id;
    private Long animalCageId;
    private String claimStatus;         // pool | pending_approval | locked | confirmed | pending_release_approval | rejected | cancelled | released
    private String claimantId;          // sys_user.id (String)
    private String claimantName;        // 快照
    private String claimantDept;        // 快照
    private Long aupId;
    private String assignerId;          // 手动分配者 sys_user.id（学生自主认领为NULL）
    private String assignerName;        // 快照
    private Boolean confirmRequired;    // 是否需要到场确认
    private Integer retryCount;         // 该笼位被驳回次数
    private String rejectedAt;          // 最近驳回时间
    private String confirmedAt;
    private String releasedAt;
    private String note;
    private String createdAt;
    private String updatedAt;

    // ---- getters / setters ----

    public Long getId() { return id; }
    public void setId(Long v) { this.id = v; }

    public Long getAnimalCageId() { return animalCageId; }
    public void setAnimalCageId(Long v) { this.animalCageId = v; }

    public String getClaimStatus() { return claimStatus; }
    public void setClaimStatus(String v) { this.claimStatus = v; }

    public String getClaimantId() { return claimantId; }
    public void setClaimantId(String v) { this.claimantId = v; }

    public String getClaimantName() { return claimantName; }
    public void setClaimantName(String v) { this.claimantName = v; }

    public String getClaimantDept() { return claimantDept; }
    public void setClaimantDept(String v) { this.claimantDept = v; }

    public Long getAupId() { return aupId; }
    public void setAupId(Long v) { this.aupId = v; }

    public String getAssignerId() { return assignerId; }
    public void setAssignerId(String v) { this.assignerId = v; }

    public String getAssignerName() { return assignerName; }
    public void setAssignerName(String v) { this.assignerName = v; }

    public Boolean getConfirmRequired() { return confirmRequired; }
    public void setConfirmRequired(Boolean v) { this.confirmRequired = v; }

    public Integer getRetryCount() { return retryCount; }
    public void setRetryCount(Integer v) { this.retryCount = v; }

    public String getRejectedAt() { return rejectedAt; }
    public void setRejectedAt(String v) { this.rejectedAt = v; }

    public String getConfirmedAt() { return confirmedAt; }
    public void setConfirmedAt(String v) { this.confirmedAt = v; }

    public String getReleasedAt() { return releasedAt; }
    public void setReleasedAt(String v) { this.releasedAt = v; }

    public String getNote() { return note; }
    public void setNote(String v) { this.note = v; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String v) { this.createdAt = v; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String v) { this.updatedAt = v; }

    /** 是否为活跃状态（占用笼位） */
    public boolean isActive() {
        return claimStatus != null && ACTIVE_STATUSES.contains(claimStatus);
    }
}
