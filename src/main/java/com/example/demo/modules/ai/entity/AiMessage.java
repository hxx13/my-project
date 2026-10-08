package com.example.demo.modules.ai.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * AI 对话消息。append-only —— 只插入，不更新、不删除。
 *
 * content 与 rawToolCalls 一律存**原文**：归一化是给模型看的，审计要的是「到底发生了什么」。
 */
@Data
public class AiMessage {
    private Long id;
    private Long sessionId;
    private Integer seq;
    private String role;                    // user / assistant / tool
    private String content;
    private String rawToolCalls;
    /** role=tool 时对应哪次调用 —— 重放历史时 OpenAI 协议要求带上，不存就无法重放。 */
    private String toolCallId;
    private String actorUserId;
    private String actorRoleSnapshot;       // 发起人当时的角色，角色会变故必须存快照
    private String source;
    private String contextJson;
    private String model;
    private Integer latencyMs;
    private Integer promptTokens;
    private Integer completionTokens;
    private LocalDateTime createdAt;
}
