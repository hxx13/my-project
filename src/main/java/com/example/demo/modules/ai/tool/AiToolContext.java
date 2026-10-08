package com.example.demo.modules.ai.tool;

import com.example.demo.modules.auth.entity.User;

/**
 * 一次工具调用的上下文。
 *
 * <p>{@code actor} 只能来自 JWT 解析（不变量 I1）——**工具签名里没有任何可由模型传入的身份字段**。
 *
 * <p>{@code userText} 是**本轮用户的原话**（确认续跑时是用户点的那个值）。有些闸只能靠它：
 * 模型会把上一轮的时长/房间搬到这一轮（真机两次，第二次真落库了），参数描述压不住，
 * 于是由工具自己核对「本轮到底说没说」。
 */
public record AiToolContext(User actor, Long sessionId, Long messageId, String userText) {

    /** 不需要核对用户原话的场景（读类工具、单测）用这个 */
    public AiToolContext(User actor, Long sessionId, Long messageId) {
        this(actor, sessionId, messageId, null);
    }
}
