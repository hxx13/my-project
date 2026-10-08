package com.example.demo.modules.ai.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * AI 对话挂起（澄清 / 确认）。
 *
 * chosenValue 是**可信输入** —— 它来自用户点击，不是模型生成，所以它可以直接当实体解析的结果用。
 * 挂起态只存服务端，前端只回传选择值（不变量 I4）。
 */
@Data
public class AiInteraction {
    public static final String KIND_CONFIRM = "confirm";
    public static final String KIND_CLARIFY = "clarify";

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_RESOLVED = "RESOLVED";
    public static final String STATUS_EXPIRED = "EXPIRED";

    private Long id;
    private Long sessionId;
    private Long messageId;
    /** 被挂起的**那一次**工具调用（同一条 assistant 轮里可能有多条）。 */
    private String toolCallId;
    private String token;
    private String kind;                    // confirm / clarify
    private String question;
    private String optionsJson;
    private String chosenValue;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime resolvedAt;
}
