package com.example.demo.modules.cageshelf.entity;

import com.alibaba.fastjson2.JSON;
import com.example.demo.modules.cageshelf.service.CageOpPair;
import com.example.demo.modules.cageshelf.service.CageOpSignature;
import com.example.demo.modules.cageshelf.service.CageOpSignatures;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

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
    private String signatures;             // 三签 JSON 数组字符串
    private String transferForm;           // JSON：学生填写的转移单值
    private String transferFormFileRef;    // 终局归档 PDF 的相对文件名
    private String pairs;                  // JSON：[{source,target},...] 每组源→目标
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

    public String getSignatures() { return signatures; }
    public void setSignatures(String v) { this.signatures = v; }

    public String getTransferForm() { return transferForm; }
    public void setTransferForm(String v) { this.transferForm = v; }

    public String getTransferFormFileRef() { return transferFormFileRef; }
    public void setTransferFormFileRef(String v) { this.transferFormFileRef = v; }

    public String getPairs() { return pairs; }
    public void setPairs(String v) { this.pairs = v; }

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

    /** 目标笼位 id（转移恒为 1 个，分笼 1 到多个）。坏 JSON 退回空集，调用方不必防。 */
    public List<Long> targetIds() {
        if (targetAnimalCageIds == null || targetAnimalCageIds.isBlank()) return List.of();
        try {
            List<Long> ids = JSON.parseArray(targetAnimalCageIds, Long.class);
            return ids == null ? List.of() : ids;
        } catch (Exception e) {
            return List.of();
        }
    }

    /**
     * 本条请求涉及的全部笼位（保序去重）。新单跨 pair 取每个 pair 的源与目标；pairs 为空（存量单）退回老列推导。
     * 审核作用域要对着它们逐个判覆盖。
     */
    public List<Long> involvedCageIds() {
        List<Long> pairIds = pairCageIds();
        if (!pairIds.isEmpty()) return pairIds;
        LinkedHashSet<Long> all = new LinkedHashSet<>();
        if (sourceAnimalCageId != null) all.add(sourceAnimalCageId);
        all.addAll(targetIds());
        return new ArrayList<>(all);
    }

    /** 三签记录。空列 / 坏 JSON 都退回空集。 */
    public List<CageOpSignature> signatures() {
        return CageOpSignatures.parse(signatures);
    }

    /** 一组「源→目标」对。空列 / 坏 JSON 都退回空集，调用方不必防。 */
    public List<CageOpPair> pairs() {
        if (pairs == null || pairs.isBlank()) return List.of();
        try {
            List<CageOpPair> list = JSON.parseArray(pairs, CageOpPair.class);
            return list == null ? List.of() : list;
        } catch (Exception e) {
            return List.of();
        }
    }

    /** 全部 pair 涉及的笼位 id（源 + 目标，保序去重）。 */
    public List<Long> pairCageIds() {
        LinkedHashSet<Long> all = new LinkedHashSet<>();
        for (CageOpPair p : pairs()) {
            if (p == null) continue;
            if (p.getSource() != null) all.add(p.getSource());
            if (p.getTarget() != null) all.add(p.getTarget());
        }
        return new ArrayList<>(all);
    }
}
