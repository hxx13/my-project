package com.example.demo.modules.cageshelf.entity;

import java.time.LocalDateTime;

/**
 * 笼位全生命周期事件日志：
 * 笼盒移动、类型变更、特殊状态变化、归属变更等。
 */
public class CageEventLog {

    // event_type constants
    public static final String BOX_ARRIVED = "BOX_ARRIVED";
    public static final String BOX_DEPARTED = "BOX_DEPARTED";
    public static final String BOX_MOVED = "BOX_MOVED";
    public static final String TYPE_CHANGED = "TYPE_CHANGED";
    public static final String STATUS_ADDED = "STATUS_ADDED";
    public static final String STATUS_REMOVED = "STATUS_REMOVED";
    public static final String STATUS_CHANGED = "STATUS_CHANGED";
    public static final String PI_CHANGED = "PI_CHANGED";
    public static final String DEPT_CHANGED = "DEPT_CHANGED";

    private Long id;
    private String scanBatchId;
    private String eventType;
    private String cageBoxQrCode;

    private String prevShelveId;
    private String prevPosition;
    private String prevCampusName;
    private String prevRoomName;

    private String currShelveId;
    private String currPosition;
    private String currCampusName;
    private String currRoomName;

    private String prevValueJson;
    private String currValueJson;
    private String detailSummary;

    private String piName;
    private String projectPiName;
    private String departmentName;

    private LocalDateTime changedAt;

    // ---- getters / setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getScanBatchId() { return scanBatchId; }
    public void setScanBatchId(String scanBatchId) { this.scanBatchId = scanBatchId; }

    public String getEventType() { return eventType; }
    public void setEventType(String eventType) { this.eventType = eventType; }

    public String getCageBoxQrCode() { return cageBoxQrCode; }
    public void setCageBoxQrCode(String cageBoxQrCode) { this.cageBoxQrCode = cageBoxQrCode; }

    public String getPrevShelveId() { return prevShelveId; }
    public void setPrevShelveId(String prevShelveId) { this.prevShelveId = prevShelveId; }

    public String getPrevPosition() { return prevPosition; }
    public void setPrevPosition(String prevPosition) { this.prevPosition = prevPosition; }

    public String getPrevCampusName() { return prevCampusName; }
    public void setPrevCampusName(String prevCampusName) { this.prevCampusName = prevCampusName; }

    public String getPrevRoomName() { return prevRoomName; }
    public void setPrevRoomName(String prevRoomName) { this.prevRoomName = prevRoomName; }

    public String getCurrShelveId() { return currShelveId; }
    public void setCurrShelveId(String currShelveId) { this.currShelveId = currShelveId; }

    public String getCurrPosition() { return currPosition; }
    public void setCurrPosition(String currPosition) { this.currPosition = currPosition; }

    public String getCurrCampusName() { return currCampusName; }
    public void setCurrCampusName(String currCampusName) { this.currCampusName = currCampusName; }

    public String getCurrRoomName() { return currRoomName; }
    public void setCurrRoomName(String currRoomName) { this.currRoomName = currRoomName; }

    public String getPrevValueJson() { return prevValueJson; }
    public void setPrevValueJson(String prevValueJson) { this.prevValueJson = prevValueJson; }

    public String getCurrValueJson() { return currValueJson; }
    public void setCurrValueJson(String currValueJson) { this.currValueJson = currValueJson; }

    public String getDetailSummary() { return detailSummary; }
    public void setDetailSummary(String detailSummary) { this.detailSummary = detailSummary; }

    public String getPiName() { return piName; }
    public void setPiName(String piName) { this.piName = piName; }

    public String getProjectPiName() { return projectPiName; }
    public void setProjectPiName(String projectPiName) { this.projectPiName = projectPiName; }

    public String getDepartmentName() { return departmentName; }
    public void setDepartmentName(String departmentName) { this.departmentName = departmentName; }

    public LocalDateTime getChangedAt() { return changedAt; }
    public void setChangedAt(LocalDateTime changedAt) { this.changedAt = changedAt; }
}
