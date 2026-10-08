package com.example.demo.modules.ai.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * AI 工具调用审计。append-only。
 *
 * **被拒绝的调用也要记** —— 同一用户连续被拒 = 有人在试探，这比成功记录更有用，
 * 所以 capabilityGranted=false / executed=false 的行不是噪音，是主体。
 */
@Data
public class AiToolCallLog {
    private Long id;
    private Long sessionId;
    private Long messageId;
    private String toolName;
    private String rawArguments;            // 模型原样传的参数，不归一化
    private String requiredCapability;
    private Boolean capabilityGranted;
    private String denialReason;
    private Boolean executed;               // 被拒 / 被确认拦下 = false
    private String rawResult;
    private Boolean ok;
    private String errorMessage;
    private String confirmedBy;
    private LocalDateTime createdAt;
}
