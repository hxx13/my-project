package com.example.demo.modules.agv.analysis.dto;

import java.time.LocalDateTime;

public class PrimitiveEvent {
    private String type;            // MOVE_START, MOVE_END, ENTER_ZONE, etc.
    private LocalDateTime timestamp;
    private String robotIp;
    private Double x;
    private Double y;
    private Long zoneId;            // non-null for ENTER_ZONE/EXIT_ZONE
    private Double value;           // speed for MOVE_START, height for FORK_RAISE, etc.

    public PrimitiveEvent() {}

    public PrimitiveEvent(String type, LocalDateTime timestamp, String robotIp, Double x, Double y) {
        this.type = type;
        this.timestamp = timestamp;
        this.robotIp = robotIp;
        this.x = x;
        this.y = y;
    }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public LocalDateTime getTimestamp() { return timestamp; }
    public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }
    public String getRobotIp() { return robotIp; }
    public void setRobotIp(String robotIp) { this.robotIp = robotIp; }
    public Double getX() { return x; }
    public void setX(Double x) { this.x = x; }
    public Double getY() { return y; }
    public void setY(Double y) { this.y = y; }
    public Long getZoneId() { return zoneId; }
    public void setZoneId(Long zoneId) { this.zoneId = zoneId; }
    public Double getValue() { return value; }
    public void setValue(Double value) { this.value = value; }
}
