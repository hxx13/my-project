package com.example.demo.modules.twin.obligation.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TwinObligationReceipt {
    private Long id;
    private Long obligationId;
    private String subjectUserId;
    private String channel;
    private Integer attemptNo;
    private String answerPayload;
    private LocalDateTime completedAt;
    private LocalDateTime createdAt;
}
