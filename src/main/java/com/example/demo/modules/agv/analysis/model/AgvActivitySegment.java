package com.example.demo.modules.agv.analysis.model;

import java.time.LocalDateTime;

public class AgvActivitySegment {
    private Long id;
    private String robotIp;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private String activityType;
    private Long zoneId;
    private Double startX;
    private Double startY;
    private Double endX;
    private Double endY;
    private Double avgX;
    private Double avgY;
    private Double distanceM;
    private Double batteryDelta;
    private String source;      // AUTO | MANUAL | CORRECTED
    private Double confidence;
    private Long ruleId;
    private Long correctionId;
    private String metadataJson;
    private LocalDateTime createdAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getRobotIp() { return robotIp; }
    public void setRobotIp(String robotIp) { this.robotIp = robotIp; }
    public LocalDateTime getStartTime() { return startTime; }
    public void setStartTime(LocalDateTime startTime) { this.startTime = startTime; }
    public LocalDateTime getEndTime() { return endTime; }
    public void setEndTime(LocalDateTime endTime) { this.endTime = endTime; }
    public String getActivityType() { return activityType; }
    public void setActivityType(String activityType) { this.activityType = activityType; }
    public Long getZoneId() { return zoneId; }
    public void setZoneId(Long zoneId) { this.zoneId = zoneId; }
    public Double getStartX() { return startX; }
    public void setStartX(Double startX) { this.startX = startX; }
    public Double getStartY() { return startY; }
    public void setStartY(Double startY) { this.startY = startY; }
    public Double getEndX() { return endX; }
    public void setEndX(Double endX) { this.endX = endX; }
    public Double getEndY() { return endY; }
    public void setEndY(Double endY) { this.endY = endY; }
    public Double getAvgX() { return avgX; }
    public void setAvgX(Double avgX) { this.avgX = avgX; }
    public Double getAvgY() { return avgY; }
    public void setAvgY(Double avgY) { this.avgY = avgY; }
    public Double getDistanceM() { return distanceM; }
    public void setDistanceM(Double distanceM) { this.distanceM = distanceM; }
    public Double getBatteryDelta() { return batteryDelta; }
    public void setBatteryDelta(Double batteryDelta) { this.batteryDelta = batteryDelta; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public Double getConfidence() { return confidence; }
    public void setConfidence(Double confidence) { this.confidence = confidence; }
    public Long getRuleId() { return ruleId; }
    public void setRuleId(Long ruleId) { this.ruleId = ruleId; }
    public Long getCorrectionId() { return correctionId; }
    public void setCorrectionId(Long correctionId) { this.correctionId = correctionId; }
    public String getMetadataJson() { return metadataJson; }
    public void setMetadataJson(String metadataJson) { this.metadataJson = metadataJson; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
