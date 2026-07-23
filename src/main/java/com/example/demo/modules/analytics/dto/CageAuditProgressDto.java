package com.example.demo.modules.analytics.dto;

/**
 * 笼架占用订阅后异步清算时的拉取进度（内存态，仅当前运行中任务有效）。
 */
public class CageAuditProgressDto {

    /** idle | running | done | failed */
    private String status;
    private long viewId;
    private String message;
    /** 当前清算周期：day | week | month */
    private String periodType;
    private String periodLabel;
    private int cycleIndex;
    private int cycleTotal;
    private int totalShelves;
    private int processedShelves;
    private int batchIndex;
    private int batchCount;
    private int percent;
    private long updatedAtMs;

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public long getViewId() {
        return viewId;
    }

    public void setViewId(long viewId) {
        this.viewId = viewId;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public String getPeriodType() {
        return periodType;
    }

    public void setPeriodType(String periodType) {
        this.periodType = periodType;
    }

    public String getPeriodLabel() {
        return periodLabel;
    }

    public void setPeriodLabel(String periodLabel) {
        this.periodLabel = periodLabel;
    }

    public int getCycleIndex() {
        return cycleIndex;
    }

    public void setCycleIndex(int cycleIndex) {
        this.cycleIndex = cycleIndex;
    }

    public int getCycleTotal() {
        return cycleTotal;
    }

    public void setCycleTotal(int cycleTotal) {
        this.cycleTotal = cycleTotal;
    }

    public int getTotalShelves() {
        return totalShelves;
    }

    public void setTotalShelves(int totalShelves) {
        this.totalShelves = totalShelves;
    }

    public int getProcessedShelves() {
        return processedShelves;
    }

    public void setProcessedShelves(int processedShelves) {
        this.processedShelves = processedShelves;
    }

    public int getBatchIndex() {
        return batchIndex;
    }

    public void setBatchIndex(int batchIndex) {
        this.batchIndex = batchIndex;
    }

    public int getBatchCount() {
        return batchCount;
    }

    public void setBatchCount(int batchCount) {
        this.batchCount = batchCount;
    }

    public int getPercent() {
        return percent;
    }

    public void setPercent(int percent) {
        this.percent = percent;
    }

    public long getUpdatedAtMs() {
        return updatedAtMs;
    }

    public void setUpdatedAtMs(long updatedAtMs) {
        this.updatedAtMs = updatedAtMs;
    }
}
