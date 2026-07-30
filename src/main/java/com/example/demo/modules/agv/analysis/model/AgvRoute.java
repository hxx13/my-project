package com.example.demo.modules.agv.analysis.model;

import java.time.LocalDateTime;

public class AgvRoute {
    private Long id;
    private String robotIp;
    private String name;
    private String routeType;    // TRANSPORT | REVERSE | REST | NAVIGATING
    private String pathJson;     // [[x,y],[x,y],...]
    private String color;
    private String fromStation;
    private String toStation;
    private Integer frequency;
    private Boolean enabled;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getRobotIp() { return robotIp; }
    public void setRobotIp(String robotIp) { this.robotIp = robotIp; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getRouteType() { return routeType; }
    public void setRouteType(String routeType) { this.routeType = routeType; }
    public String getPathJson() { return pathJson; }
    public void setPathJson(String pathJson) { this.pathJson = pathJson; }
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
    public String getFromStation() { return fromStation; }
    public void setFromStation(String fromStation) { this.fromStation = fromStation; }
    public String getToStation() { return toStation; }
    public void setToStation(String toStation) { this.toStation = toStation; }
    public Integer getFrequency() { return frequency; }
    public void setFrequency(Integer frequency) { this.frequency = frequency; }
    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean enabled) { this.enabled = enabled; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
