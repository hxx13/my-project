package com.example.demo.modules.agv.analysis.model;

import java.time.LocalDateTime;

public class AgvSpatialElement {
    private Long id;
    private String name;
    private String mapName;
    private String elementType;    // STATION_ZONE | POLYGON_ZONE | POI | STATION_PATTERN
    private String stationPattern; // "LM1199" or "LM11*"
    private String polygonJson;    // JSON array [{x,y},...]
    private Double poiX;
    private Double poiY;
    private Double poiRadiusM;
    private String semanticTags;   // JSON array ["充电","作业"]
    private String color;
    private Boolean isActive;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getMapName() { return mapName; }
    public void setMapName(String mapName) { this.mapName = mapName; }
    public String getElementType() { return elementType; }
    public void setElementType(String elementType) { this.elementType = elementType; }
    public String getStationPattern() { return stationPattern; }
    public void setStationPattern(String stationPattern) { this.stationPattern = stationPattern; }
    public String getPolygonJson() { return polygonJson; }
    public void setPolygonJson(String polygonJson) { this.polygonJson = polygonJson; }
    public Double getPoiX() { return poiX; }
    public void setPoiX(Double poiX) { this.poiX = poiX; }
    public Double getPoiY() { return poiY; }
    public void setPoiY(Double poiY) { this.poiY = poiY; }
    public Double getPoiRadiusM() { return poiRadiusM; }
    public void setPoiRadiusM(Double poiRadiusM) { this.poiRadiusM = poiRadiusM; }
    public String getSemanticTags() { return semanticTags; }
    public void setSemanticTags(String semanticTags) { this.semanticTags = semanticTags; }
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean isActive) { this.isActive = isActive; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
