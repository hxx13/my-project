package com.example.demo.modules.twin.support;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

/**
 * 门禁联动自动离开：写入自动化日志与流水溯源用的中文叙述（与业务码分离，便于对账）。
 */
public final class TwinSwingLinkageDetailBuilder {

    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private TwinSwingLinkageDetailBuilder() {
    }

    public static String nowTs() {
        return LocalDateTime.now().format(DT);
    }

    /**
     * 待激活占位到期：用户未在「激活卡片规则」门刷卡。
     */
    public static String activationWaitTimerExpired(int expireSeconds, String scheduledExitAt) {
        int sec = Math.max(1, expireSeconds);
        String t = scheduledExitAt == null || scheduledExitAt.isBlank() ? "—" : scheduledExitAt.trim();
        return "待激活超时（" + sec + " 秒），到期「" + t + "」。";
    }

    /**
     * 已激活后，按配置宽限再次计时到期。
     */
    public static String activatedGraceTimerExpired(int graceSeconds, String scheduledExitAt) {
        int sec = Math.max(1, graceSeconds);
        String t = scheduledExitAt == null || scheduledExitAt.isBlank() ? "—" : scheduledExitAt.trim();
        return "已激活宽限到期（" + sec + " 秒），「" + t + "」。";
    }

    /**
     * 刷「离开门禁」或「激活后再次刷卡签退」后排队的延时签退到点触发。
     */
    public static String swingExitDelayTimerFired(String doorLabel, String channelCode, int exitDelaySeconds, String scheduledExitAt) {
        String door = doorLabel == null || doorLabel.isBlank() ? "" : doorLabel.trim();
        String ch = channelCode == null || channelCode.isBlank() ? "—" : channelCode.trim();
        int d = Math.max(0, exitDelaySeconds);
        String t = scheduledExitAt == null || scheduledExitAt.isBlank() ? "—" : scheduledExitAt.trim();
        String who = door.isEmpty() ? ("channel=" + ch) : ("「" + door + "」/" + ch);
        return "延时签退到期（" + d + " 秒），" + who + "，「" + t + "」。";
    }

    /**
     * 刷中「激活卡片规则」门后写入审计。
     */
    public static String activationSuccessDetail(String doorLabel, String channelCode) {
        String door = doorLabel == null || doorLabel.isBlank() ? "" : doorLabel.trim();
        String ch = channelCode == null || channelCode.isBlank() ? "—" : channelCode.trim();
        String who = door.isEmpty() ? ("channel=" + ch) : ("「" + door + "」/" + ch);
        return "激活成功，" + who + "，" + nowTs() + "。";
    }

    /** 从通道缓存查询结果中取展示名 */
    public static String pickChannelName(List<Map<String, Object>> rows, String channelCode) {
        if (rows == null || rows.isEmpty() || channelCode == null || channelCode.isBlank()) {
            return "";
        }
        for (Map<String, Object> m : rows) {
            if (m == null) {
                continue;
            }
            Object c = m.get("channelCode");
            if (c != null && channelCode.equals(String.valueOf(c).trim())) {
                Object n = m.get("channelName");
                if (n != null) {
                    String name = String.valueOf(n).trim();
                    if (!name.isBlank()) {
                        return name;
                    }
                }
            }
        }
        return "";
    }
}
