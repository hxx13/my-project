package com.example.demo.modules.twin.common.service;

import org.springframework.util.StringUtils;

/**
 * 统一定时任务调度策略：区分「窗口内按间隔轮询」与「每日固定时刻」等模式，
 * 避免门禁审计/统计类任务误用默认 schedule_time=02:00 导致永不触发。
 */
public final class JobSchedulePolicy {

    private JobSchedulePolicy() {
    }

    /** 在 schedule_start~end 窗口内，按 poll_interval_seconds 重复执行 */
    public static boolean isPollInWindow(String jobKey) {
        if (!StringUtils.hasText(jobKey)) {
            return false;
        }
        return JobExecutionRegistry.JOB_ARO_PENETRATION_POLL.equals(jobKey);
    }

    /** 每日固定时刻执行一次（非窗口内轮询） */
    public static boolean isDailyOnceAtScheduleTime(String jobKey) {
        if (!StringUtils.hasText(jobKey)) {
            return false;
        }
        return JobExecutionRegistry.JOB_DAHUA_SWING_STATS_PULL_PREVIOUS_DAY.equals(jobKey)
                || JobExecutionRegistry.JOB_DAHUA_SWING_STATS_PULL_PREVIOUS_WEEK.equals(jobKey)
                || JobExecutionRegistry.JOB_DAHUA_SWING_STATS_PULL_SINCE_LAST.equals(jobKey)
                || JobExecutionRegistry.JOB_ACCESS_CLEAN_PACKAGE_DAILY.equals(jobKey);
    }

    public static int defaultPollIntervalSeconds(String jobKey) {
        if (JobExecutionRegistry.JOB_ARO_PENETRATION_POLL.equals(jobKey)) {
            return 60;
        }
        return 60;
    }

    public static int clampPollInterval(String jobKey, Integer seconds) {
        int raw = seconds == null ? defaultPollIntervalSeconds(jobKey) : seconds;
        int max = isPollInWindow(jobKey) ? 86400 : 3600;
        return Math.max(10, Math.min(max, raw));
    }
}
