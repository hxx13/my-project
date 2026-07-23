package com.example.demo.modules.cageshelf.entity;

import lombok.Data;

@Data
public class CageShelfIndex {
    private Long id;
    private Integer campusId;
    private String campusName;
    private Long areaId;
    private String areaName;
    private Long floorId;
    private String floorName;
    private Long roomId;
    private String roomName;
    private Long shelveId;
    private String shelveName;
    private Integer orders;
    private Integer deleted;
    private String createTime;
    private String updateTime;
}
