package com.example.demo.modules.agv.analysis.dto;

public class AnalysisRequest {
    private String robotIp;
    private String from; // ISO datetime string, parsed by controller
    private String to;

    public String getRobotIp() { return robotIp; }
    public void setRobotIp(String robotIp) { this.robotIp = robotIp; }
    public String getFrom() { return from; }
    public void setFrom(String from) { this.from = from; }
    public String getTo() { return to; }
    public void setTo(String to) { this.to = to; }
}
