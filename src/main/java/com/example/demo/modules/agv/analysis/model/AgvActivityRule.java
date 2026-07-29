package com.example.demo.modules.agv.analysis.model;

import java.time.LocalDateTime;

public class AgvActivityRule {
    private Long id;
    private String name;
    private String activityType;
    private String spatialCond;   // JSON
    private String primitiveCond; // JSON array
    private String stateCond;     // JSON
    private Integer minDurationSec;
    private Integer maxDurationSec;
    private Integer priority;
    private Double confidenceBase;
    private Boolean enabled;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getActivityType() { return activityType; }
    public void setActivityType(String activityType) { this.activityType = activityType; }
    public String getSpatialCond() { return spatialCond; }
    public void setSpatialCond(String spatialCond) { this.spatialCond = spatialCond; }
    public String getPrimitiveCond() { return primitiveCond; }
    public void setPrimitiveCond(String primitiveCond) { this.primitiveCond = primitiveCond; }
    public String getStateCond() { return stateCond; }
    public void setStateCond(String stateCond) { this.stateCond = stateCond; }
    public Integer getMinDurationSec() { return minDurationSec; }
    public void setMinDurationSec(Integer minDurationSec) { this.minDurationSec = minDurationSec; }
    public Integer getMaxDurationSec() { return maxDurationSec; }
    public void setMaxDurationSec(Integer maxDurationSec) { this.maxDurationSec = maxDurationSec; }
    public Integer getPriority() { return priority; }
    public void setPriority(Integer priority) { this.priority = priority; }
    public Double getConfidenceBase() { return confidenceBase; }
    public void setConfidenceBase(Double confidenceBase) { this.confidenceBase = confidenceBase; }
    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean enabled) { this.enabled = enabled; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
