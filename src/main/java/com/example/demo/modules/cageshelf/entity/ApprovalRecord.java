package com.example.demo.modules.cageshelf.entity;

/**
 * 审批记录 — 完整审计链，只增不删。
 * target_type + target_id 实现多态关联（cage_claim / cage_release / cage_transfer）。
 */
public class ApprovalRecord {

    private Long id;
    private String targetType;          // cage_claim / cage_release / cage_transfer
    private Long targetId;              // cage_claims.id
    private String approverId;          // sys_user.id (String)
    private String approverName;
    private String approverRole;        // 审批时的角色快照（PI / ADMIN / SYSTEM）
    private String decision;            // approved / rejected
    private String rejectReason;        // rejected 时必填
    private String createdAt;

    // ---- getters / setters ----

    public Long getId() { return id; }
    public void setId(Long v) { this.id = v; }

    public String getTargetType() { return targetType; }
    public void setTargetType(String v) { this.targetType = v; }

    public Long getTargetId() { return targetId; }
    public void setTargetId(Long v) { this.targetId = v; }

    public String getApproverId() { return approverId; }
    public void setApproverId(String v) { this.approverId = v; }

    public String getApproverName() { return approverName; }
    public void setApproverName(String v) { this.approverName = v; }

    public String getApproverRole() { return approverRole; }
    public void setApproverRole(String v) { this.approverRole = v; }

    public String getDecision() { return decision; }
    public void setDecision(String v) { this.decision = v; }

    public String getRejectReason() { return rejectReason; }
    public void setRejectReason(String v) { this.rejectReason = v; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String v) { this.createdAt = v; }
}
