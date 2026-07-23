package com.example.demo.modules.telemetry.entity;

import java.time.LocalDateTime;

public class TelemetryArchivePurgeConfig {
    private Integer id;
    private Integer purgeEnabled;
    private Integer retentionDays;
    private Integer batchDeleteSize;
    private Integer optimizeAfterPurge;
    private Integer archiveWriteEnabled;
    private LocalDateTime lastPurgeAt;
    private Long lastPurgeDeletedRows;
    private Integer lastPurgeDurationMs;
    private String updatedBy;
    private LocalDateTime updateTime;

    public Integer getId() { return id; }
    public void setId(Integer id) { this.id = id; }
    public Integer getPurgeEnabled() { return purgeEnabled; }
    public void setPurgeEnabled(Integer purgeEnabled) { this.purgeEnabled = purgeEnabled; }
    public Integer getRetentionDays() { return retentionDays; }
    public void setRetentionDays(Integer retentionDays) { this.retentionDays = retentionDays; }
    public Integer getBatchDeleteSize() { return batchDeleteSize; }
    public void setBatchDeleteSize(Integer batchDeleteSize) { this.batchDeleteSize = batchDeleteSize; }
    public Integer getOptimizeAfterPurge() { return optimizeAfterPurge; }
    public void setOptimizeAfterPurge(Integer optimizeAfterPurge) { this.optimizeAfterPurge = optimizeAfterPurge; }
    public Integer getArchiveWriteEnabled() { return archiveWriteEnabled; }
    public void setArchiveWriteEnabled(Integer archiveWriteEnabled) { this.archiveWriteEnabled = archiveWriteEnabled; }
    public LocalDateTime getLastPurgeAt() { return lastPurgeAt; }
    public void setLastPurgeAt(LocalDateTime lastPurgeAt) { this.lastPurgeAt = lastPurgeAt; }
    public Long getLastPurgeDeletedRows() { return lastPurgeDeletedRows; }
    public void setLastPurgeDeletedRows(Long lastPurgeDeletedRows) { this.lastPurgeDeletedRows = lastPurgeDeletedRows; }
    public Integer getLastPurgeDurationMs() { return lastPurgeDurationMs; }
    public void setLastPurgeDurationMs(Integer lastPurgeDurationMs) { this.lastPurgeDurationMs = lastPurgeDurationMs; }
    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }
    public LocalDateTime getUpdateTime() { return updateTime; }
    public void setUpdateTime(LocalDateTime updateTime) { this.updateTime = updateTime; }
}
