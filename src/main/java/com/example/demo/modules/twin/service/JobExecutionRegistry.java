package com.example.demo.modules.twin.service;

import com.example.demo.modules.dahua.service.DahuaDepartmentCacheService;
import com.example.demo.modules.dahua.service.DahuaDeviceChannelCacheService;
import com.example.demo.modules.dahua.service.DahuaDoorGroupCacheService;
import com.example.demo.modules.roommapping.service.RoomMappingService;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.task.AroSyncTask;
import com.example.demo.modules.telemetry.service.TelemetrySnapshotService;
import org.springframework.stereotype.Service;

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
            TelemetrySnapshotService telemetrySnapshotService) {
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
    }

    public Map<String, String> jobNameMap() {
        Map<String, String> jobs = new LinkedHashMap<>();
        jobs.put(JOB_RPG_RECALC, "重算全员经验");
        jobs.put(JOB_PERSONNEL_SYNC, "全量同步档案");
        jobs.put(JOB_MODEL_RECALC, "触发模型重算");
        jobs.put(JOB_GROUP_RECALC, "重新测算全局空间");
        jobs.put(JOB_ORDER_SYNC, "追溯官方订单（青春版3000）");
        jobs.put(JOB_ORDER_SYNC_FULL, "追溯官方订单（全量）");
        jobs.put(JOB_RUN_REAPER, "自动冻结跑批");
        jobs.put(JOB_RUN_REAPER_SECOND, "第二次冻结跑批");
        jobs.put(JOB_DH_DEPT_REFRESH, "刷新部门缓存");
        jobs.put(JOB_DH_GROUP_REFRESH, "刷新门组缓存");
        jobs.put(JOB_DH_CHANNEL_REFRESH, "刷新通道缓存");
        jobs.put(JOB_ROOM_MAPPING_REFRESH, "ARO房间落库刷新");
        jobs.put(JOB_ARO_PENETRATION_POLL, "ARO 穿甲弹请求");
        jobs.put(JOB_DAILY_EXEMPT_RESET, "每日豁免权回收");
        jobs.put(JOB_TELEMETRY_WINCC_UI, "动物房温湿度·WinCC测量值轮询（窗口+间隔；立即执行=刷新内存快照）");
        jobs.put(JOB_TELEMETRY_WINCC_LIMITS_UI, "动物房温湿度·WinCC限值低频拉取（窗口+间隔；写入变量表缓存上下限）");
        return jobs;
    }

    public boolean isRunning(String jobKey) {
        return running.contains(jobKey);
    }

    public void execute(String jobKey) {
        if (!running.add(jobKey)) {
            throw new IllegalStateException("任务正在执行中: " + jobKey);
        }
        try {
            switch (jobKey) {
                case JOB_RPG_RECALC -> rpgEngineService.recalculateAllHistoricalExp();
                case JOB_PERSONNEL_SYNC -> {
                    List<AroPersonnel> personnel = aroService.fetchAllPersonnel();
                    personnelDbService.upsertPersonnel(personnel);
                    examRoomPermissionSyncService.refreshAllowedRoomsDisplayForPersonnelList(personnel);
                }
                case JOB_MODEL_RECALC -> predictionEngineService.runPredictionModelManualAsync("ALL");
                case JOB_GROUP_RECALC -> predictionEngineService.executeGroupPipelineAsync("ALL");
                case JOB_ORDER_SYNC -> orderSyncService.syncOfficialAnimalOrders();
                case JOB_ORDER_SYNC_FULL -> orderSyncService.syncOfficialAnimalOrdersFull();
                case JOB_RUN_REAPER -> aroSyncTask.midnightReaperTask();
                case JOB_RUN_REAPER_SECOND -> aroSyncTask.secondFreezeReaperTask();
                case JOB_DH_DEPT_REFRESH -> departmentCacheService.refreshFromUpstream();
                case JOB_DH_GROUP_REFRESH -> doorGroupCacheService.refreshFromUpstream();
                case JOB_DH_CHANNEL_REFRESH -> deviceChannelCacheService.refreshFromUpstream();
                case JOB_ROOM_MAPPING_REFRESH -> {
                    try {
                        roomMappingService.refreshFromClasspath();
                    } catch (Exception e) {
                        throw new RuntimeException(e);
                    }
                }
                case JOB_ARO_PENETRATION_POLL -> aroSyncTask.executeIncrementalSync();
                case JOB_DAILY_EXEMPT_RESET -> aroSyncTask.dailyExemptResetTask();
                case JOB_TELEMETRY_WINCC_UI -> telemetrySnapshotService.refreshFromWinCc();
                case JOB_TELEMETRY_WINCC_LIMITS_UI -> telemetrySnapshotService.refreshLimitsFromWinCcAndPersist();
                default -> throw new IllegalArgumentException("不支持的任务: " + jobKey);
            }
        } finally {
            running.remove(jobKey);
        }
    }
}
