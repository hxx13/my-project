package com.example.demo.modules.cageshelf.entity;

/**
 * 笼位图片/笔记历史归档 — 状态变更时自动保存快照。
 */
public class CageCellHistory {
    private Long id;
    private Long animalCageId;
    private String statusField;    // needs_division / needs_special_feeding / has_health_abnormality
    private String imagesJson;     // 归档时的照片 JSON 数组
    private String experimentDesc; // 归档时的实验记录
    private String toggledBy;      // 操作人
    private String action;         // "marked" / "unmarked"
    private String createdAt;

    public Long getId() { return id; }
    public void setId(Long v) { this.id = v; }
    public Long getAnimalCageId() { return animalCageId; }
    public void setAnimalCageId(Long v) { this.animalCageId = v; }
    public String getStatusField() { return statusField; }
    public void setStatusField(String v) { this.statusField = v; }
    public String getImagesJson() { return imagesJson; }
    public void setImagesJson(String v) { this.imagesJson = v; }
    public String getExperimentDesc() { return experimentDesc; }
    public void setExperimentDesc(String v) { this.experimentDesc = v; }
    public String getToggledBy() { return toggledBy; }
    public void setToggledBy(String v) { this.toggledBy = v; }
    public String getAction() { return action; }
    public void setAction(String v) { this.action = v; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String v) { this.createdAt = v; }
}
