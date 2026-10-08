package com.example.demo.modules.ai.core;

/**
 * 一轮用户消息的用量汇总，随 {@code done} 事件回给载体。
 *
 * <p>跨轮累加：一次提问可能包含「工具调用轮 + 若干轮」多次模型调用，
 * 这里给的是**整轮合计**，不是最后一次调用的数字 —— 用户想知道的是一次提问总共花了多少。
 */
public record AiTurnStats(
        Long messageId,
        String model,
        int latencyMs,
        int promptTokens,
        int completionTokens,
        int turns) {

    public int totalTokens() {
        return promptTokens + completionTokens;
    }
}
