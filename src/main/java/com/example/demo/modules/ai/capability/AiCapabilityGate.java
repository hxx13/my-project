package com.example.demo.modules.ai.capability;

import com.example.demo.modules.auth.entity.User;

/**
 * 能力闸门 —— **本架构里两道真正的安全墙之一**（另一道是范围判定 ScopeGuard）。
 *
 * 工具只能声明能力码，判定逻辑集中在这里。判定通过返回 {@code null}，否则返回拒绝原因
 * （原因会写进 {@code ai_tool_call_log.denial_reason}）。
 *
 * 为什么要集中：同一个动作在 Controller 与工具里各写一遍判定，两边一旦不一致就是漏洞
 * （接口摸排文档 §6 通则 2：同一动作在全平台有 4 种权限口径）。
 * Controller 与工具应当调**同一个方法**。
 */
public interface AiCapabilityGate {

    /**
     * @param actor      只能来自 JWT 解析（不变量 I1）
     * @param capability 工具声明的能力码
     * @return null 表示放行；否则为拒绝原因
     */
    String check(User actor, String capability);
}
