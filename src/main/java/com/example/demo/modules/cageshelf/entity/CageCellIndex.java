package com.example.demo.modules.cageshelf.entity;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;

/**
 * 笼位 ID 索引 — 每个笼架的 80 个笼格与 ARO animalCageId 的映射。
 * 一次同步后本地可独立定位任意笼格，不再依赖 ARO 实时查询。
 *
 * ARO 雪花 ID 超过 JS Number.MAX_SAFE_INTEGER，JSON 必须以字符串输出，
 * 否则浏览器解析后末位会变成 00（精度丢失）。
 */
public class CageCellIndex {
    private Long id;
    private Long shelfIndexId;       // FK → cage_shelf_index.id
    @JsonSerialize(using = ToStringSerializer.class)
    private Long shelveId;           // ARO shelveId（冗余，方便按架子查询）
    private Integer positionX;       // 1-8
    private Integer positionY;       // 1-10
    @JsonSerialize(using = ToStringSerializer.class)
    private Long animalCageId;       // ARO 笼位ID（核心索引键）
    private Boolean hasCageBox;      // 当前是否有笼盒绑定
    private String cageBoxCode;      // 笼盒编号（如有）
    private String lastSyncStatus;   // OK / EMPTY / ERROR
    private String lastSyncError;    // 同步失败原因
    private String syncedAt;         // 最后同步时间

    // ---- getters / setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getShelfIndexId() { return shelfIndexId; }
    public void setShelfIndexId(Long shelfIndexId) { this.shelfIndexId = shelfIndexId; }

    public Long getShelveId() { return shelveId; }
    public void setShelveId(Long shelveId) { this.shelveId = shelveId; }

    public Integer getPositionX() { return positionX; }
    public void setPositionX(Integer positionX) { this.positionX = positionX; }

    public Integer getPositionY() { return positionY; }
    public void setPositionY(Integer positionY) { this.positionY = positionY; }

    public Long getAnimalCageId() { return animalCageId; }
    public void setAnimalCageId(Long animalCageId) { this.animalCageId = animalCageId; }

    public Boolean getHasCageBox() { return hasCageBox; }
    public void setHasCageBox(Boolean hasCageBox) { this.hasCageBox = hasCageBox; }

    public String getCageBoxCode() { return cageBoxCode; }
    public void setCageBoxCode(String cageBoxCode) { this.cageBoxCode = cageBoxCode; }

    public String getLastSyncStatus() { return lastSyncStatus; }
    public void setLastSyncStatus(String lastSyncStatus) { this.lastSyncStatus = lastSyncStatus; }

    public String getLastSyncError() { return lastSyncError; }
    public void setLastSyncError(String lastSyncError) { this.lastSyncError = lastSyncError; }

    public String getSyncedAt() { return syncedAt; }
    public void setSyncedAt(String syncedAt) { this.syncedAt = syncedAt; }
}
