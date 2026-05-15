package com.example.demo.modules.twin.support;

/**
 * 大华门禁联动：写入审计时的简短中文说明（不向操作员展示通道编码、state 英文码等）。
 */
public final class TwinActivationLinkageLabels {

    private TwinActivationLinkageLabels() {
    }

    /** 与 {@link com.example.demo.modules.twin.service.DahuaSwingRuleEngineService#PENDING_ACTIVATION_CHANNEL} 一致 */
    public static final String PENDING_ACTIVATION_CHANNEL = "__PENDING_ACTIVATION__";

    public static String labelActivationState(String state) {
        if (state == null || state.isBlank()) {
            return "未知";
        }
        return switch (state.trim()) {
            case "PENDING_ACTIVATION" -> "扫过后，需要刷卡激活";
            case "AUTO_EXIT_SCHEDULED" -> "自动执行下一步";
            case "ACTIVATED" -> "权限激活成功";
            case "IDLE" -> "未执行激活";
            default -> state;
        };
    }

    /**
     * 写入自动化日志前的摘要（大白话）：不出现编码或英文 state。
     */
    public static String formatLinkageSnapshot(String state, String channelCode, String scheduledExitAt) {
        String t = scheduledExitAt == null || scheduledExitAt.isBlank() ? "—" : scheduledExitAt.trim();
        String st = state == null ? "" : state.trim();
        if ("PENDING_ACTIVATION".equalsIgnoreCase(st) && PENDING_ACTIVATION_CHANNEL.equals(channelCode)) {
            return "待激活，到期「" + t + "」。";
        }
        if ("AUTO_EXIT_SCHEDULED".equalsIgnoreCase(st)) {
            return "延时签退，计划「" + t + "」。";
        }
        if ("ACTIVATED".equalsIgnoreCase(st)) {
            if (scheduledExitAt == null || scheduledExitAt.isBlank()) {
                return "已激活。";
            }
            return "已激活，计划「" + t + "」。";
        }
        return labelActivationState(state) + "，「" + t + "」。";
    }
}
