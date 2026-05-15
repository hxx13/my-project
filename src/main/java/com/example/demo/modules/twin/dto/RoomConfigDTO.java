package com.example.demo.modules.twin.dto;

import lombok.Data;

@Data
public class RoomConfigDTO {
    private String campus;
    private String roomName;
    private Integer capacity;
    private String mappingAliases;
    /** 可选；单个或多个流水 room_id（逗号/中文逗号/分号分隔），合并计入本条配置的满员与概览 */
    private String capacityBindRoomId;
}