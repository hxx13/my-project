package com.example.demo.modules.analytics.entity;

import java.time.LocalDateTime;

public class AnalyticsViewShare {

    private Long id;
    private String shareCodeHash;
    /** 明文分享码（仅配置所有者可在后台查看；导入校验仍用 hash） */
    private String shareCodePlain;
    private String ownerUserId;
    private Long sourceViewId;
    private String reportKey;
    private Integer snapshotVersion;
    private String payloadJson;
    private Integer auditLogCount;
    private Integer insightCount;
    private String ownerDisplayName;
    private LocalDateTime expiresAt;
    private Integer maxImports;
    private Integer importCount;
    private Integer revoked;
    private LocalDateTime createdAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getShareCodeHash() {
        return shareCodeHash;
    }

    public void setShareCodeHash(String shareCodeHash) {
        this.shareCodeHash = shareCodeHash;
    }

    public String getShareCodePlain() {
        return shareCodePlain;
    }

    public void setShareCodePlain(String shareCodePlain) {
        this.shareCodePlain = shareCodePlain;
    }

    public String getOwnerUserId() {
        return ownerUserId;
    }

    public void setOwnerUserId(String ownerUserId) {
        this.ownerUserId = ownerUserId;
    }

    public Long getSourceViewId() {
        return sourceViewId;
    }

    public void setSourceViewId(Long sourceViewId) {
        this.sourceViewId = sourceViewId;
    }

    public String getReportKey() {
        return reportKey;
    }

    public void setReportKey(String reportKey) {
        this.reportKey = reportKey;
    }

    public Integer getSnapshotVersion() {
        return snapshotVersion;
    }

    public void setSnapshotVersion(Integer snapshotVersion) {
        this.snapshotVersion = snapshotVersion;
    }

    public String getPayloadJson() {
        return payloadJson;
    }

    public void setPayloadJson(String payloadJson) {
        this.payloadJson = payloadJson;
    }

    public Integer getAuditLogCount() {
        return auditLogCount;
    }

    public void setAuditLogCount(Integer auditLogCount) {
        this.auditLogCount = auditLogCount;
    }

    public Integer getInsightCount() {
        return insightCount;
    }

    public void setInsightCount(Integer insightCount) {
        this.insightCount = insightCount;
    }

    public String getOwnerDisplayName() {
        return ownerDisplayName;
    }

    public void setOwnerDisplayName(String ownerDisplayName) {
        this.ownerDisplayName = ownerDisplayName;
    }

    public LocalDateTime getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(LocalDateTime expiresAt) {
        this.expiresAt = expiresAt;
    }

    public Integer getMaxImports() {
        return maxImports;
    }

    public void setMaxImports(Integer maxImports) {
        this.maxImports = maxImports;
    }

    public Integer getImportCount() {
        return importCount;
    }

    public void setImportCount(Integer importCount) {
        this.importCount = importCount;
    }

    public Integer getRevoked() {
        return revoked;
    }

    public void setRevoked(Integer revoked) {
        this.revoked = revoked;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
