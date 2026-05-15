package com.example.demo.modules.roommapping.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
public class RoomMappingRoomView {
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
    /** 来自官方接口同步的权限等级（越小越高） */
    private Integer officialPermissionLevel;
    private LocalDateTime updatedAt;
    private List<String> channelCodes = new ArrayList<>();
    private List<ChannelItem> channels = new ArrayList<>();

    @Data
    public static class ChannelItem {
        private String channelCode;
        private String label;
        private Integer sortOrder;
    }
}
