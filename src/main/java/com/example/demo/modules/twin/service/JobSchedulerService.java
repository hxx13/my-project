package com.example.demo.modules.twin.service;

import com.example.demo.modules.telemetry.dto.TelemetryWinccDockPollConfigDto;
import com.example.demo.modules.twin.entity.TwinJobScheduleConfig;
import com.example.demo.modules.twin.mapper.TwinJobScheduleConfigMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class JobSchedulerService {
    private static final DateTimeFormatter HM = DateTimeFormatter.ofPattern("HH:mm");

    private final TwinJobScheduleConfigMapper mapper;
    private final JobExecutionRegistry registry;
    private final JdbcTemplate jdbcTemplate;
    private final TwinAutomationLogService automationLogService;
    private volatile boolean tableReady = false;

    public JobSchedulerService(TwinJobScheduleConfigMapper mapper,
                               JobExecutionRegistry registry,
                               JdbcTemplate jdbcTemplate,
                               TwinAutomationLogService automationLogService) {
        this.mapper = mapper;
        this.registry = registry;
        this.jdbcTemplate = jdbcTemplate;
        this.automationLogService = automationLogService;
    }

    public List<TwinJobScheduleConfig> listAll() {
        ensureDefaults();
        return mapper.selectAll();
    }

    /**
     * 程序坞温湿度页读取：不参与服务端 tick 的 TELEMETRY_WINCC_UI 行。
     */
    public TelemetryWinccDockPollConfigDto getWinccDockPollConfig() {
        return buildWinccTelemetryLikeDockPollConfig(JobExecutionRegistry.JOB_TELEMETRY_WINCC_UI);
    }

    /** TELEMETRY_WINCC_LIMITS_UI：限值低频拉取（管理页配置；调度器读取） */
    public TelemetryWinccDockPollConfigDto getWinccLimitsDockPollConfig() {
        return buildWinccTelemetryLikeDockPollConfig(JobExecutionRegistry.JOB_TELEMETRY_WINCC_LIMITS_UI);
    }

    private TelemetryWinccDockPollConfigDto buildWinccTelemetryLikeDockPollConfig(String jobKey) {
        ensureDefaults();
        TwinJobScheduleConfig cfg = mapper.selectByJobKey(jobKey);
        if (cfg == null) {
            return TelemetryWinccDockPollConfigDto.builder()
                    .scheduleEnabled(false)
                    .pollIntervalSeconds(60)
                    .scheduleStartTime("07:00")
                    .scheduleEndTime("22:00")
                    .weekDays("1,2,3,4,5,6,7")
                    .scheduleType("DAILY")
                    .build();
        }
        int poll = cfg.getPollIntervalSeconds() == null ? 60 : Math.max(10, Math.min(3600, cfg.getPollIntervalSeconds()));
        return TelemetryWinccDockPollConfigDto.builder()
                .scheduleEnabled(cfg.getEnabled() != null && cfg.getEnabled() == 1)
                .pollIntervalSeconds(poll)
                .scheduleStartTime(StringUtils.hasText(cfg.getScheduleStartTime()) ? cfg.getScheduleStartTime() : "07:00")
                .scheduleEndTime(StringUtils.hasText(cfg.getScheduleEndTime()) ? cfg.getScheduleEndTime() : "22:00")
                .weekDays(StringUtils.hasText(cfg.getWeekDays()) ? cfg.getWeekDays() : "1,2,3,4,5,6,7")
                .scheduleType(cfg.getScheduleType() == null ? "DAILY" : cfg.getScheduleType())
                .build();
    }

    /**
     * 定时管理中「动物房温湿度·程序坞」任务开关是否为开（与后台 WinCC 拉取是否改走该配置相关）。
     */
    public boolean isWinccTelemetryMasterSchedulePullEnabled() {
        return isWinccTelemetryLikeScheduleEnabled(JobExecutionRegistry.JOB_TELEMETRY_WINCC_UI);
    }

    public boolean isWinccLimitsTelemetryMasterSchedulePullEnabled() {
        return isWinccTelemetryLikeScheduleEnabled(JobExecutionRegistry.JOB_TELEMETRY_WINCC_LIMITS_UI);
    }

    private boolean isWinccTelemetryLikeScheduleEnabled(String jobKey) {
        ensureDefaults();
        TwinJobScheduleConfig cfg = mapper.selectByJobKey(jobKey);
        return cfg != null && cfg.getEnabled() != null && cfg.getEnabled() == 1;
    }

    /**
     * 开关开启且当前时刻落在周计划 + 日窗口内（与程序坞页 gate 一致）。
     */
    public boolean isWinccTelemetryScheduleInEffectNow() {
        return isWinccTelemetryLikeScheduleInEffectNow(JobExecutionRegistry.JOB_TELEMETRY_WINCC_UI);
    }

    public boolean isWinccLimitsTelemetryScheduleInEffectNow() {
        return isWinccTelemetryLikeScheduleInEffectNow(JobExecutionRegistry.JOB_TELEMETRY_WINCC_LIMITS_UI);
    }

    private boolean isWinccTelemetryLikeScheduleInEffectNow(String jobKey) {
        ensureDefaults();
        TwinJobScheduleConfig cfg = mapper.selectByJobKey(jobKey);
        if (cfg == null || cfg.getEnabled() == null || cfg.getEnabled() != 1) {
            return false;
        }
        if (!matchesDay(cfg, LocalDateTime.now().getDayOfWeek())) {
            return false;
        }
        return inWindow(cfg, LocalDateTime.now().toLocalTime());
    }

    /** TELEMETRY_WINCC_UI 配置的轮询间隔（秒），已钳制 10～3600 */
    public int getWinccTelemetryScheduledPollSeconds() {
        return getWinccDockPollConfig().getPollIntervalSeconds();
    }

    public int getWinccLimitsTelemetryScheduledPollSeconds() {
        return getWinccLimitsDockPollConfig().getPollIntervalSeconds();
    }

    public TwinJobScheduleConfig updateSchedule(TwinJobScheduleConfig input, String updatedBy) {
        ensureDefaults();
        TwinJobScheduleConfig existing = mapper.selectByJobKey(input.getJobKey());
        if (input.getPollIntervalSeconds() == null) {
            if (existing != null && existing.getPollIntervalSeconds() != null) {
                input.setPollIntervalSeconds(existing.getPollIntervalSeconds());
            } else {
                input.setPollIntervalSeconds(60);
            }
        }
        int clampedPoll = Math.max(10, Math.min(3600, input.getPollIntervalSeconds()));
        input.setPollIntervalSeconds(clampedPoll);

        if (isSingleTimeJob(input.getJobKey())) {
            // 单次定时任务不使用时间段窗口，固定全天，避免误配窗口导致不触发。
            input.setScheduleStartTime("00:00");
            input.setScheduleEndTime("23:59");
        } else {
            if (!StringUtils.hasText(input.getScheduleStartTime())) input.setScheduleStartTime("07:00");
            if (!StringUtils.hasText(input.getScheduleEndTime())) input.setScheduleEndTime("22:00");
        }
        validate(input);
        input.setUpdatedBy(updatedBy);
        mapper.updateSchedule(input);
        return mapper.selectByJobKey(input.getJobKey());
    }

    public void runManual(String jobKey, String updatedBy) {
        ensureDefaults();
        runWithStatus(jobKey, updatedBy);
    }

    /**
     * 冻结联动任务对齐：
     * - RUN_REAPER：第一次冻结
     * - RUN_REAPER_SECOND：第二次冻结
     * - DAILY_EXEMPT_RESET：每日豁免回收
     */
    public void syncFreezeJobs(boolean enabled, String firstFreezeTime, String secondFreezeTime, String updatedBy) {
        ensureDefaults();
        String by = StringUtils.hasText(updatedBy) ? updatedBy : "system-sync";
        String firstTime = parseTime(firstFreezeTime).format(HM);
        String secondTime = StringUtils.hasText(secondFreezeTime) ? parseTime(secondFreezeTime).format(HM) : null;
        int en = enabled ? 1 : 0;
        upsertFreezeJob(JobExecutionRegistry.JOB_RUN_REAPER, en, firstTime, by);
        upsertFreezeJob(JobExecutionRegistry.JOB_DAILY_EXEMPT_RESET, en, firstTime, by);
        upsertFreezeJob(JobExecutionRegistry.JOB_RUN_REAPER_SECOND, (en == 1 && StringUtils.hasText(secondTime)) ? 1 : 0, secondTime == null ? "23:59" : secondTime, by);
    }

    public void tick() {
        ensureDefaults();
        LocalDateTime now = LocalDateTime.now().withSecond(0).withNano(0);
        for (TwinJobScheduleConfig cfg : mapper.selectAll()) {
            if (JobExecutionRegistry.JOB_TELEMETRY_WINCC_UI.equals(cfg.getJobKey())
                    || JobExecutionRegistry.JOB_TELEMETRY_WINCC_LIMITS_UI.equals(cfg.getJobKey())) {
                continue;
            }
            if (cfg.getEnabled() == null || cfg.getEnabled() != 1) {
                continue;
            }
            if (shouldRun(cfg, now)) {
                runWithStatus(cfg.getJobKey(), "system-scheduler");
            }
        }
    }

    public void bootstrapCatchup() {
        ensureDefaults();
        LocalDateTime now = LocalDateTime.now().withSecond(0).withNano(0);
        for (TwinJobScheduleConfig cfg : mapper.selectAll()) {
            if (JobExecutionRegistry.JOB_TELEMETRY_WINCC_UI.equals(cfg.getJobKey())
                    || JobExecutionRegistry.JOB_TELEMETRY_WINCC_LIMITS_UI.equals(cfg.getJobKey())) {
                continue;
            }
            if (cfg.getEnabled() == null || cfg.getEnabled() != 1) {
                continue;
            }
            if (isMissed(cfg, now)) {
                runWithStatus(cfg.getJobKey(), "system-bootstrap");
            }
        }
    }

    private void runWithStatus(String jobKey, String updatedBy) {
        boolean automated = "system-scheduler".equals(updatedBy) || "system-bootstrap".equals(updatedBy);
        if (automated && registry.isRunning(jobKey)) {
            return;
        }
        String triggerType = automated ? "TIMER" : "MANUAL";
        String triggerReason = "system-bootstrap".equals(updatedBy) ? "BOOTSTRAP_CATCHUP" : ("system-scheduler".equals(updatedBy) ? "SCHEDULE_TICK" : "MANUAL_RUN");
        LocalDateTime startedAt = LocalDateTime.now();
        mapper.markRunning(jobKey, startedAt, updatedBy);
        boolean reaperJob = com.example.demo.modules.twin.service.JobExecutionRegistry.JOB_RUN_REAPER.equals(jobKey)
                || com.example.demo.modules.twin.service.JobExecutionRegistry.JOB_RUN_REAPER_SECOND.equals(jobKey);
        if (reaperJob) {
            com.example.demo.modules.twin.support.FreezeReaperAuditContext.begin(triggerType, updatedBy, jobKey);
        }
        automationLogService.write(
                TwinAutomationLogService.TYPE_SCHEDULER,
                jobKey,
                triggerType,
                triggerReason,
                null,
                jobKey,
                true,
                "定时任务已启动，来源=" + updatedBy + "，开始时间=" + startedAt,
                updatedBy
        );
        try {
            registry.execute(jobKey);
            LocalDateTime finishedAt = LocalDateTime.now();
            mapper.markSuccess(jobKey, finishedAt, updatedBy);
            automationLogService.write(
                    TwinAutomationLogService.TYPE_SCHEDULER,
                    jobKey,
                    triggerType,
                    triggerReason,
                    null,
                    jobKey,
                    true,
                    "定时任务执行成功，开始时间=" + startedAt + "，完成时间=" + finishedAt,
                    updatedBy
            );
        } catch (Exception e) {
            mapper.markFailed(jobKey, LocalDateTime.now(), trimError(e.getMessage()), updatedBy);
            automationLogService.write(
                    TwinAutomationLogService.TYPE_SCHEDULER,
                    jobKey,
                    triggerType,
                    triggerReason,
                    null,
                    jobKey,
                    false,
                    "定时任务执行失败：" + trimError(e.getMessage()),
                    updatedBy
            );
            throw e;
        } finally {
            if (reaperJob) {
                com.example.demo.modules.twin.support.FreezeReaperAuditContext.end();
            }
        }
    }

    private void upsertFreezeJob(String jobKey, int enabled, String scheduleTime, String updatedBy) {
        TwinJobScheduleConfig row = mapper.selectByJobKey(jobKey);
        if (row == null) {
            row = new TwinJobScheduleConfig();
            row.setJobKey(jobKey);
        }
        String jobName = registry.jobNameMap().getOrDefault(jobKey, jobKey);
        row.setJobName(jobName);
        row.setEnabled(enabled);
        row.setScheduleType("DAILY");
        row.setScheduleTime(scheduleTime);
        // 冻结任务按固定时点执行，放开全时窗避免配置窗把定时卡死。
        row.setScheduleStartTime("00:00");
        row.setScheduleEndTime("23:59");
        row.setWeekDays("1,2,3,4,5,6,7");
        row.setUpdatedBy(updatedBy);
        mapper.updateSchedule(row);
    }

    private boolean shouldRun(TwinJobScheduleConfig cfg, LocalDateTime now) {
        if (!matchesDay(cfg, now.getDayOfWeek())) {
            return false;
        }
        if (!isSingleTimeJob(cfg.getJobKey()) && !inWindow(cfg, now.toLocalTime())) {
            return false;
        }
        // ARO 穿甲弹：与大华门禁拉取一致，在窗口内由 UnifiedScheduleDispatcher 每分钟 tick 一次，
        // 不再依赖 schedule_time（管理页「平台轮询任务」表格未配置该字段，默认 02:00 会落在窗口外导致永不执行）。
        if (JobExecutionRegistry.JOB_ARO_PENETRATION_POLL.equals(cfg.getJobKey())) {
            LocalDateTime lastRun = cfg.getLastRunAt();
            return lastRun == null || !lastRun.withSecond(0).withNano(0).equals(now);
        }
        LocalTime plan = parseTime(cfg.getScheduleTime());
        if (!plan.equals(now.toLocalTime())) {
            return false;
        }
        LocalDateTime lastRun = cfg.getLastRunAt();
        return lastRun == null || !lastRun.withSecond(0).withNano(0).equals(now);
    }

    private boolean isMissed(TwinJobScheduleConfig cfg, LocalDateTime now) {
        if (JobExecutionRegistry.JOB_ARO_PENETRATION_POLL.equals(cfg.getJobKey())) {
            return false;
        }
        LocalDateTime latestPlan = latestPlannedTime(cfg, now);
        if (latestPlan == null || latestPlan.isAfter(now)) {
            return false;
        }
        // 配置变更保护：若计划点早于本条任务的最近配置更新时间，则视为历史旧计划，不做重启补跑。
        LocalDateTime cfgUpdatedAt = cfg.getUpdateTime();
        if (cfgUpdatedAt != null && latestPlan.isBefore(cfgUpdatedAt)) {
            return false;
        }
        // 冻结类任务防重放：只要该计划点已经“执行过”(lastRunAt 达到计划点)，
        // 即使状态是 FAILED，也不在重启补跑阶段重复执行，避免连续重启导致重复冻结/重复自动离开。
        if (JobExecutionRegistry.JOB_RUN_REAPER.equals(cfg.getJobKey())
                || JobExecutionRegistry.JOB_RUN_REAPER_SECOND.equals(cfg.getJobKey())
                || JobExecutionRegistry.JOB_DAILY_EXEMPT_RESET.equals(cfg.getJobKey())) {
            LocalDateTime lastRun = cfg.getLastRunAt();
            return lastRun == null || lastRun.isBefore(latestPlan);
        }
        LocalDateTime successAt = cfg.getLastSuccessAt();
        return successAt == null || successAt.isBefore(latestPlan);
    }

    private LocalDateTime latestPlannedTime(TwinJobScheduleConfig cfg, LocalDateTime now) {
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

    private boolean matchesDay(TwinJobScheduleConfig cfg, DayOfWeek dayOfWeek) {
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

    private static Set<Integer> parseWeekDays(String weekDays) {
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
            }
        }
        return out;
    }

    private static LocalTime parseTime(String scheduleTime) {
        try {
            return LocalTime.parse(scheduleTime, HM);
        } catch (Exception e) {
            return LocalTime.of(2, 0);
        }
    }

    private boolean inWindow(TwinJobScheduleConfig cfg, LocalTime nowTime) {
        LocalTime start = parseTime(StringUtils.hasText(cfg.getScheduleStartTime()) ? cfg.getScheduleStartTime() : "07:00");
        LocalTime end = parseTime(StringUtils.hasText(cfg.getScheduleEndTime()) ? cfg.getScheduleEndTime() : "22:00");
        if (end.equals(start)) return true;
        if (end.isAfter(start)) {
            return !nowTime.isBefore(start) && !nowTime.isAfter(end);
        }
        return !nowTime.isBefore(start) || !nowTime.isAfter(end);
    }

    private void validate(TwinJobScheduleConfig input) {
        if (!StringUtils.hasText(input.getJobKey())) {
            throw new IllegalArgumentException("jobKey不能为空");
        }
        parseTime(input.getScheduleTime());
        parseTime(input.getScheduleStartTime());
        parseTime(input.getScheduleEndTime());
        String type = input.getScheduleType() == null ? "DAILY" : input.getScheduleType().toUpperCase(Locale.ROOT);
        if (!"DAILY".equals(type) && !"WEEKLY".equals(type)) {
            throw new IllegalArgumentException("scheduleType 仅支持 DAILY/WEEKLY");
        }
    }

    private void ensureDefaults() {
        ensureTable();
        Map<String, String> jobs = registry.jobNameMap();
        for (Map.Entry<String, String> e : jobs.entrySet()) {
            TwinJobScheduleConfig row = new TwinJobScheduleConfig();
            row.setJobKey(e.getKey());
            row.setJobName(e.getValue());
            row.setEnabled(0);
            row.setScheduleType("DAILY");
            row.setScheduleTime("02:00");
            if (isSingleTimeJob(e.getKey())) {
                row.setScheduleStartTime("00:00");
                row.setScheduleEndTime("23:59");
            } else {
                row.setScheduleStartTime("07:00");
                row.setScheduleEndTime("22:00");
            }
            row.setWeekDays("1,2,3,4,5,6,7");
            row.setPollIntervalSeconds(60);
            row.setUpdatedBy("system-init");
            mapper.upsertBase(row);
        }
    }

    private boolean isSingleTimeJob(String jobKey) {
        if (!StringUtils.hasText(jobKey)) {
            return false;
        }
        return JobExecutionRegistry.JOB_RPG_RECALC.equals(jobKey)
                || JobExecutionRegistry.JOB_PERSONNEL_SYNC.equals(jobKey)
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
                || JobExecutionRegistry.JOB_DAILY_EXEMPT_RESET.equals(jobKey);
    }

    private void ensureTable() {
        if (tableReady) {
            return;
        }
        synchronized (this) {
            if (tableReady) {
                return;
            }
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS twin_job_schedule_config (
                        job_key VARCHAR(64) PRIMARY KEY COMMENT '任务唯一键',
                        job_name VARCHAR(128) NOT NULL COMMENT '任务名称',
                        enabled TINYINT NOT NULL DEFAULT 0 COMMENT '是否启用',
                        schedule_type VARCHAR(16) NOT NULL DEFAULT 'DAILY' COMMENT 'DAILY/WEEKLY',
                        schedule_time VARCHAR(8) NOT NULL DEFAULT '02:00' COMMENT 'HH:mm',
                        schedule_start_time VARCHAR(8) NOT NULL DEFAULT '07:00' COMMENT '执行窗口开始 HH:mm',
                        schedule_end_time VARCHAR(8) NOT NULL DEFAULT '22:00' COMMENT '执行窗口结束 HH:mm',
                        week_days VARCHAR(32) NULL COMMENT '周计划:1,2,3..7',
                        last_run_at DATETIME NULL COMMENT '最近执行时间',
                        last_success_at DATETIME NULL COMMENT '最近成功时间',
                        last_status VARCHAR(16) NULL COMMENT 'SUCCESS/FAILED/RUNNING',
                        last_error VARCHAR(500) NULL COMMENT '最近错误摘要',
                        updated_by VARCHAR(64) NULL COMMENT '更新人',
                        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='统一定时任务配置与最近执行状态'
                    """);
            ensureColumnExists("twin_job_schedule_config", "schedule_start_time",
                    "ALTER TABLE twin_job_schedule_config ADD COLUMN schedule_start_time VARCHAR(8) NOT NULL DEFAULT '07:00'");
            ensureColumnExists("twin_job_schedule_config", "schedule_end_time",
                    "ALTER TABLE twin_job_schedule_config ADD COLUMN schedule_end_time VARCHAR(8) NOT NULL DEFAULT '22:00'");
            ensureColumnExists("twin_job_schedule_config", "poll_interval_seconds",
                    "ALTER TABLE twin_job_schedule_config ADD COLUMN poll_interval_seconds INT NOT NULL DEFAULT 60 COMMENT '程序坞轮询秒(TELEMETRY_WINCC_UI)'");
            tableReady = true;
        }
    }

    private void ensureColumnExists(String tableName, String columnName, String alterSql) {
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
                    Integer.class,
                    tableName,
                    columnName
            );
            if (count != null && count > 0) return;
            jdbcTemplate.execute(alterSql);
        } catch (Exception ignored) {
        }
    }

    private static String trimError(String error) {
        if (error == null) {
            return "unknown";
        }
        String s = error.trim();
        return s.length() > 480 ? s.substring(0, 480) : s;
    }

}
