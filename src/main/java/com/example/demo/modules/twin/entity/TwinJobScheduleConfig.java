package com.example.demo.modules.twin.entity;

import java.time.LocalDateTime;

public class TwinJobScheduleConfig {
    private String jobKey;
    private String jobName;
    private Integer enabled;
    private String scheduleType;
    private String scheduleTime;
    private String scheduleStartTime;
    private String scheduleEndTime;
    private String weekDays;
    /** 动物房程序坞轮询间隔（秒），仅 jobKey=TELEMETRY_WINCC_UI 使用；其它任务可为 null */
    private Integer pollIntervalSeconds;
    private LocalDateTime lastRunAt;
    private LocalDateTime lastSuccessAt;
    private String lastStatus;
    private String lastError;
    private String updatedBy;
    private LocalDateTime updateTime;

    public String getJobKey() { return jobKey; }
    public void setJobKey(String jobKey) { this.jobKey = jobKey; }
    public String getJobName() { return jobName; }
    public void setJobName(String jobName) { this.jobName = jobName; }
    public Integer getEnabled() { return enabled; }
    public void setEnabled(Integer enabled) { this.enabled = enabled; }
    public String getScheduleType() { return scheduleType; }
    public void setScheduleType(String scheduleType) { this.scheduleType = scheduleType; }
    public String getScheduleTime() { return scheduleTime; }
    public void setScheduleTime(String scheduleTime) { this.scheduleTime = scheduleTime; }
    public String getScheduleStartTime() { return scheduleStartTime; }
    public void setScheduleStartTime(String scheduleStartTime) { this.scheduleStartTime = scheduleStartTime; }
    public String getScheduleEndTime() { return scheduleEndTime; }
    public void setScheduleEndTime(String scheduleEndTime) { this.scheduleEndTime = scheduleEndTime; }
    public String getWeekDays() { return weekDays; }
    public void setWeekDays(String weekDays) { this.weekDays = weekDays; }
    public Integer getPollIntervalSeconds() { return pollIntervalSeconds; }
    public void setPollIntervalSeconds(Integer pollIntervalSeconds) { this.pollIntervalSeconds = pollIntervalSeconds; }
    public LocalDateTime getLastRunAt() { return lastRunAt; }
    public void setLastRunAt(LocalDateTime lastRunAt) { this.lastRunAt = lastRunAt; }
    public LocalDateTime getLastSuccessAt() { return lastSuccessAt; }
    public void setLastSuccessAt(LocalDateTime lastSuccessAt) { this.lastSuccessAt = lastSuccessAt; }
    public String getLastStatus() { return lastStatus; }
    public void setLastStatus(String lastStatus) { this.lastStatus = lastStatus; }
    public String getLastError() { return lastError; }
    public void setLastError(String lastError) { this.lastError = lastError; }
    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }
    public LocalDateTime getUpdateTime() { return updateTime; }
    public void setUpdateTime(LocalDateTime updateTime) { this.updateTime = updateTime; }
}
