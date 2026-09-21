package com.example.demo.modules.print.entity;

/** 打印任务 —— 一次打印请求。 */
public class PrintJob {

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_SENT = "SENT";
    public static final String STATUS_PRINTED = "PRINTED";
    public static final String STATUS_FAILED = "FAILED";
    /** 还没被工位领走时被撤回。领走之后就撤不回来了 —— 那由工位页上的机器决定 */
    public static final String STATUS_CANCELLED = "CANCELLED";

    /** 还在打印机队列里排着（核对任务写） */
    public static final String QUEUE_QUEUED = "QUEUED";
    /** 已不在队列（核对任务写） */
    public static final String QUEUE_CLEARED = "CLEARED";

    /** 普通优先级 */
    public static final int PRIORITY_NORMAL = 0;
    /** 加急：数值大的先被领走 */
    public static final int PRIORITY_URGENT = 10;

    public static final String SOURCE_CARD_ARCHIVE = "CARD_ARCHIVE";
    public static final String SOURCE_ADMIN_FILE = "ADMIN_FILE";

    private String id;
    private String stationId;
    private String sourceType;
    private String sourceId;
    private String fileName;
    private int copies;
    /** 派发时写的一句备注，随任务带到工位页 */
    private String note;
    /** 越大越先被领取 */
    private int priority;
    /** 临时任务：只有发起人自己看得到 */
    private boolean ephemeral;
    private String status;
    private int attempts;
    private String lastError;
    private String createdBy;
    private String createdAt;
    private String sentAt;
    private String printedAt;
    /** 提交给 CUPS 时拿到的作业号；只有直发工位有 */
    private String cupsJobId;
    /** QUEUED / CLEARED / null=未核对。只有核对任务写它 */
    private String queueState;

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

    public String getNote() { return note; }
    public void setNote(String v) { this.note = v; }

    public int getPriority() { return priority; }
    public void setPriority(int v) { this.priority = v; }

    public boolean isEphemeral() { return ephemeral; }
    public void setEphemeral(boolean v) { this.ephemeral = v; }

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

    public String getCupsJobId() { return cupsJobId; }
    public void setCupsJobId(String v) { this.cupsJobId = v; }

    public String getQueueState() { return queueState; }
    public void setQueueState(String v) { this.queueState = v; }
}
