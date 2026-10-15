package com.example.demo.modules.broadcast.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 广播分区的独立运行态（方案 × 分区 一行）。
 *
 * <p>方案到点只是**批量启动**若干分区，启动之后每一路都是独立的播放单元。
 * 人工暂停某一路就落一行 {@code paused=1}，调度器的循环/兜底下发时跳过它 ——
 * 否则就是把整组重新绑死，这是现场明确反馈过的问题。
 */
@Data
public class BroadcastPlanZoneState {

    private Long id;

    private Long planId;

    private String mac;

    /** true = 人工暂停，方案不得自动恢复 */
    private Boolean paused;

    private LocalDateTime updatedAt;
}
