package com.example.demo.modules.twin.dashboard.support;

import com.example.demo.modules.twin.obligation.delivery.NotifyChannelGuide;

/**
 * 违规记录与 {@code sys_student_notification} 镜像通知的契约常量。
 * <p>
 * C-T1 决策：终态（解除 / 过期 / 已处理 / 被覆盖）与硬删除均采用<strong>撤回</strong>
 * （按 bizType+bizId 删除），避免学生端继续展示已失效内容或留下孤儿通知。
 * ACTIVE 内容编辑则同步更新镜像正文。
 */
public final class ViolationMirrorNotificationSupport {

    public static final String BIZ_TYPE = "STUDENT_VIOLATION";

    private ViolationMirrorNotificationSupport() {
    }

    public static String bizId(long violationId) {
        return String.valueOf(violationId);
    }

    public static boolean isViolationBiz(String bizType) {
        return BIZ_TYPE.equalsIgnoreCase(bizType == null ? "" : bizType.trim());
    }

    /** H5 消息中心 / 手机端 CTA：跳转学生待办处置页。 */
    public static String h5SourceUrl(long obligationId) {
        return NotifyChannelGuide.redirectPath(obligationId);
    }

    /** 小程序消息入口：跳转处置页（非只读公告详情）。 */
    public static String mpPath(long obligationId) {
        return NotifyChannelGuide.redirectPathForChannel("MP", obligationId);
    }

    /** 终态：镜像通知应撤回，学生端不再展示。 */
    public static boolean isTerminalStatus(String status) {
        if (status == null || status.isBlank()) {
            return false;
        }
        return switch (status.trim().toUpperCase()) {
            case "CLEARED", "EXPIRED", "PROCESSED", "SUPERSEDED" -> true;
            default -> false;
        };
    }
}
