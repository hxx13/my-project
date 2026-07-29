package com.example.demo.modules.agv.analysis.model;

import java.time.LocalDateTime;

public class AgvCorrection {
    private Long id;
    private Long segmentId;
    private String originalType;
    private String correctedType;
    private String correctedBy;
    private String correctionNote;
    private String coordinateSnapshot; // JSON
    private Boolean feedbackApplied;
    private Long appliedRuleId;
    private LocalDateTime correctedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getSegmentId() { return segmentId; }
    public void setSegmentId(Long segmentId) { this.segmentId = segmentId; }
    public String getOriginalType() { return originalType; }
    public void setOriginalType(String originalType) { this.originalType = originalType; }
    public String getCorrectedType() { return correctedType; }
    public void setCorrectedType(String correctedType) { this.correctedType = correctedType; }
    public String getCorrectedBy() { return correctedBy; }
    public void setCorrectedBy(String correctedBy) { this.correctedBy = correctedBy; }
    public String getCorrectionNote() { return correctionNote; }
    public void setCorrectionNote(String correctionNote) { this.correctionNote = correctionNote; }
    public String getCoordinateSnapshot() { return coordinateSnapshot; }
    public void setCoordinateSnapshot(String coordinateSnapshot) { this.coordinateSnapshot = coordinateSnapshot; }
    public Boolean getFeedbackApplied() { return feedbackApplied; }
    public void setFeedbackApplied(Boolean feedbackApplied) { this.feedbackApplied = feedbackApplied; }
    public Long getAppliedRuleId() { return appliedRuleId; }
    public void setAppliedRuleId(Long appliedRuleId) { this.appliedRuleId = appliedRuleId; }
    public LocalDateTime getCorrectedAt() { return correctedAt; }
    public void setCorrectedAt(LocalDateTime correctedAt) { this.correctedAt = correctedAt; }
}
