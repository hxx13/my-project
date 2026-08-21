package com.example.demo.modules.twin.common.service;

import com.example.demo.modules.twin.common.entity.TwinJobScheduleConfig;
import org.springframework.util.StringUtils;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * 统一定时任务「是否到期」判定（整分命中 + 错过补跑）。
 * 从 {@link JobSchedulerService} 抽出以便单测覆盖：长任务/线程争用导致整分 tick 被跳过后仍能补跑。
 */
public final class JobScheduleDueEvaluator {

    private static final DateTimeFormatter HM = DateTimeFormatter.ofPattern("HH:mm");

    private JobScheduleDueEvaluator() {
    }

    /** 调度节拍：整分命中或错过计划点（与开机 bootstrapCatchup 同口径）。 */
    public static boolean dueForRun(TwinJobScheduleConfig cfg, LocalDateTime now) {
        return shouldRun(cfg, now) || isMissed(cfg, now);
    }

    public static boolean shouldRun(TwinJobScheduleConfig cfg, LocalDateTime now) {
        if (!matchesDay(cfg, now.getDayOfWeek())) {
            return false;
        }
        String jobKey = cfg.getJobKey();
        if (JobSchedulePolicy.isPollInWindow(jobKey)) {
            if (!inWindow(cfg, now.toLocalTime())) {
                return false;
            }
            return shouldRunByPollInterval(cfg, now);
        }
        if (!isSingleTimeJob(jobKey) && !inWindow(cfg, now.toLocalTime())) {
            return false;
        }
        LocalTime plan = parseTime(cfg.getScheduleTime());
        if (!plan.equals(now.toLocalTime())) {
            return false;
        }
        LocalDateTime lastRun = cfg.getLastRunAt();
        return lastRun == null || !lastRun.withSecond(0).withNano(0).equals(now);
    }

    public static boolean isMissed(TwinJobScheduleConfig cfg, LocalDateTime now) {
        if (JobSchedulePolicy.isPollInWindow(cfg.getJobKey())) {
            return false;
        }
        LocalDateTime latestPlan = latestPlannedTime(cfg, now);
        if (latestPlan == null || latestPlan.isAfter(now)) {
            return false;
        }
        LocalDateTime cfgUpdatedAt = cfg.getUpdateTime();
        if (cfgUpdatedAt != null && latestPlan.isBefore(cfgUpdatedAt)) {
            return false;
        }
        if (JobExecutionRegistry.JOB_RUN_REAPER.equals(cfg.getJobKey())
                || JobExecutionRegistry.JOB_RUN_REAPER_SECOND.equals(cfg.getJobKey())
                || JobExecutionRegistry.JOB_DAILY_EXEMPT_RESET.equals(cfg.getJobKey())) {
            LocalDateTime lastRun = cfg.getLastRunAt();
            return lastRun == null || lastRun.isBefore(latestPlan);
        }
        LocalDateTime successAt = cfg.getLastSuccessAt();
        return successAt == null || successAt.isBefore(latestPlan);
    }

    static LocalDateTime latestPlannedTime(TwinJobScheduleConfig cfg, LocalDateTime now) {
        LocalTime planTime = parseTime(cfg.getScheduleTime());
        for (int i = 0; i <= 7; i++) {
            LocalDateTime candidate = now.minusDays(i).with(planTime).withSecond(0).withNano(0);
            if (!matchesDay(cfg, candidate.getDayOfWeek())) {
                continue;
            }
            if (!candidate.isAfter(now)) {
                return candidate;
            }
        }
        return null;
    }

    static boolean matchesDay(TwinJobScheduleConfig cfg, DayOfWeek dayOfWeek) {
        String type = cfg.getScheduleType() == null ? "DAILY" : cfg.getScheduleType().trim().toUpperCase(Locale.ROOT);
        if ("DAILY".equals(type)) {
            return true;
        }
        Set<Integer> days = parseWeekDays(cfg.getWeekDays());
        if (days.isEmpty()) {
            return true;
        }
        return days.contains(dayOfWeek.getValue());
    }

    static Set<Integer> parseWeekDays(String weekDays) {
        Set<Integer> out = new HashSet<>();
        if (!StringUtils.hasText(weekDays)) {
            return out;
        }
        for (String p : weekDays.split(",")) {
            try {
                int n = Integer.parseInt(p.trim());
                if (n >= 1 && n <= 7) {
                    out.add(n);
                }
            } catch (Exception ignored) {
                // ignore bad token
            }
        }
        return out;
    }

