package com.example.demo.modules.ai.timer.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 一条 AI 计时器 —— 「某个工具，在某个绝对时刻，替某个人跑一次」。
 *
 * <p><b>时间只有一个锚点：{@link #fireAt}</b>。库里**不存**「还剩 N 秒」那种派生量 ——
 * 存了它就得有人持续刷新，服务器一停账就假了（这正是本功能要避开的坑）。
 * 倒计时由前端拿 {@code fireAt} 与服务端时间对表后本地推算。
 *
 * <p>三个 owner 快照不能只留 id：列表要显示人名，而角色会变（同 {@code ai_message} 的留痕原则）。
 */
@Data
public class AiTimer {

    /** 等触发。 */
    public static final String STATUS_PENDING = "PENDING";
    /** 已被调度器认领，正在执行（用于防止重复执行；中断的由 {@code recoverStale} 收成 FAILED）。 */
    public static final String STATUS_FIRING = "FIRING";
    /** 执行完成。 */
    public static final String STATUS_FIRED = "FIRED";
    /** 写类工具到点后等建单人确认（读类工具不会停在这里）。 */
    public static final String STATUS_AWAITING_CONFIRM = "AWAITING_CONFIRM";
    /** 用户/模型主动停掉，或写类工具被放弃。 */
    public static final String STATUS_CANCELLED = "CANCELLED";
    /** 执行失败（工具不存在 / 权限已失效 / 执行体抛错）。 */
    public static final String STATUS_FAILED = "FAILED";

    private Long id;
    private String ownerUserId;
    private String ownerNameSnapshot;
    private String ownerRoleSnapshot;
    /** 人话标签，模型写的（「5 分钟后同步门禁流水」）。 */
    private String label;
    private String toolName;
    /** 参数原文 JSON（模型原样传的，不改写）。 */
    private String argsJson;
    /** 绝对触发时间 —— 倒计时与调度的唯一依据。 */
    private LocalDateTime fireAt;
    private String status;
    private Long sessionId;
    private Long messageId;
    private LocalDateTime createdAt;
    /** 认领时刻（检测「卡在 FIRING」的僵尸单）。 */
    private LocalDateTime claimedAt;
    private LocalDateTime firedAt;
    private LocalDateTime cancelledAt;
    private String confirmedBy;
    private String resultText;
    private Boolean ok;
    private String errorMessage;
    private Integer deleted;

    /** 还在倒计时 / 等人处理的状态（列表分组与「能不能取消」都看它）。 */
    public boolean isOpen() {
        return STATUS_PENDING.equals(status) || STATUS_FIRING.equals(status)
                || STATUS_AWAITING_CONFIRM.equals(status);
    }
}
