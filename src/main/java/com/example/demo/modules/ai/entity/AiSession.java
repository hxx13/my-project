package com.example.demo.modules.ai.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * AI 对话会话。
 */
@Data
public class AiSession {
    private Long id;
    private String userId;
    private String title;
    private String source;          // web / mp
    private String contextPage;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
