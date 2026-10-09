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
 *
 * <p>{@code platform} 是**载体**（"web" / "mp"）、{@code view} 是**视角**（教职工 / 学生），两者都由服务端
 * 从请求与身份推出来 —— 模型同样影响不到。它们只给「同一个能力在不同端/不同视角落点不同」的工具用：
 * 页面导航在小程序上要返回小程序的页面路径，在学生视角下要返回学生自己的页面集。
 */
public record AiToolContext(User actor, Long sessionId, Long messageId, String userText,
                            String platform, AiView view) {

    /** 不需要核对用户原话、也不关心载体的场景（读类工具、单测）用这个 */
    public AiToolContext(User actor, Long sessionId, Long messageId) {
        this(actor, sessionId, messageId, null, null, null);
    }

    /** 需要核对用户原话、但不关心载体（如计时器到点执行）用这个 */
    public AiToolContext(User actor, Long sessionId, Long messageId, String userText) {
        this(actor, sessionId, messageId, userText, null, null);
    }

    /** 是不是小程序载体。认不出来一律按 web —— 失败回落方向要和「默认载体」一致。 */
    public boolean miniProgram() {
        return "mp".equalsIgnoreCase(platform);
    }

    /**
     * 是不是学生视角。**认不出来按教职工处理**（null → false）：视角只用来挑包与挑页面集，
     * 漏判时给教职工那套更保守 —— 学生拿不到教职工页面才是要紧的方向。
     */
    public boolean studentView() {
        return view == AiView.STUDENT;
    }
}
