package com.example.demo.modules.ai.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 一条 assistant 回复的**赞 / 踩**。
 *
 * <p>与 {@code ai_drawer_feedback}（意见箱，挂人）**不是一回事**：这个挂在**消息**上，
 * 而且**同一人对同一回复只有一条**（表上唯一键保证，重按就是改那一票）。
 *
 * <p>用途是判据里**显式**的那一路（设计文档 §5），属于**辅助**：样本稀，
 * 主判据是行为（认了 / 没听懂 / 点选 / 弃聊），那几路从留痕里算。
 */
@Data
public class AiMessageFeedback {
    private Long id;
    private Long messageId;
    private Long sessionId;
    private String userId;
    /** {@code up} = 赞 / {@code down} = 踩。 */
    private String vote;
    /** 踩时选一句原因，可空。 */
    private String reason;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
