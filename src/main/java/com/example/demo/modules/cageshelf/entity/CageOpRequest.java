package com.example.demo.modules.cageshelf.entity;

/**
 * 笼位操作请求 — 分笼 / 转移笼位的待审队列与留痕。
 * 与 cage_claims（笼位认领状态机）解耦：本表描述「对笼位发起的操作请求」，
 * 审核通过后由 CageOperationService 执行，执行结果另落 cage_transfer_log + approval_records。
 */
public class CageOpRequest {

    public static final String TYPE_DIVIDE = "divide";
    public static final String TYPE_TRANSFER = "transfer";

    public static final String STATUS_PENDING = "pending";
    public static final String STATUS_APPROVED = "approved";
    public static final String STATUS_REJECTED = "rejected";
    public static final String STATUS_CANCELLED = "cancelled";

    private Long id;
    private String opType;                 // divide / transfer
    private Long sourceAnimalCageId;       // 源/母笼位
    private String targetAnimalCageIds;    // JSON 数组字符串（转移时长度为 1）
    private Boolean keepSource;            // 仅分笼有意义：true=源笼位保持占用不变
    private String applicantId;            // sys_user.id
    private String applicantName;          // 姓名快照
    private String applicantScope;         // student / staff
    private String status;                 // pending/approved/rejected/cancelled
    private String reason;                 // 申请原因
    private String reviewerId;             // 审核人 sys_user.id
    private String reviewerName;
    private String reviewedAt;
    private String rejectReason;
    private String createdAt;
    private String updatedAt;

    public Long getId() { return id; }
    public void setId(Long v) { this.id = v; }

    public String getOpType() { return opType; }
    public void setOpType(String v) { this.opType = v; }

    public Long getSourceAnimalCageId() { return sourceAnimalCageId; }
    public void setSourceAnimalCageId(Long v) { this.sourceAnimalCageId = v; }

    public String getTargetAnimalCageIds() { return targetAnimalCageIds; }
    public void setTargetAnimalCageIds(String v) { this.targetAnimalCageIds = v; }

    public Boolean getKeepSource() { return keepSource; }
    public void setKeepSource(Boolean v) { this.keepSource = v; }

    public String getApplicantId() { return applicantId; }
    public void setApplicantId(String v) { this.applicantId = v; }

    public String getApplicantName() { return applicantName; }
    public void setApplicantName(String v) { this.applicantName = v; }

    public String getApplicantScope() { return applicantScope; }
    public void setApplicantScope(String v) { this.applicantScope = v; }

    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }

    public String getReason() { return reason; }
    public void setReason(String v) { this.reason = v; }

    public String getReviewerId() { return reviewerId; }
    public void setReviewerId(String v) { this.reviewerId = v; }

    public String getReviewerName() { return reviewerName; }
    public void setReviewerName(String v) { this.reviewerName = v; }

    public String getReviewedAt() { return reviewedAt; }
    public void setReviewedAt(String v) { this.reviewedAt = v; }

    public String getRejectReason() { return rejectReason; }
    public void setRejectReason(String v) { this.rejectReason = v; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String v) { this.createdAt = v; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String v) { this.updatedAt = v; }
}
