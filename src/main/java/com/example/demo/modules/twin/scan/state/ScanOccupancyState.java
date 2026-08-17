package com.example.demo.modules.twin.scan.state;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 扫码进出本地状态机：记录某用户当前在馆/离馆 + 当前在馆房间。
 */
@Data
public class ScanOccupancyState {
    /** 主键，ARO 19 位认证 id */
    private String userId;
    /** INSIDE / OUTSIDE */
    private String state;
    /** 当前在馆房间 id（单房间） */
    private String currentRoomId;
    /** 当前房间名（冗余展示） */
    private String currentRoomName;
    /** 最近一次本地 enter 流水 id */
    private String enterLogId;
    /** 更新时间 */
    private LocalDateTime updatedAt;
}