    static LocalTime parseTime(String scheduleTime) {
        try {
            String raw = scheduleTime == null ? "" : scheduleTime.trim();
            if (raw.length() >= 8 && raw.charAt(2) == ':' && raw.charAt(5) == ':') {
                return LocalTime.parse(raw.substring(0, 5), HM);
            }
            return LocalTime.parse(raw, HM);
        } catch (Exception e) {
            return LocalTime.of(2, 0);
        }
    }

    static boolean inWindow(TwinJobScheduleConfig cfg, LocalTime nowTime) {
        LocalTime start = parseTime(StringUtils.hasText(cfg.getScheduleStartTime()) ? cfg.getScheduleStartTime() : "07:00");
        LocalTime end = parseTime(StringUtils.hasText(cfg.getScheduleEndTime()) ? cfg.getScheduleEndTime() : "22:00");
        if (end.equals(start)) {
            return true;
        }
        if (end.isAfter(start)) {
            return !nowTime.isBefore(start) && !nowTime.isAfter(end);
        }
        return !nowTime.isBefore(start) || !nowTime.isAfter(end);
    }

    private static boolean shouldRunByPollInterval(TwinJobScheduleConfig cfg, LocalDateTime now) {
        LocalDateTime lastRun = cfg.getLastRunAt();
        if (lastRun == null) {
            return true;
        }
        int pollSec = JobSchedulePolicy.clampPollInterval(cfg.getJobKey(), cfg.getPollIntervalSeconds());
        return !lastRun.plusSeconds(pollSec).isAfter(now);
    }

    /**
     * 与 {@link JobSchedulerService} 的单点到时任务集合保持同步（用于跳过时间窗校验）。
     */
    static boolean isSingleTimeJob(String jobKey) {
        if (!StringUtils.hasText(jobKey)) {
            return false;
        }
        return JobExecutionRegistry.JOB_PERSONNEL_SYNC.equals(jobKey)
                || JobExecutionRegistry.JOB_MODEL_RECALC.equals(jobKey)
                || JobExecutionRegistry.JOB_GROUP_RECALC.equals(jobKey)
                || JobExecutionRegistry.JOB_ORDER_SYNC.equals(jobKey)
                || JobExecutionRegistry.JOB_ORDER_SYNC_FULL.equals(jobKey)
                || JobExecutionRegistry.JOB_ROOM_MAPPING_REFRESH.equals(jobKey)
                || JobExecutionRegistry.JOB_DH_DEPT_REFRESH.equals(jobKey)
                || JobExecutionRegistry.JOB_DH_GROUP_REFRESH.equals(jobKey)
                || JobExecutionRegistry.JOB_DH_CHANNEL_REFRESH.equals(jobKey)
                || JobExecutionRegistry.JOB_RUN_REAPER.equals(jobKey)
                || JobExecutionRegistry.JOB_RUN_REAPER_SECOND.equals(jobKey)
                || JobExecutionRegistry.JOB_DAILY_EXEMPT_RESET.equals(jobKey)
                || JobExecutionRegistry.JOB_ACCESS_CLEAN_PACKAGE_DAILY.equals(jobKey)
                || JobExecutionRegistry.JOB_DAHUA_SWING_STATS_PULL_PREVIOUS_DAY.equals(jobKey)
                || JobExecutionRegistry.JOB_DAHUA_SWING_STATS_PULL_PREVIOUS_WEEK.equals(jobKey)
                || JobExecutionRegistry.JOB_DAHUA_SWING_STATS_PULL_SINCE_LAST.equals(jobKey)
                || JobExecutionRegistry.JOB_TELEMETRY_ARCHIVE_PURGE.equals(jobKey)
                || JobExecutionRegistry.JOB_CAGE_SPECIAL_STATUS_SCAN.equals(jobKey)
                || JobExecutionRegistry.JOB_CAGE_STATUS_VIOLATION_CHECK.equals(jobKey)
                || JobExecutionRegistry.JOB_STRANDED_VIOLATION_CHECK.equals(jobKey)
                || JobExecutionRegistry.JOB_STRANDED_SIGNOUT_CHECK.equals(jobKey)
                || JobExecutionRegistry.JOB_EXP_RECONCILE.equals(jobKey);
    }
}
