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
    /**
     * 本轮**实际发给模型**的工具名清单（逗号分隔，已按能力过滤）。
     *
     * <p>为什么要存这个：审计里原来只记了「模型调了什么」，没记「它当时手上有什么」——
     * 于是想判断「是不是选错了工具」（明明有更合适的却没挑），只能靠猜，而且**这段历史永远补不回来**。
     * 建表处那句「审计字段必须一次定全，后补等于历史缺口」说的就是这件事。
     *
     * <p>只写在每轮的 user 消息上（一轮内所有 assistant 消息看到的工具集是同一份）。
     */
    private String toolsOffered;
    /**
     * 本轮模型的**思考正文**（上游 {@code reasoning_content}）。
     *
     * <p>此前一直被丢弃。落库有两个用处：一是界面上折叠展示「它在想什么」；二是日后查
     * 「它当时为什么这么选」时有原文可看 —— 与 {@code toolsOffered} 同一动机（审计字段一次定全）。
     */
    private String reasoningContent;
    /** 本轮思考消耗的 token（上游精确给出，不是估的）。用来显示「思考了多少」。 */
    private Integer reasoningTokens;
    /**
     * 本轮输入里**命中缓存** / **未命中缓存**的 token 数（上游分开给，此前只打了日志）。
     *
     * <p>落库只为**实测命中率**：设计文档 §1.1 那套「命中比未命中便宜约 50 倍 → 共享内容必须拼在最前、
     * 个性化只能追加在最后」的论证，一直缺一个真实数字。同会话第二轮起命中应显著大于 0；
     * 恒为 0 就说明拼装顺序出了问题。
     *
     * <p>不往对话界面露（普通人看不懂），只在后台审计里看。
     */
    private Integer promptCacheHitTokens;
    private Integer promptCacheMissTokens;
    /**
     * **真正的思考用时**（毫秒）：请求发出 → 第一个非思考增量到达。
     *
     * <p>与 {@link #latencyMs} 不是一回事：那个含思考也含正文生成，界面上的「用时」拿它冒充，
     * 显示的是「用户等了多久」而不是「模型想了多久」—— 而等待里的大头往往是工具在查数据。
     *
     * <p>只有流式拿得到这个时刻；老消息这一列是空的，回看时退化成不显示思考时长。
     */
    private Long thinkingMs;
    private String model;
    private Integer latencyMs;
    private Integer promptTokens;
    private Integer completionTokens;
    private LocalDateTime createdAt;
}
