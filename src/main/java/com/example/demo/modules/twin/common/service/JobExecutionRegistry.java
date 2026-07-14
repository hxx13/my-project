package com.example.demo.modules.twin.common.service;

import com.example.demo.modules.dahua.service.DahuaDepartmentCacheService;
import com.example.demo.modules.dahua.service.DahuaDeviceChannelCacheService;
import com.example.demo.modules.dahua.service.DahuaDoorGroupCacheService;
import com.example.demo.modules.roommapping.service.RoomMappingService;
import com.example.demo.modules.aro.dto.AroIncrementalSyncResult;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.analytics.service.AnalyticsPipelineHook;
import com.example.demo.modules.aro.task.AroSyncTask;
import com.example.demo.modules.cageshelf.service.CageSpecialStatusScanService;
import com.example.demo.modules.twin.common.dto.JobRunOutcome;
import com.example.demo.modules.twin.card.service.TwinCardMappingService;
import com.example.demo.modules.twin.dahua.service.DahuaSwingStatsPullService;
import com.example.demo.modules.twin.dashboard.service.TwinPredictionEngineService;
import com.example.demo.modules.twin.rpg.service.RpgEngineService;
import com.example.demo.common.component.SocketRoomAssigner;
import com.example.demo.modules.telemetry.service.TelemetryArchiveService;
import com.example.demo.modules.telemetry.service.TelemetrySnapshotService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class JobExecutionRegistry {
    public static final String JOB_RPG_RECALC = "RPG_RECALC_ALL";
    public static final String JOB_PERSONNEL_SYNC = "PERSONNEL_SYNC_ALL";
    public static final String JOB_MODEL_RECALC = "MODEL_RECALC";
    public static final String JOB_GROUP_RECALC = "GROUP_RECALC";
    public static final String JOB_ORDER_SYNC = "ORDER_SYNC";
    public static final String JOB_ORDER_SYNC_FULL = "ORDER_SYNC_FULL";
    public static final String JOB_RUN_REAPER = "RUN_REAPER";
    public static final String JOB_RUN_REAPER_SECOND = "RUN_REAPER_SECOND";
    public static final String JOB_DH_DEPT_REFRESH = "DAHUA_DEPT_REFRESH";
    public static final String JOB_DH_GROUP_REFRESH = "DAHUA_GROUP_REFRESH";
    public static final String JOB_DH_CHANNEL_REFRESH = "DAHUA_CHANNEL_REFRESH";
    public static final String JOB_ROOM_MAPPING_REFRESH = "ROOM_MAPPING_REFRESH";
    public static final String JOB_ARO_PENETRATION_POLL = "ARO_PENETRATION_POLL";
    public static final String JOB_DAILY_EXEMPT_RESET = "DAILY_EXEMPT_RESET";
    /** 动物房程序坞轮询配置载体；不参与 tick，「立即执行」时刷新 WinCC 内存快照（测量值高频） */
    public static final String JOB_TELEMETRY_WINCC_UI = "TELEMETRY_WINCC_UI";
    /** WinCC 限值低频拉取入库；不参与统一 tick，规则与 TELEMETRY_WINCC_UI 相同（窗口+周计划+轮询秒） */
    public static final String JOB_TELEMETRY_WINCC_LIMITS_UI = "TELEMETRY_WINCC_LIMITS_UI";
    /** @deprecated 旧 access_raw_event 管线，已从定时管理移除 */
    @Deprecated
    public static final String JOB_ACCESS_RAW_BACKFILL = "ACCESS_RAW_BACKFILL";
    /** @deprecated 旧 access_cleaned_event 日批，已从定时管理移除 */
    @Deprecated
    public static final String JOB_ACCESS_EVENT_CLEAN_DAILY = "ACCESS_EVENT_CLEAN_DAILY";
    /** @deprecated 旧 access_cleaned_event 增量，已从定时管理移除 */
    @Deprecated
    public static final String JOB_ACCESS_EVENT_CLEAN_INCREMENTAL = "ACCESS_EVENT_CLEAN_INCREMENTAL";
    /** @deprecated 已拆分为按 periodMode 的独立 Job，见 {@link #JOB_DAHUA_SWING_STATS_PULL_PREVIOUS_DAY} 等 */
    @Deprecated
    public static final String JOB_DAHUA_SWING_STATS_PULL = "DAHUA_SWING_STATS_PULL";
    /** 审计门禁·昨日自然日批（仅 PREVIOUS_DAY 任务） */
    public static final String JOB_DAHUA_SWING_STATS_PULL_PREVIOUS_DAY = "DAHUA_SWING_STATS_PULL_PREVIOUS_DAY";
    /** 审计门禁·上周自然周批（仅 PREVIOUS_WEEK 任务） */
    public static final String JOB_DAHUA_SWING_STATS_PULL_PREVIOUS_WEEK = "DAHUA_SWING_STATS_PULL_PREVIOUS_WEEK";
    /** 审计门禁·水位增量（仅 SINCE_LAST 任务） */
    public static final String JOB_DAHUA_SWING_STATS_PULL_SINCE_LAST = "DAHUA_SWING_STATS_PULL_SINCE_LAST";
    /** 门禁统计清洗总库：各通道自动增量入库（见任务「清洗设置」是否开启） */
    public static final String JOB_ACCESS_CLEAN_PACKAGE_DAILY = "ACCESS_CLEAN_PACKAGE_DAILY";
    /** WinCC 温湿度归档表 telemetry_value_archive 按保留天数分批清理 */
    public static final String JOB_TELEMETRY_ARCHIVE_PURGE = "TELEMETRY_ARCHIVE_PURGE";
    /** Raw → L1 rollup（5min/1h bucket） */
    public static final String JOB_TELEMETRY_ARCHIVE_ROLLUP = "TELEMETRY_ARCHIVE_ROLLUP";
    /** 遥测视图快照（PRESENTATION profile 矩阵/对比组 JSON） */
    public static final String JOB_TELEMETRY_VIEW_SNAPSHOT = "TELEMETRY_VIEW_SNAPSHOT";
    /** 笼架·全量笼位数据同步（每周，逐架拉取 ARO 最新笼盒详情 + 特殊标记，diff 生成事件日志） */
    public static final String JOB_CAGE_SPECIAL_STATUS_SCAN = "CAGE_SPECIAL_STATUS_SCAN";
    public static final String JOB_STRANDED_VIOLATION_CHECK = "STRANDED_VIOLATION_CHECK";
    /** 第二道滞留检测：口径与 {@link #JOB_STRANDED_VIOLATION_CHECK} 相同，仅签退、不创建违规 */
    public static final String JOB_STRANDED_SIGNOUT_CHECK = "STRANDED_SIGNOUT_CHECK";
    /** 大屏排行榜·进出活跃度刷新（根据 pollIntervalSeconds 向大屏 WebSocket 推送刷新信号） */
    public static final String JOB_DASHBOARD_RANKING_ACTIVITY = "DASHBOARD_RANKING_ACTIVITY";
    /** 大屏排行榜·动物消耗刷新（同上） */
    public static final String JOB_DASHBOARD_RANKING_ANIMAL = "DASHBOARD_RANKING_ANIMAL";
    /** 延迟免冻结·自动审批（信任名单 + 批量规则） */
    public static final String JOB_SCAN_DELAY_AUTO_APPROVE = "SCAN_DELAY_AUTO_APPROVE";
    /** 物资申领·自动审批（信任名单 + 批量规则） */
    public static final String JOB_MATERIAL_AUTO_APPROVE = "MATERIAL_AUTO_APPROVE";
    /** 经验值·每日流水对账（扫描昨日 aro_access_log 配对进出记录并写入 twin_exp_record） */
    public static final String JOB_EXP_RECONCILE = "EXP_RECONCILE";
    /** 笼架特殊状态违规检测（纯天数模式定时判定） */
    public static final String JOB_CAGE_STATUS_VIOLATION_CHECK = "CAGE_STATUS_VIOLATION_CHECK";

    private static final Set<String> DEPRECATED_JOB_KEYS =
            Set.of(
                    JOB_ACCESS_RAW_BACKFILL,
                    JOB_ACCESS_EVENT_CLEAN_DAILY,
                    JOB_ACCESS_EVENT_CLEAN_INCREMENTAL,
                    JOB_DAHUA_SWING_STATS_PULL,
                    JOB_RPG_RECALC);

    public static boolean isDeprecatedJob(String jobKey) {
        return jobKey != null && DEPRECATED_JOB_KEYS.contains(jobKey);
    }

    public static Set<String> deprecatedJobKeys() {
        return DEPRECATED_JOB_KEYS;
    }

    private final RpgEngineService rpgEngineService;
    private final com.example.demo.modules.aro.service.AroService aroService;
    private final com.example.demo.modules.aro.service.AroPersonnelDatabaseService personnelDbService;
    private final TwinPredictionEngineService predictionEngineService;
    private final AnimalOrderSyncService orderSyncService;
    private final TwinCardMappingService mappingService;
    private final DahuaDepartmentCacheService departmentCacheService;
    private final DahuaDoorGroupCacheService doorGroupCacheService;
    private final DahuaDeviceChannelCacheService deviceChannelCacheService;
    private final RoomMappingService roomMappingService;
    private final AroSyncTask aroSyncTask;
    private final ExamRoomPermissionSyncService examRoomPermissionSyncService;
    private final TelemetrySnapshotService telemetrySnapshotService;
    private final TelemetryArchiveService telemetryArchiveService;
    private final com.example.demo.modules.telemetry.service.TelemetryArchiveRollupService telemetryArchiveRollupService;
    private final com.example.demo.modules.telemetry.service.TelemetryViewSnapshotService telemetryViewSnapshotService;
    private final DahuaSwingStatsPullService dahuaSwingStatsPullService;
    private final com.example.demo.modules.accessfusion.service.AccessSwingCleanWorkspaceService accessSwingCleanWorkspaceService;
    private final AnalyticsPipelineHook analyticsPipelineHook;
    private final CageSpecialStatusScanService cageSpecialStatusScanService;
    private final com.example.demo.modules.twin.dashboard.service.StrandedViolationService strandedViolationService;
    private final com.example.demo.modules.twin.dashboard.service.RankingSnapshotService rankingSnapshotService;
    @Autowired(required = false)
    private com.corundumstudio.socketio.SocketIOServer socketServer;
    @Autowired(required = false)
    private com.example.demo.modules.twin.scan.delay.service.ScanDelayAutoApproveService scanDelayAutoApproveService;
    @Autowired(required = false)
    private com.example.demo.modules.material.service.MaterialAutoApproveService materialAutoApproveService;
    @Autowired(required = false)
    private com.example.demo.modules.twin.rpg.service.TwinExpReconcileService twinExpReconcileService;
    @Autowired(required = false)
    private com.example.demo.modules.twin.dashboard.service.CageStatusViolationCheckService cageStatusViolationCheckService;
    private final Set<String> running = ConcurrentHashMap.newKeySet();

    public JobExecutionRegistry(
            RpgEngineService rpgEngineService,
            com.example.demo.modules.aro.service.AroService aroService,
            com.example.demo.modules.aro.service.AroPersonnelDatabaseService personnelDbService,
            TwinPredictionEngineService predictionEngineService,
            AnimalOrderSyncService orderSyncService,
            TwinCardMappingService mappingService,
            DahuaDepartmentCacheService departmentCacheService,
            DahuaDoorGroupCacheService doorGroupCacheService,
            DahuaDeviceChannelCacheService deviceChannelCacheService,
            RoomMappingService roomMappingService,
            AroSyncTask aroSyncTask,
            ExamRoomPermissionSyncService examRoomPermissionSyncService,
            TelemetrySnapshotService telemetrySnapshotService,
            TelemetryArchiveService telemetryArchiveService,
            com.example.demo.modules.telemetry.service.TelemetryArchiveRollupService telemetryArchiveRollupService,
            com.example.demo.modules.telemetry.service.TelemetryViewSnapshotService telemetryViewSnapshotService,
            DahuaSwingStatsPullService dahuaSwingStatsPullService,
            com.example.demo.modules.accessfusion.service.AccessSwingCleanWorkspaceService accessSwingCleanWorkspaceService,
            AnalyticsPipelineHook analyticsPipelineHook,
            CageSpecialStatusScanService cageSpecialStatusScanService,
            com.example.demo.modules.twin.dashboard.service.StrandedViolationService strandedViolationService,
            com.example.demo.modules.twin.dashboard.service.RankingSnapshotService rankingSnapshotService) {
        this.rpgEngineService = rpgEngineService;
        this.aroService = aroService;
        this.personnelDbService = personnelDbService;
        this.predictionEngineService = predictionEngineService;
        this.orderSyncService = orderSyncService;
        this.mappingService = mappingService;
        this.departmentCacheService = departmentCacheService;
        this.doorGroupCacheService = doorGroupCacheService;
        this.deviceChannelCacheService = deviceChannelCacheService;
        this.roomMappingService = roomMappingService;
        this.aroSyncTask = aroSyncTask;
        this.examRoomPermissionSyncService = examRoomPermissionSyncService;
        this.telemetrySnapshotService = telemetrySnapshotService;
        this.telemetryArchiveService = telemetryArchiveService;
        this.telemetryArchiveRollupService = telemetryArchiveRollupService;
        this.telemetryViewSnapshotService = telemetryViewSnapshotService;
        this.dahuaSwingStatsPullService = dahuaSwingStatsPullService;
        this.accessSwingCleanWorkspaceService = accessSwingCleanWorkspaceService;
        this.analyticsPipelineHook = analyticsPipelineHook;
        this.cageSpecialStatusScanService = cageSpecialStatusScanService;
        this.strandedViolationService = strandedViolationService;
        this.rankingSnapshotService = rankingSnapshotService;
    }

    public Map<String, String> jobNameMap() {
        Map<String, String> jobs = new LinkedHashMap<>();
        jobs.put(JOB_RPG_RECALC, "孪生·重算全员经验");
        jobs.put(JOB_PERSONNEL_SYNC, "孪生·全量同步人员档案");
        jobs.put(JOB_MODEL_RECALC, "孪生·行为预测模型重算");
        jobs.put(JOB_GROUP_RECALC, "孪生·全局空间画像重算");
        jobs.put(JOB_ORDER_SYNC, "订单·青春版追溯同步");
        jobs.put(JOB_ORDER_SYNC_FULL, "订单·全量追溯同步");
        jobs.put(JOB_RUN_REAPER, "冻结·第一次自动跑批");
        jobs.put(JOB_RUN_REAPER_SECOND, "冻结·第二次自动跑批");
        jobs.put(JOB_DH_DEPT_REFRESH, "大华·部门缓存刷新");
        jobs.put(JOB_DH_GROUP_REFRESH, "大华·门组缓存刷新");
        jobs.put(JOB_DH_CHANNEL_REFRESH, "大华·通道缓存刷新");
        jobs.put(JOB_ROOM_MAPPING_REFRESH, "房间映射·ARO落库刷新");
        jobs.put(JOB_ARO_PENETRATION_POLL, "ARO·在馆流水增量同步");
        jobs.put(JOB_DAILY_EXEMPT_RESET, "冻结·每日豁免权回收");
        jobs.put(JOB_STRANDED_VIOLATION_CHECK, "滞留·未豁免人员自动违规（一道）");
        jobs.put(JOB_STRANDED_SIGNOUT_CHECK, "滞留·未豁免人员自动签退（二道）");
        jobs.put(JOB_SCAN_DELAY_AUTO_APPROVE, "延迟免冻结·自动审批");
        jobs.put(JOB_MATERIAL_AUTO_APPROVE, "物资申领·自动审批");
        jobs.put(JOB_TELEMETRY_WINCC_UI, "动物房·WinCC温湿度测量值（窗口内轮询）");
        jobs.put(JOB_TELEMETRY_WINCC_LIMITS_UI, "动物房·WinCC限值同步（窗口内轮询）");
        jobs.put(
                JOB_DAHUA_SWING_STATS_PULL_PREVIOUS_DAY,
                "审计门禁·昨日日批（仅 PREVIOUS_DAY 任务，回溯不参与）");
        jobs.put(
                JOB_DAHUA_SWING_STATS_PULL_PREVIOUS_WEEK,
                "审计门禁·上周周批（仅 PREVIOUS_WEEK 任务）");
        jobs.put(
                JOB_DAHUA_SWING_STATS_PULL_SINCE_LAST,
                "审计门禁·水位增量（仅 SINCE_LAST 任务）");
        jobs.put(JOB_ACCESS_CLEAN_PACKAGE_DAILY, "门禁统计·自动入库总库（每日到点，仅增量）");
        jobs.put(JOB_TELEMETRY_ARCHIVE_PURGE, "温湿度·WinCC归档自动清理");
        jobs.put(JOB_TELEMETRY_ARCHIVE_ROLLUP, "温湿度·归档 L1 预聚合");
        jobs.put(JOB_TELEMETRY_VIEW_SNAPSHOT, "遥测·视图快照捕获");
        jobs.put(JOB_CAGE_SPECIAL_STATUS_SCAN, "笼架·全量笼位数据同步（每周）");
        jobs.put(JOB_DASHBOARD_RANKING_ACTIVITY, "大屏·进出活跃排行榜刷新");
        jobs.put(JOB_DASHBOARD_RANKING_ANIMAL, "大屏·动物消耗排行榜刷新");
        jobs.put(JOB_EXP_RECONCILE, "经验值·每日流水对账重算");
        jobs.put(JOB_CAGE_STATUS_VIOLATION_CHECK, "笼架特殊状态违规检测");
        return jobs;
    }

    public boolean isRunning(String jobKey) {
        return running.contains(jobKey);
    }

    /** 返回当前所有正在运行的任务 key 集合（不可变快照），供监控端点使用。 */
    public Set<String> getRunningJobKeys() {
        return Set.copyOf(running);
    }

    public JobRunOutcome execute(String jobKey) {
        return execute(jobKey, false);
    }

    /**
     * @param preferSync true=管理端手动执行：预测类/穿甲弹同步跑完再返回；false=定时调度可走异步
     */
    public JobRunOutcome execute(String jobKey, boolean preferSync) {
        if (!running.add(jobKey)) {
            throw new IllegalStateException("任务正在执行中: " + jobKey);
        }
        try {
            return switch (jobKey) {
                case JOB_RPG_RECALC -> {
                    rpgEngineService.recalculateAllHistoricalExp();
                    yield JobRunOutcome.ok(jobKey, "全员经验重算已完成");
                }
                case JOB_PERSONNEL_SYNC -> {
                    List<AroPersonnel> personnel = aroService.fetchAllPersonnel();
                    personnelDbService.upsertPersonnel(personnel);
                    examRoomPermissionSyncService.refreshAllowedRoomsDisplayForPersonnelList(personnel);
                    yield JobRunOutcome.ok(jobKey, "档案同步完成，共 " + personnel.size() + " 人");
                }
                case JOB_MODEL_RECALC -> {
                    if (preferSync) {
                        predictionEngineService.runPredictionModelManual("ALL");
                    } else {
                        predictionEngineService.runPredictionModelManualAsync("ALL");
                    }
                    yield JobRunOutcome.ok(jobKey, preferSync ? "模型重算已完成" : "模型重算已提交后台");
                }
                case JOB_GROUP_RECALC -> {
                    if (preferSync) {
                        predictionEngineService.executeGroupPipeline("ALL");
                    } else {
                        predictionEngineService.executeGroupPipelineAsync("ALL");
                    }
                    yield JobRunOutcome.ok(jobKey, preferSync ? "全局空间测算已完成" : "全局空间测算已提交后台");
                }
                case JOB_ORDER_SYNC -> {
                    orderSyncService.syncOfficialAnimalOrders();
                    yield JobRunOutcome.ok(jobKey, "青春版订单追溯已完成");
                }
                case JOB_ORDER_SYNC_FULL -> {
                    orderSyncService.syncOfficialAnimalOrdersFull();
                    yield JobRunOutcome.ok(jobKey, "全量订单追溯已完成");
                }
                case JOB_RUN_REAPER -> {
                    aroSyncTask.midnightReaperTask();
                    yield JobRunOutcome.ok(jobKey, "冻结跑批已完成");
                }
                case JOB_RUN_REAPER_SECOND -> {
                    aroSyncTask.secondFreezeReaperTask();
                    yield JobRunOutcome.ok(jobKey, "第二次冻结跑批已完成");
                }
                case JOB_DH_DEPT_REFRESH -> {
                    departmentCacheService.refreshFromUpstream();
                    yield JobRunOutcome.ok(jobKey, "部门缓存已刷新");
                }
                case JOB_DH_GROUP_REFRESH -> {
                    doorGroupCacheService.refreshFromUpstream();
                    yield JobRunOutcome.ok(jobKey, "门组缓存已刷新");
                }
                case JOB_DH_CHANNEL_REFRESH -> {
                    deviceChannelCacheService.refreshFromUpstream();
                    yield JobRunOutcome.ok(jobKey, "通道缓存已刷新");
                }
                case JOB_ROOM_MAPPING_REFRESH -> {
                    try {
                        roomMappingService.refreshFromClasspath();
                    } catch (Exception e) {
                        throw new RuntimeException(e);
                    }
                    yield JobRunOutcome.ok(jobKey, "ARO 房间映射已刷新");
                }
                case JOB_ARO_PENETRATION_POLL -> executeAroPenetration(preferSync);
                case JOB_DAILY_EXEMPT_RESET -> {
                    aroSyncTask.dailyExemptResetTask();
                    yield JobRunOutcome.ok(jobKey, "每日豁免回收已完成");
                }
                case JOB_STRANDED_VIOLATION_CHECK -> {
                    strandedViolationService.executeScheduledCheck();
                    yield JobRunOutcome.ok(jobKey, "滞留违规检测完成");
                }
                case JOB_STRANDED_SIGNOUT_CHECK -> {
                    strandedViolationService.executeScheduledSignoutCheck();
                    yield JobRunOutcome.ok(jobKey, "滞留签退检测完成");
                }
                case JOB_SCAN_DELAY_AUTO_APPROVE -> {
                    if (scanDelayAutoApproveService == null) {
                        throw new IllegalStateException("ScanDelayAutoApproveService 未就绪");
                    }
                    var summary = scanDelayAutoApproveService.runScheduledJob();
                    yield JobRunOutcome.ok(jobKey, "自动审批完成 approved=" + summary.get("approved"), summary);
                }
                case JOB_MATERIAL_AUTO_APPROVE -> {
                    if (materialAutoApproveService == null) {
                        throw new IllegalStateException("MaterialAutoApproveService 未就绪");
                    }
                    var summary = materialAutoApproveService.runScheduledJob();
                    yield JobRunOutcome.ok(jobKey, "物资自动审批 approved=" + summary.get("approved"), summary);
                }
                case JOB_TELEMETRY_WINCC_UI -> {
                    telemetrySnapshotService.refreshFromWinCc();
                    yield JobRunOutcome.ok(jobKey, "WinCC 测量值快照已刷新");
                }
                case JOB_TELEMETRY_WINCC_LIMITS_UI -> {
                    telemetrySnapshotService.refreshLimitsFromWinCcAndPersist();
                    yield JobRunOutcome.ok(jobKey, "WinCC 限值已拉取入库");
                }
                case JOB_DAHUA_SWING_STATS_PULL_PREVIOUS_DAY ->
                        executeStatsPullScheduledJob(jobKey, "PREVIOUS_DAY", true, "昨日日批");
                case JOB_DAHUA_SWING_STATS_PULL_PREVIOUS_WEEK ->
                        executeStatsPullScheduledJob(jobKey, "PREVIOUS_WEEK", false, "上周周批");
                case JOB_DAHUA_SWING_STATS_PULL_SINCE_LAST ->
                        executeStatsPullScheduledJob(jobKey, "SINCE_LAST", false, "水位增量");
                case JOB_TELEMETRY_ARCHIVE_PURGE -> {
                    var result = telemetryArchiveService.purgeExpiredBatched("system-scheduler", null);
                    long deleted = result.getDeletedRows();
                    Map<String, Object> purgeMetrics = new LinkedHashMap<>();
                    purgeMetrics.put("deletedRows", deleted);
                    purgeMetrics.put("durationMs", result.getDurationMs());
                    purgeMetrics.put("remainingRows", result.getRemainingRows());
                    String summary = "归档清理删除 " + deleted + " 行，耗时 " + result.getDurationMs() + "ms";
                    if (deleted == 0) {
                        yield JobRunOutcome.noop(jobKey, summary + "（无过期数据）", purgeMetrics);
                    }
                    yield JobRunOutcome.ok(jobKey, summary, purgeMetrics);
                }
                case JOB_TELEMETRY_ARCHIVE_ROLLUP -> {
                    var summary = telemetryArchiveRollupService.runRollupJob();
                    yield JobRunOutcome.ok(jobKey, "Rollup 完成 upsert5="
                            + summary.get("upserted5min") + " upsert1h=" + summary.get("upserted1h"), summary);
                }
                case JOB_TELEMETRY_VIEW_SNAPSHOT -> {
                    var summary = telemetryViewSnapshotService.captureSnapshot("PRESENTATION", null, null, null);
                    yield JobRunOutcome.ok(jobKey, "视图快照已捕获 id=" + summary.get("snapshotId"), summary);
                }
                case JOB_ACCESS_CLEAN_PACKAGE_DAILY -> {
                    Map<String, Object> stats = accessSwingCleanWorkspaceService.autoPublishAllEnabledChannels();
                    analyticsPipelineHook.afterAccessDataPipeline();
                    int ok = stats.get("ok") instanceof Number n ? n.intValue() : 0;
                    int fail = stats.get("fail") instanceof Number n ? n.intValue() : 0;
                    int skipNoAuto = stats.get("skipNoAuto") instanceof Number n ? n.intValue() : 0;
                    int channels = stats.get("channels") instanceof Number n ? n.intValue() : 0;
                    Map<String, Object> metrics = new LinkedHashMap<>(stats);
                    String summary =
                            "门禁自动入库：成功 "
                                    + ok
                                    + " 个通道，跳过(未开自动) "
                                    + skipNoAuto
                                    + "，失败 "
                                    + fail
                                    + "；已刷新隔离服/笼架订阅统计";
                    if (channels == 0) {
                        yield JobRunOutcome.noop(jobKey, summary + "（无启用通道）", metrics);
                    }
                    yield JobRunOutcome.ok(jobKey, summary, metrics);
                }
                case JOB_CAGE_SPECIAL_STATUS_SCAN -> {
                    String triggeredBy = preferSync ? "ui-manual" : "system-scheduler";
                    Map<String, Object> result = cageSpecialStatusScanService.executeFullScan(triggeredBy);
                    Object cagesWithStatus = result.get("cagesWithStatus");
                    int cws = cagesWithStatus instanceof Number n ? n.intValue() : 0;
                    yield JobRunOutcome.ok(jobKey,
                            "全量笼位数据同步完成，扫描 " + result.get("cagesScanned") + " 个笼位，其中特殊状态 " + cws + " 个", result);
                }
                case JOB_EXP_RECONCILE -> {
                    if (twinExpReconcileService == null) {
                        throw new IllegalStateException("TwinExpReconcileService 未就绪");
                    }
                    var metrics = twinExpReconcileService.reconcileDate(LocalDate.now().minusDays(1));
                    yield JobRunOutcome.ok(jobKey,
                            "经验对账完成：处理 " + metrics.get("usersProcessed") + " 人，"
                                    + "写入 " + metrics.get("recordsCreated") + " 条，"
                                    + "标记异常 " + metrics.get("anomaliesFlagged") + " 条",
                            metrics);
                }
                case JOB_DASHBOARD_RANKING_ACTIVITY -> {
                    int baselineCreated = rankingSnapshotService.captureAllActivityBaselinesIfAbsent();
                    if (socketServer != null) {
                        socketServer.getRoomOperations(SocketRoomAssigner.ROOM_CONSOLE_LIVE).sendEvent("DASHBOARD_RANKING_REFRESH",
                                Map.of("jobKey", jobKey, "at", java.time.LocalDateTime.now().toString()));
                    }
                    yield JobRunOutcome.ok(jobKey,
                            "进出活跃排行榜刷新信号已广播；当日基线快照新增 " + baselineCreated + " 个区域");
                }
                case JOB_DASHBOARD_RANKING_ANIMAL -> {
                    if (socketServer != null) {
                        socketServer.getRoomOperations(SocketRoomAssigner.ROOM_CONSOLE_LIVE).sendEvent("DASHBOARD_RANKING_REFRESH",
                                Map.of("jobKey", jobKey, "at", java.time.LocalDateTime.now().toString()));
                    }
                    yield JobRunOutcome.ok(jobKey, "动物消耗排行榜刷新信号已广播");
                }
                case JOB_CAGE_STATUS_VIOLATION_CHECK -> {
                    if (cageStatusViolationCheckService == null) {
                        throw new IllegalStateException("CageStatusViolationCheckService 未就绪");
                    }
                    String triggeredBy = preferSync ? "ui-manual" : "system-scheduler";
                    Map<String, Object> result = cageStatusViolationCheckService.executePureDaysCheck(triggeredBy);
                    yield JobRunOutcome.ok(jobKey, "笼架违规检测完成 rulesChecked="
                            + result.get("rulesChecked") + " triggered=" + result.get("totalTriggered"), result);
                }
                default -> throw new IllegalArgumentException("不支持的任务: " + jobKey);
            };
        } finally {
            running.remove(jobKey);
        }
    }

    private JobRunOutcome executeStatsPullScheduledJob(
            String jobKey, String periodMode, boolean runIncrementalAndAnalytics, String label) {
        Map<String, Object> stats = dahuaSwingStatsPullService.executeScheduledForPeriodMode(periodMode);
        Map<String, Object> incremental = Map.of();
        if (runIncrementalAndAnalytics) {
            incremental = accessSwingCleanWorkspaceService.autoPublishAllEnabledChannels();
            analyticsPipelineHook.afterAccessDataPipeline();
        }
        int ok = stats.get("ok") instanceof Number n ? n.intValue() : 0;
        int fail = stats.get("fail") instanceof Number n ? n.intValue() : 0;
        int skipped = stats.get("skipped") instanceof Number n ? n.intValue() : 0;
        int autoCleanOk = stats.get("autoCleanOk") instanceof Number n ? n.intValue() : 0;
        int autoCleanSkipped = stats.get("autoCleanSkipped") instanceof Number n ? n.intValue() : 0;
        int autoCleanFail = stats.get("autoCleanFail") instanceof Number n ? n.intValue() : 0;
        int incOk = incremental.get("ok") instanceof Number n ? n.intValue() : 0;
        Map<String, Object> metrics = new LinkedHashMap<>(stats);
        if (!incremental.isEmpty()) {
            metrics.put("incrementalClean", incremental);
        }
        String summary =
                label
                        + " 拉取：成功 "
                        + ok
                        + " 失败 "
                        + fail
                        + " 跳过 "
                        + skipped
                        + "；拉取后自动清洗 成功"
                        + autoCleanOk
                        + " 跳过"
                        + autoCleanSkipped
                        + " 失败"
                        + autoCleanFail;
        if (runIncrementalAndAnalytics) {
            summary += "；增量入库通道 " + incOk + "；已刷新隔离服/笼架订阅统计";
        }
        if (ok == 0 && fail == 0) {
            return JobRunOutcome.noop(
                    jobKey, summary + "（无已启用且匹配策略的审计任务）", metrics);
        }
        return JobRunOutcome.ok(jobKey, summary, metrics);
    }

    private JobRunOutcome executeAroPenetration(boolean manual) {
        AroIncrementalSyncResult sync = aroSyncTask.executeIncrementalSync(manual);
        Map<String, Object> metrics = new LinkedHashMap<>(sync.metrics());
        String summary = sync.summary();
        // 穿甲弹仅同步流水 + 大屏推送；空间画像/行为预测由定时管理 MODEL_RECALC、GROUP_RECALC 单独调度，避免每条新动态重算全员。
        if (sync.getNewInserted() > 0) {
            return JobRunOutcome.ok(JOB_ARO_PENETRATION_POLL, summary, metrics);
        }
        if (sync.getApiRecords() == 0) {
            return JobRunOutcome.noop(JOB_ARO_PENETRATION_POLL, summary, metrics);
        }
        return JobRunOutcome.noop(JOB_ARO_PENETRATION_POLL, summary, metrics);
    }

}
