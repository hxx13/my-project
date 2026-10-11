package com.example.demo.modules.ai.core;

/**
 * 一轮用户消息的用量汇总，随 {@code done} 事件回给载体。
 *
 * <p>跨轮累加：一次提问可能包含「工具调用轮 + 若干轮」多次模型调用，
 * 这里给的是**整轮合计**，不是最后一次调用的数字 —— 用户想知道的是一次提问总共花了多少。
 *
 * <p><b>{@code latencyMs} 与 {@code modelMs} / {@code toolMs} 的关系</b>：
 * {@code latencyMs} 历史上只累加了**模型调用**那段，**不含工具执行** —— 于是用户等了 20 秒、
 * 界面显示 4 秒（实测反馈）。现在把两段分开给出，用户才知道慢在哪一头。
 * 为了不破坏既有读法，{@code latencyMs} 保持「模型耗时」的原语义不变。
 */
public record AiTurnStats(
        Long messageId,
        String model,
        /** 模型调用累计耗时（历史语义，未变）。 */
        int latencyMs,
        int promptTokens,
        int completionTokens,
        int turns,
        /** 其中模型调用占的毫秒（与 latencyMs 同值，显式给出以便前端不再需要知道这段历史）。 */
        int modelMs,
        /** 其中工具执行占的毫秒。 */
        int toolMs,
        /** 思考消耗的 token（上游精确给出）。 */
        int reasoningTokens,
        /**
         * **真正的思考用时**（毫秒）：从请求发出到「思考结束」那一刻。
         *
         * <p>它量的是**思考**，不是「用户等了多久」—— 后者是 {@link #wallMs()}，里面大头是工具在查数据。
         * 两者要分开显示，否则用户会以为模型想了两分钟。
         *
         * <p>**-1 表示这一轮没测到**（没出现非思考增量），别当成 0 秒。
         */
        long thinkingMs) {

    public int totalTokens() {
        return promptTokens + completionTokens;
    }

    /** 用户实际等待的墙钟时长（模型 + 工具）。这才是「用时」该显示的数。 */
    public int wallMs() {
        return modelMs + toolMs;
    }
}
