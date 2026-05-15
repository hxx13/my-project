package com.example.demo.modules.twin.entity;

import lombok.Data;

@Data
public class RoomConfig {
    private Long id;
    private String campus;
    private String roomName;
    private Integer capacity;
    private String mappingAliases;
    /**
     * 与 aro_access_log.room_id 一致；多个后室共一条前室限载时可填多个 id，
     * 与 mapping_aliases 相同约定：英文逗号、中文逗号、分号或空白分隔。
     */
    private String capacityBindRoomId;
    private Integer isActive;
}
