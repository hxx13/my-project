package com.example.demo.modules.cageshelf.dto;

/**
 * 笼位数据同步进度（前端轮询用）。
 */
public class CageScanProgressDto {
    private String status;           // idle | running | done | failed
    private String scanBatchId;
    private int totalShelves;
    private int processedShelves;
    private int shelvesSucceeded;
    private int shelvesFailed;
    private String currentRoomName;
    private String currentShelveName;
    private int cagesScanned;
    private int cagesWithStatus;
    private int percent;
    private String startedAt;
    private long updatedAtMs;
    private String message;

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getScanBatchId() { return scanBatchId; }
    public void setScanBatchId(String scanBatchId) { this.scanBatchId = scanBatchId; }
    public int getTotalShelves() { return totalShelves; }
    public void setTotalShelves(int totalShelves) { this.totalShelves = totalShelves; }
    public int getProcessedShelves() { return processedShelves; }
    public void setProcessedShelves(int processedShelves) { this.processedShelves = processedShelves; }
    public int getShelvesSucceeded() { return shelvesSucceeded; }
    public void setShelvesSucceeded(int shelvesSucceeded) { this.shelvesSucceeded = shelvesSucceeded; }
    public int getShelvesFailed() { return shelvesFailed; }
    public void setShelvesFailed(int shelvesFailed) { this.shelvesFailed = shelvesFailed; }
    public String getCurrentRoomName() { return currentRoomName; }
    public void setCurrentRoomName(String currentRoomName) { this.currentRoomName = currentRoomName; }
    public String getCurrentShelveName() { return currentShelveName; }
    public void setCurrentShelveName(String currentShelveName) { this.currentShelveName = currentShelveName; }
    public int getCagesScanned() { return cagesScanned; }
    public void setCagesScanned(int cagesScanned) { this.cagesScanned = cagesScanned; }
    public int getCagesWithStatus() { return cagesWithStatus; }
    public void setCagesWithStatus(int cagesWithStatus) { this.cagesWithStatus = cagesWithStatus; }
    public int getPercent() { return percent; }
    public void setPercent(int percent) { this.percent = percent; }
    public String getStartedAt() { return startedAt; }
    public void setStartedAt(String startedAt) { this.startedAt = startedAt; }
    public long getUpdatedAtMs() { return updatedAtMs; }
    public void setUpdatedAtMs(long updatedAtMs) { this.updatedAtMs = updatedAtMs; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
}
