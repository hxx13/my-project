package com.example.demo.modules.print.entity;

/** 打印任务 —— 一次打印请求。 */
public class PrintJob {

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_SENT = "SENT";
    public static final String STATUS_PRINTED = "PRINTED";
    public static final String STATUS_FAILED = "FAILED";

    public static final String SOURCE_CARD_ARCHIVE = "CARD_ARCHIVE";
    public static final String SOURCE_ADMIN_FILE = "ADMIN_FILE";

    private String id;
    private String stationId;
    private String sourceType;
    private String sourceId;
    private String fileName;
    private int copies;
    private String status;
    private int attempts;
    private String lastError;
    private String createdBy;
    private String createdAt;
    private String sentAt;
    private String printedAt;

    public String getId() { return id; }
    public void setId(String v) { this.id = v; }

    public String getStationId() { return stationId; }
    public void setStationId(String v) { this.stationId = v; }

    public String getSourceType() { return sourceType; }
    public void setSourceType(String v) { this.sourceType = v; }

    public String getSourceId() { return sourceId; }
    public void setSourceId(String v) { this.sourceId = v; }

    public String getFileName() { return fileName; }
    public void setFileName(String v) { this.fileName = v; }

    public int getCopies() { return copies; }
    public void setCopies(int v) { this.copies = v; }

    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }

    public int getAttempts() { return attempts; }
    public void setAttempts(int v) { this.attempts = v; }

    public String getLastError() { return lastError; }
    public void setLastError(String v) { this.lastError = v; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String v) { this.createdBy = v; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String v) { this.createdAt = v; }

    public String getSentAt() { return sentAt; }
    public void setSentAt(String v) { this.sentAt = v; }

    public String getPrintedAt() { return printedAt; }
    public void setPrintedAt(String v) { this.printedAt = v; }
}
