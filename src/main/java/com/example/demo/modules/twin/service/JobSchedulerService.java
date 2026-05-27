package com.example.demo.modules.twin.service;

import com.example.demo.modules.telemetry.dto.TelemetryWinccDockPollConfigDto;
import com.example.demo.modules.twin.dto.JobRunOutcome;
import com.example.demo.modules.twin.entity.TwinJobScheduleConfig;
import com.example.demo.modules.twin.mapper.TwinJobScheduleConfigMapper;
import com.example.demo.modules.twin.support.TwinTimingDiagnostics;
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
        return mapper.selectAll().stream()
                .filter(cfg -> !JobExecutionRegistry.isDeprecatedJob(cfg.getJobKey()))
                .toList();
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
        if (existing == null) {
            throw new IllegalArgumentException("未知任务: " + input.getJobKey());
        }
        if (!StringUtils.hasText(input.getJobName())) {
            input.setJobName(existing.getJobName() != null ? existing.getJobName() : input.getJobKey());
        }
        if (input.getPollIntervalSeconds() == null) {
            if (existing != null && existing.getPollIntervalSeconds() != null) {
                input.setPollIntervalSeconds(existing.getPollIntervalSeconds());
            } else {
                input.setPollIntervalSeconds(60);
            }
        }
        input.setPollIntervalSeconds(JobSchedulePolicy.clampPollInterval(input.getJobKey(), input.getPollIntervalSeconds()));
        if (input.getRevokeAutoSignoutEnabled() == null) {
            input.setRevokeAutoSignoutEnabled(
                    existing.getRevokeAutoSignoutEnabled() != null ? existing.getRevokeAutoSignoutEnabled() : 0);
        }

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
        int affected = mapper.updateSchedule(input);
        if (affected <= 0) {
            throw new IllegalStateException("配置未写入数据库，任务不存在: " + input.getJobKey());
        }
        return mapper.selectByJobKey(input.getJobKey());
    }

    /**
     * 管理员手动触发。若任务已在执行则抛错（避免前端误报「已触发」）。
     *
     * @return true 表示已启动执行
     */
    public JobRunOutcome runManual(String jobKey, String updatedBy) {
        ensureDefaults();
        return runWithStatus(jobKey, updatedBy, false);
    }

    /**
     * 「每日豁免权回收」任务专用：回收后对今日曾豁免且流水仍在馆者自动签离（与冻结总开关无关）。
     */
    public boolean isDailyExemptRevokeAutoSignoutEnabled() {
        ensureDefaults();
        TwinJobScheduleConfig cfg = mapper.selectByJobKey(JobExecutionRegistry.JOB_DAILY_EXEMPT_RESET);
        return cfg != null
                && cfg.getRevokeAutoSignoutEnabled() != null
                && cfg.getRevokeAutoSignoutEnabled() == 1;
    }

    /**
     * 冻结联动任务对齐（仅跑批冻结，不含每日豁免回收）：
     * - RUN_REAPER：第一次冻结，时刻=freezeTime
     * - RUN_REAPER_SECOND：第二次冻结，时刻=secondFreezeTime
     * <p>{@link JobExecutionRegistry#JOB_DAILY_EXEMPT_RESET} 由「定时管理」页独立配置，禁止在此覆盖。</p>
     */
    public void syncFreezeJobs(boolean enabled, String firstFreezeTime, String secondFreezeTime, String updatedBy) {
        ensureDefaults();
        String by = StringUtils.hasText(updatedBy) ? updatedBy : "system-sync";
        String firstTime = parseTime(firstFreezeTime).format(HM);
        String secondTime = StringUtils.hasText(secondFreezeTime) ? parseTime(secondFreezeTime).format(HM) : null;
        int en = enabled ? 1 : 0;
        upsertFreezeJob(JobExecutionRegistry.JOB_RUN_REAPER, en, firstTime, by);
        upsertFreezeJob(JobExecutionRegistry.JOB_RUN_REAPER_SECOND, (en == 1 && StringUtils.hasText(secondTime)) ? 1 : 0, secondTime == null ? "23:59" : secondTime, by);
    }

    public void tick() {
        ensureDefaults();
        LocalDateTime now = LocalDateTime.now().withSecond(0).withNano(0);
        for (TwinJobScheduleConfig cfg : mapper.selectAll()) {
            if (skipSchedulerTick(cfg)) {
                continue;
            }
            if (cfg.getEnabled() == null || cfg.getEnabled() != 1) {
                continue;
            }
            if (shouldRun(cfg, now)) {
                runWithStatus(cfg.getJobKey(), "system-scheduler", true);
            }
        }
    }

    public void bootstrapCatchup() {
        ensureDefaults();
        LocalDateTime now = LocalDateTime.now().withSecond(0).withNano(0);
        for (TwinJobScheduleConfig cfg : mapper.selectAll()) {
            if (skipSchedulerTick(cfg)) {
                continue;
            }
            if (cfg.getEnabled() == null || cfg.getEnabled() != 1) {
                continue;
            }
            if (isMissed(cfg, now)) {
                runWithStatus(cfg.getJobKey(), "system-bootstrap", true);
            }
        }
    }

    private static boolean skipSchedulerTick(TwinJobScheduleConfig cfg) {
        if (cfg == null || !StringUtils.hasText(cfg.getJobKey())) {
            return true;
        }
        if (JobExecutionRegistry.isDeprecatedJob(cfg.getJobKey())) {
            return true;
        }
        return JobExecutionRegistry.JOB_TELEMETRY_WINCC_UI.equals(cfg.getJobKey())
                || JobExecutionRegistry.JOB_TELEMETRY_WINCC_LIMITS_UI.equals(cfg.getJobKey());
    }

    /**
     * @param skipIfRunning true=调度器/补跑：任务已在跑则跳过；false=手动：已在跑则抛错
     */
    private JobRunOutcome runWithStatus(String jobKey, String updatedBy, boolean skipIfRunning) {
        if (registry.isRunning(jobKey)) {
            if (skipIfRunning) {
                return JobRunOutcome.noop(jobKey, "任务正在执行中，本次跳过", Map.of("skipped", true));
            }
            throw new IllegalStateException("任务正在执行中，请稍后再试: " + registry.jobNameMap().getOrDefault(jobKey, jobKey));
        }
        boolean automated = "system-scheduler".equals(updatedBy) || "system-bootstrap".equals(updatedBy);
        String triggerType = automated ? "TIMER" : "MANUAL";
        String triggerReason = "system-bootstrap".equals(updatedBy) ? "BOOTSTRAP_CATCHUP" : ("system-scheduler".equals(updatedBy) ? "SCHEDULE_TICK" : "MANUAL_RUN");
        LocalDateTime startedAt = LocalDateTime.now();
        mapper.markRunning(jobKey, startedAt, updatedBy);
        boolean reaperJob = JobExecutionRegistry.JOB_RUN_REAPER.equals(jobKey)
                || JobExecutionRegistry.JOB_RUN_REAPER_SECOND.equals(jobKey);
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
        long jobStartMs = System.currentTimeMillis();
        try {
            JobRunOutcome outcome = registry.execute(jobKey, !automated);
            LocalDateTime finishedAt = LocalDateTime.now();
            mapper.markSuccess(jobKey, finishedAt, updatedBy);
            TwinTimingDiagnostics.logJob(jobKey, triggerType, System.currentTimeMillis() - jobStartMs, true,
                    outcome != null ? outcome.getSummary() : "ok");
            automationLogService.write(
                    TwinAutomationLogService.TYPE_SCHEDULER,
                    jobKey,
                    triggerType,
                    triggerReason,
                    null,
                    jobKey,
                    true,
                    "定时任务执行成功：" + outcome.getSummary() + "，完成时间=" + finishedAt,
                    updatedBy
            );
            return outcome;
        } catch (Exception e) {
            TwinTimingDiagnostics.logJob(jobKey, triggerType, System.currentTimeMillis() - jobStartMs, false,
                    trimError(e.getMessage()));
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

    private boolean shouldRunByPollInterval(TwinJobScheduleConfig cfg, LocalDateTime now) {
        LocalDateTime lastRun = cfg.getLastRunAt();
        if (lastRun == null) {
            return true;
        }
        int pollSec = JobSchedulePolicy.clampPollInterval(cfg.getJobKey(), cfg.getPollIntervalSeconds());
        return !lastRun.plusSeconds(pollSec).isAfter(now);
    }

    private boolean isMissed(TwinJobScheduleConfig cfg, LocalDateTime now) {
        if (JobSchedulePolicy.isPollInWindow(cfg.getJobKey())) {
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
            row.setPollIntervalSeconds(JobSchedulePolicy.defaultPollIntervalSeconds(e.getKey()));
            row.setRevokeAutoSignoutEnabled(0);
            row.setUpdatedBy("system-init");
            mapper.upsertBase(row);
        }
        disableDeprecatedScheduleJobs();
        migrateLegacyStatsPullScheduleJob();
        initTelemetryArchivePurgeSchedule();
    }

    /** 新装默认开启 WinCC 归档清理（03:40），可在定时任务管理改时刻 */
    private void initTelemetryArchivePurgeSchedule() {
        try {
            TwinJobScheduleConfig cfg =
                    mapper.selectByJobKey(JobExecutionRegistry.JOB_TELEMETRY_ARCHIVE_PURGE);
            if (cfg == null) {
                return;
            }
            if (cfg.getLastRunAt() != null) {
                return;
            }
            if (cfg.getEnabled() != null && cfg.getEnabled() == 1) {
                return;
            }
            cfg.setEnabled(1);
            cfg.setScheduleTime("03:40");
            cfg.setScheduleType("DAILY");
            cfg.setWeekDays("1,2,3,4,5,6,7");
            cfg.setUpdatedBy("system-init-archive-purge");
            mapper.updateSchedule(cfg);
        } catch (Exception ignored) {
        }
    }

    /** 将已废弃的合并 Job 配置迁移到「昨日日批」独立 Job */
    private void migrateLegacyStatsPullScheduleJob() {
        try {
            TwinJobScheduleConfig legacy =
                    mapper.selectByJobKey(JobExecutionRegistry.JOB_DAHUA_SWING_STATS_PULL);
            TwinJobScheduleConfig day =
                    mapper.selectByJobKey(JobExecutionRegistry.JOB_DAHUA_SWING_STATS_PULL_PREVIOUS_DAY);
            if (legacy == null || day == null) {
                return;
            }
            boolean legacyOn = legacy.getEnabled() != null && legacy.getEnabled() == 1;
            boolean dayOn = day.getEnabled() != null && day.getEnabled() == 1;
            if (legacyOn && !dayOn) {
                day.setEnabled(1);
                if (StringUtils.hasText(legacy.getScheduleTime())) {
                    day.setScheduleTime(legacy.getScheduleTime());
                }
                if (StringUtils.hasText(legacy.getScheduleType())) {
                    day.setScheduleType(legacy.getScheduleType());
                }
                if (StringUtils.hasText(legacy.getWeekDays())) {
                    day.setWeekDays(legacy.getWeekDays());
                }
                day.setUpdatedBy("migrate-from-DAHUA_SWING_STATS_PULL");
                mapper.updateSchedule(day);
            }
        } catch (Exception ignored) {
            // 迁移失败不阻断启动
        }
    }

    private void disableDeprecatedScheduleJobs() {
        for (String key : JobExecutionRegistry.deprecatedJobKeys()) {
            try {
                jdbcTemplate.update(
                        "UPDATE twin_job_schedule_config SET enabled = 0, updated_by = 'system-deprecate' WHERE job_key = ?",
                        key);
            } catch (Exception ignored) {
            }
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
                || JobExecutionRegistry.JOB_DAILY_EXEMPT_RESET.equals(jobKey)
                || JobExecutionRegistry.JOB_ACCESS_CLEAN_PACKAGE_DAILY.equals(jobKey)
                || JobExecutionRegistry.JOB_DAHUA_SWING_STATS_PULL_PREVIOUS_DAY.equals(jobKey)
                || JobExecutionRegistry.JOB_DAHUA_SWING_STATS_PULL_PREVIOUS_WEEK.equals(jobKey)
                || JobExecutionRegistry.JOB_DAHUA_SWING_STATS_PULL_SINCE_LAST.equals(jobKey)
                || JobExecutionRegistry.JOB_TELEMETRY_ARCHIVE_PURGE.equals(jobKey);
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
            ensureColumnExists("twin_job_schedule_config", "revoke_auto_signout_enabled",
                    "ALTER TABLE twin_job_schedule_config ADD COLUMN revoke_auto_signout_enabled TINYINT NOT NULL DEFAULT 0 COMMENT 'DAILY_EXEMPT_RESET: 今日曾豁免且仍在馆时自动签离'");
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
