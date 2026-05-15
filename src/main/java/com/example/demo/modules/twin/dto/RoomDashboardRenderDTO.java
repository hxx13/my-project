package com.example.demo.modules.twin.dto;

import lombok.Data;
import java.util.List;
import java.util.ArrayList;

@Data
public class RoomDashboardRenderDTO {
    // === 物理基座数据 (来自 SQLite room_config) ===
    /** room_config 主键（历史字段名 roomId，勿与流水 room_id 混淆） */
    private Long roomId;
    /** 配置原文；可含多个流水 room_id（分隔符同 room_config），用于满员与监控索引 */
    private String capacityBindRoomId;
    private String campus;
    private String roomName;
    private Integer totalCapacity;

    // === 动态流水数据 (来自 ARO/大华) ===
    private Integer remainingCards;
    private Integer campusUserCount;
    private Integer borrowedCardCount;
    private Integer followingCount;

    // === 人员明细 (供弹窗使用) ===
    private List<Object> occupants = new ArrayList<>(); // 这里的 Object 请替换为你实际的 Occupant 类
}