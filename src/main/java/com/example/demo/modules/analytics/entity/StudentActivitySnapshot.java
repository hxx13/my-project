package com.example.demo.modules.analytics.entity;

import java.time.LocalDate;
import java.time.LocalDateTime;

public class StudentActivitySnapshot {
    private Long id;
    private LocalDate snapshotDate;
    private String groupName;
    private String campus;
    private int memberCount;
    private int totalEntries;
    private LocalDateTime createdAt;

    public Long getId() { return id; }
    public void setId(Long v) { this.id = v; }
    public LocalDate getSnapshotDate() { return snapshotDate; }
    public void setSnapshotDate(LocalDate v) { this.snapshotDate = v; }
    public String getGroupName() { return groupName; }
    public void setGroupName(String v) { this.groupName = v; }
    public String getCampus() { return campus; }
    public void setCampus(String v) { this.campus = v; }
    public int getMemberCount() { return memberCount; }
    public void setMemberCount(int v) { this.memberCount = v; }
    public int getTotalEntries() { return totalEntries; }
    public void setTotalEntries(int v) { this.totalEntries = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
}
