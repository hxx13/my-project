package com.example.demo.modules.broadcast.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 广播播放记录。现场「时好时坏」时靠它定位是哪次没响、为什么。
 * 见 db/bootstrap-broadcast-play-log.sql 的表注释。
 */
@Data
public class BroadcastPlayLog {

    private Long id;

    private Long planId;

    /** 方案名快照：方案删了记录仍可读 */
    private String planName;

    /** SCHEDULE 定时 / CATCHUP 补播 / MANUAL 手动 */
    private String source;

    /** PLAY / STOP */
    private String action;

    /** 触发时刻（平台时间） */
    private LocalDateTime firedAt;

    /** 本次目标分区 MAC 数组（JSON 文本） */
    private String zoneMacs;

    /** 本次曲目（JSON 文本） */
    private String songPaths;

    private Boolean success;

    private String message;

    /** 手动触发时的操作人 */
    private String operator;

    private LocalDateTime createdAt;
}
