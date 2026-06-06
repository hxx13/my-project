package com.example.demo.modules.cageshelf.entity;

/**
 * 特殊状态全量扫描落库实体。
 */
public class CageSpecialStatusSnapshot {
    private Long id;
    private String scanBatchId;
    private Long shelveId;
    private Long roomId;
    private String campusName;
    private String roomName;
    private Integer positionX;
    private Integer positionY;
    private String positionLabel;
    private String statusCode;
    private String statusLabel;
    private String piName;
    private String departmentName;
    private String projectPiName;
    private String detailName;
    private String detailDescription;
    private String cageBoxQrCode;
    private Integer animalCageType;
    private String scannedAt;

    // ---- getters / setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getScanBatchId() { return scanBatchId; }
    public void setScanBatchId(String scanBatchId) { this.scanBatchId = scanBatchId; }
    public Long getShelveId() { return shelveId; }
    public void setShelveId(Long shelveId) { this.shelveId = shelveId; }
    public Long getRoomId() { return roomId; }
    public void setRoomId(Long roomId) { this.roomId = roomId; }
    public String getCampusName() { return campusName; }
    public void setCampusName(String campusName) { this.campusName = campusName; }
    public String getRoomName() { return roomName; }
    public void setRoomName(String roomName) { this.roomName = roomName; }
    public Integer getPositionX() { return positionX; }
    public void setPositionX(Integer positionX) { this.positionX = positionX; }
    public Integer getPositionY() { return positionY; }
    public void setPositionY(Integer positionY) { this.positionY = positionY; }
    public String getPositionLabel() { return positionLabel; }
    public void setPositionLabel(String positionLabel) { this.positionLabel = positionLabel; }
    public String getStatusCode() { return statusCode; }
    public void setStatusCode(String statusCode) { this.statusCode = statusCode; }
    public String getStatusLabel() { return statusLabel; }
    public void setStatusLabel(String statusLabel) { this.statusLabel = statusLabel; }
    public String getPiName() { return piName; }
    public void setPiName(String piName) { this.piName = piName; }
    public String getDepartmentName() { return departmentName; }
    public void setDepartmentName(String departmentName) { this.departmentName = departmentName; }
    public String getProjectPiName() { return projectPiName; }
    public void setProjectPiName(String projectPiName) { this.projectPiName = projectPiName; }
    public String getDetailName() { return detailName; }
    public void setDetailName(String detailName) { this.detailName = detailName; }
    public String getDetailDescription() { return detailDescription; }
    public void setDetailDescription(String detailDescription) { this.detailDescription = detailDescription; }
    public String getCageBoxQrCode() { return cageBoxQrCode; }
    public void setCageBoxQrCode(String cageBoxQrCode) { this.cageBoxQrCode = cageBoxQrCode; }
    public Integer getAnimalCageType() { return animalCageType; }
    public void setAnimalCageType(Integer animalCageType) { this.animalCageType = animalCageType; }
    public String getScannedAt() { return scannedAt; }
    public void setScannedAt(String scannedAt) { this.scannedAt = scannedAt; }
}
