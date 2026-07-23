package com.example.demo.modules.roommapping.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class RoomMappingRoom {
    private Long id;
    private Integer ruleNo;
    private String shelfId;
    private String regionId;
    private String regionName;
    private String floorId;
    private String floorName;
    private String roomId;
    private String roomName;
    private String rackName;
    private String tags;
    private String sourceRowHash;
    /** ARO 官方「可进房间」接口中的 level，数字越小权限越高 */
    private Integer officialPermissionLevel;
    private LocalDateTime updatedAt;
}
