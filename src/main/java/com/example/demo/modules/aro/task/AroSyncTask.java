package com.example.demo.modules.aro.task;

import com.corundumstudio.socketio.SocketIOServer;
import com.example.demo.common.dto.UniversalEvent;
import com.example.demo.modules.aro.dto.AroIncrementalSyncResult;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.dto.AroRecord;
import com.example.demo.modules.aro.mapper.AroDatabaseMapper;
import com.example.demo.modules.aro.service.AroDatabaseService;
import com.example.demo.modules.aro.service.AroPersonnelDatabaseService;
import com.example.demo.modules.aro.service.RealtimeEventDedupService;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.aro.service.AroStartupAsyncService;
import com.example.demo.modules.twin.component.RoomNormalizer;
import com.example.demo.modules.twin.support.AccessLogFeedProvenanceBuilder;
import com.example.demo.modules.twin.support.FreezeReaperAuditContext;
import com.example.demo.modules.twin.mapper.TwinDashboardMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Component
@EnableScheduling
public class AroSyncTask {

    private static final Logger log = LoggerFactory.getLogger(AroSyncTask.class);
    private static final String EPOCH_WATERMARK = "1970-01-01 00:00:00";

    @Autowired private AroService aroService;
    @Autowired private AroDatabaseService aroDatabaseService;
    @Autowired private AroPersonnelDatabaseService aroPersonnelDatabaseService;
    @Autowired private SocketIOServer socketServer;
    @Autowired private RoomNormalizer roomNormalizer;
    @Autowired private AroDatabaseMapper aroDatabaseMapper;
    @Autowired private RealtimeEventDedupService realtimeEventDedupService;
    @Autowired private AroStartupAsyncService aroStartupAsyncService;
    @Autowired private com.example.demo.modules.twin.service.TwinDashboardService dashboardService;
    @Autowired private TwinDashboardMapper dashboardMapper;
    @Autowired private com.example.demo.modules.twin.service.TwinCardMappingService twinCardMappingService;
    @Autowired private com.example.demo.modules.twin.service.TwinCardMappingService mappingService;
    @Autowired private com.example.demo.modules.twin.service.TwinFreezeConfigService freezeConfigService;
    @Autowired @Lazy private com.example.demo.modules.twin.service.JobSchedulerService jobSchedulerService;
    @Autowired private com.example.demo.modules.twin.service.DahuaAutoSignoutService dahuaAutoSignoutService;
    @Autowired private com.example.demo.modules.twin.service.TwinAutomationLogService automationLogService;
    private String lastRecordTime = EPOCH_WATERMARK;
    private volatile boolean watermarkHydrated = false;
    private boolean isFirstRun = true;

    /** 从库内最新流水恢复增量水位，避免重启后以 1970 水位重复拉取当日全量。 */
    public synchronized void refreshWatermarkFromDatabase() {
        watermarkHydrated = false;
        ensureWatermarkFromDatabase();
    }

    private synchronized void ensureWatermarkFromDatabase() {
        if (watermarkHydrated) {
            return;
        }
        try {
            String latest = aroDatabaseMapper.getLatestAccessLogCreateTime();
            if (latest != null && !latest.isBlank()) {
                lastRecordTime = latest.trim();
                log.info("[ARO Sync] 已从库恢复水位线 watermark={}", lastRecordTime);
            } else {
                lastRecordTime = todayStartWatermark();
                log.info("[ARO Sync] 流水库为空，水位线设为今日零点 {}", lastRecordTime);
            }
        } catch (Exception e) {
            lastRecordTime = todayStartWatermark();
            log.warn("[ARO Sync] 读取水位线失败，改用今日零点 {}: {}", lastRecordTime, e.getMessage());
        }
        watermarkHydrated = true;
    }

    private static String todayStartWatermark() {
        return LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd")) + " 00:00:00";
    }

    private static boolean isEpochWatermark(String wm) {
        return wm == null || wm.isBlank() || EPOCH_WATERMARK.equals(wm.trim());
    }


    // ==========================================================
    // ⚠️ 说明：ARO 穿甲弹轮询已统一由定时管理驱动
    // 入口：UnifiedScheduleDispatcher -> JobSchedulerService -> JobExecutionRegistry(JOB_ARO_PENETRATION_POLL)
    // 这里保留历史方法但不再绑定 @Scheduled，避免绕过执行计划。
    // ==========================================================
    public void syncAroRecords() {
        // 首次仍触发一次开机后台自检
        if (isFirstRun) {
            isFirstRun = false;
            log.info("[ARO Sync] 系统启动：触发后台自检（不阻塞主服务）");
            aroStartupAsyncService.executeHeavyStartupCheckAsync();
            return;
        }
        executeIncrementalSync(false);
    }

    public synchronized AroIncrementalSyncResult executeIncrementalSync() {
        return executeIncrementalSync(false);
    }

    /**
     * @param manualTrigger true=管理端手动：按今日 00:00 起全量比对，避免内存水位导致「假成功无日志」
     */
    public synchronized AroIncrementalSyncResult executeIncrementalSync(boolean manualTrigger) {
        if (!manualTrigger) {
            ensureWatermarkFromDatabase();
        }
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        String rangeDate = today + " - " + today;
        String effectiveWatermark = manualTrigger ? todayStartWatermark() : lastRecordTime;
        if (!manualTrigger && isEpochWatermark(effectiveWatermark)) {
            effectiveWatermark = todayStartWatermark();
            lastRecordTime = effectiveWatermark;
            log.warn("[ARO Sync] 水位仍为默认值，已回退为今日零点 {}", effectiveWatermark);
        }

        int pageNum = 1;
        int pageSize = 100;
        int apiPages = 0;
        int apiRecords = 0;
        List<AroRecord> allCandidateRecords = new ArrayList<>();

        while (true) {
            List<AroRecord> records = aroService.fetchRecordsByCondition(rangeDate, null, pageNum, pageSize);
            if (records == null || records.isEmpty()) {
                break;
            }
            apiPages++;
            apiRecords += records.size();

            for (AroRecord record : records) {
                if (record != null && record.getCreateTime() != null
                        && record.getCreateTime().compareTo(effectiveWatermark) > 0) {
                    allCandidateRecords.add(record);
                }
            }
            AroRecord lastOnPage = records.get(records.size() - 1);
            if (lastOnPage == null || lastOnPage.getCreateTime() == null
                    || lastOnPage.getCreateTime().compareTo(effectiveWatermark) <= 0) {
                break;
            }
            pageNum++;
            try {
                Thread.sleep(1500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }

        int newInserted = 0;
        if (!allCandidateRecords.isEmpty()) {
            String maxCreateTime = allCandidateRecords.stream()
                    .map(AroRecord::getCreateTime)
                    .filter(Objects::nonNull)
                    .max(String::compareTo)
                    .orElse(lastRecordTime);
            lastRecordTime = maxCreateTime;
            Collections.reverse(allCandidateRecords);

            Map<String, AroRecord> uniqueById = new LinkedHashMap<>();
            for (AroRecord record : allCandidateRecords) {
                if (record == null || record.getId() == null) continue;
                uniqueById.put(String.valueOf(record.getId()), record);
            }

            if (!uniqueById.isEmpty()) {
                List<String> ids = new ArrayList<>(uniqueById.keySet());
                Set<String> existingIds = new HashSet<>(aroDatabaseMapper.findExistingAccessLogIds(ids));
                List<AroRecord> allNewRecords = new ArrayList<>();
                for (Map.Entry<String, AroRecord> entry : uniqueById.entrySet()) {
                    if (!existingIds.contains(entry.getKey())) {
                        allNewRecords.add(entry.getValue());
                    }
                }
                if (!allNewRecords.isEmpty()) {
                    aroDatabaseService.batchInsert(allNewRecords);
                    newInserted = allNewRecords.size();
                    pushToFrontend(allNewRecords);
                    pushPieChartUpdate();
                }
            }
        }

        String watermarkAfter = lastRecordTime;
        AroIncrementalSyncResult result = new AroIncrementalSyncResult(
                manualTrigger, apiPages, apiRecords, allCandidateRecords.size(), newInserted, watermarkAfter);
        if (newInserted > 0) {
            log.info(
                    "[ARO Sync] 新增入库 {} 条（候选 {}，接口 {}）watermark={}",
                    newInserted,
                    allCandidateRecords.size(),
                    apiRecords,
                    watermarkAfter);
        } else if (allCandidateRecords.size() > 50 && isEpochWatermark(effectiveWatermark)) {
            log.warn(
                    "[ARO Sync] 水位异常：以 {} 为界仍筛出 {} 条候选，请检查水位恢复；当前 watermark={}",
                    effectiveWatermark,
                    allCandidateRecords.size(),
                    watermarkAfter);
        } else if (log.isDebugEnabled()) {
            log.debug(
                    "[ARO Sync] 完成 manual={} apiRecords={} candidates={} newInserted={} watermark={}",
                    manualTrigger,
                    apiRecords,
                    allCandidateRecords.size(),
                    newInserted,
                    watermarkAfter);
        }
        return result;
    }

    /**
     * 阶段一：冻结跑批（由统一定时管理中心触发）。
     */
    public void midnightReaperTask() {
        String planTime = "18:00";
        try {
            Map<String, Object> fc = freezeConfigService.getConfigMap();
            if (fc.get("freezeTime") != null) {
                planTime = String.valueOf(fc.get("freezeTime")).trim();
            }
        } catch (Exception ignore) {
        }
        LocalDateTime execAt = LocalDateTime.now();
        System.out.println("🚨 [风控预警] 首次冻结跑批：计划时刻=" + planTime + "，实际执行=" + execAt);
        mappingService.reconcileExemptionsByLogs();
        Map<String, Integer> freezeStats = mappingService.executeFreezeReaperTask();
        String scheduleTriggerType = "TIMER";
        FreezeReaperAuditContext.Ctx actx = FreezeReaperAuditContext.get();
        if (actx != null && actx.getTriggerType() != null && !actx.getTriggerType().isBlank()) {
            scheduleTriggerType = actx.getTriggerType();
        }
        // 第一次冻结：每日定时（时刻见 freeze_config.freeze_time）触发滞留冻结跑批
        automationLogService.write(
                com.example.demo.modules.twin.service.TwinAutomationLogService.TYPE_SCHEDULER,
                "RUN_REAPER",
                scheduleTriggerType,
                "FIRST_FREEZE_TIMER",
                null,
                "RUN_REAPER",
                true,
                "首次冻结任务已执行；配置计划时刻=" + planTime + "；实际执行时间=" + execAt + "；冻结统计=" + freezeStats,
                "job-run-reaper"
        );
        // 业务约束：第一次冻结结束后立刻清空当日全部豁免标记，第二次冻结不再保留豁免。
        int cleared = mappingService.clearAllExemptFlagsAfterFirstFreeze();
        automationLogService.write(
                com.example.demo.modules.twin.service.TwinAutomationLogService.TYPE_EXEMPTION,
                "FIRST_FREEZE_CLEAR_EXEMPT",
                scheduleTriggerType,
                "FIRST_FREEZE_FINISHED_CLEAR_ALL_EXEMPT",
                null,
                "RUN_REAPER",
                true,
                "首次冻结结束后已清空当日豁免标记；清除条数=" + cleared,
                "job-run-reaper"
        );
    }

    /**
     * 第二次冻结跑批（独立定时任务）：再次冻结滞留人员，并按配置执行二次自动离开补偿。
     */
    public void secondFreezeReaperTask() {
        String planSecond = "";
        try {
            Map<String, Object> fc = freezeConfigService.getConfigMap();
            if (fc.get("secondFreezeTime") != null) {
                planSecond = String.valueOf(fc.get("secondFreezeTime")).trim();
            }
        } catch (Exception ignore) {
        }
        LocalDateTime execAt = LocalDateTime.now();
        System.out.println("🚨 [风控预警] 第二次冻结跑批：计划时刻=" + (planSecond.isEmpty() ? "（未配置）" : planSecond) + "，实际执行=" + execAt);
        mappingService.reconcileExemptionsByLogs();
        Map<String, Integer> freezeStats = mappingService.executeFreezeReaperTask();
        String scheduleTriggerType = "TIMER";
        FreezeReaperAuditContext.Ctx actx = FreezeReaperAuditContext.get();
        if (actx != null && actx.getTriggerType() != null && !actx.getTriggerType().isBlank()) {
            scheduleTriggerType = actx.getTriggerType();
        }
        automationLogService.write(
                com.example.demo.modules.twin.service.TwinAutomationLogService.TYPE_SCHEDULER,
                "RUN_REAPER_SECOND",
                scheduleTriggerType,
                "SECOND_FREEZE_TIMER",
                null,
                "RUN_REAPER_SECOND",
                true,
                "第二次冻结任务已执行；配置计划时刻=" + (planSecond.isEmpty() ? "未配置" : planSecond) + "；实际执行时间=" + execAt + "；冻结统计=" + freezeStats,
                "job-run-reaper-second"
        );
        try {
            Map<String, Object> cfg = freezeConfigService.getConfigMap();
            boolean secondFreezeAutoSignoutEnabled = Boolean.TRUE.equals(cfg.get("secondFreezeAutoSignoutEnabled"));
            if (secondFreezeAutoSignoutEnabled) {
                List<String> candidates = mappingService.listTodayExemptedThenRevokedUserIds();
                int success = 0;
                int fail = 0;
                for (String userId : candidates) {
                    boolean ok = dahuaAutoSignoutService.autoSignout(
                            userId,
                            "TIMER",
                            "SECOND_FREEZE_STRANDED_TODAY_EXEMPT",
                            "secondFreezeAutoSignoutEnabled=true"
                    );
                    if (ok) {
                        success++;
                    } else {
                        fail++;
                    }
                }
                System.out.println("🧩 [二次冻结补偿] 今日曾豁免且仍滞留 -> 自动离开，候选=" + candidates.size() + " 成功=" + success + " 失败=" + fail);
                automationLogService.write(
                        com.example.demo.modules.twin.service.TwinAutomationLogService.TYPE_SCHEDULER,
                        "SECOND_FREEZE_AUTO_SIGNOUT",
                        "TIMER",
                        "SECOND_FREEZE_TIMER",
                        null,
                        "RUN_REAPER_SECOND",
                        fail == 0,
                        "二次冻结后自动离开：候选人数=" + candidates.size() + "，成功=" + success + "，失败=" + fail,
                        "job-run-reaper-second"
                );
            } else {
                automationLogService.write(
                        com.example.demo.modules.twin.service.TwinAutomationLogService.TYPE_SCHEDULER,
                        "SECOND_FREEZE_AUTO_SIGNOUT",
                        "TIMER",
                        "SECOND_FREEZE_TIMER_DISABLED",
                        null,
                        "RUN_REAPER_SECOND",
                        true,
                        "二次冻结后自动离开功能已在配置中关闭（secondFreezeAutoSignoutEnabled=false），未执行批量签退",
                        "job-run-reaper-second"
                );
            }
        } catch (Exception e) {
            System.err.println("❌ [二次冻结补偿] 执行失败: " + e.getMessage());
            automationLogService.write(
                    com.example.demo.modules.twin.service.TwinAutomationLogService.TYPE_SCHEDULER,
                    "SECOND_FREEZE_AUTO_SIGNOUT",
                    "TIMER",
                    "SECOND_FREEZE_TIMER",
                    null,
                    "RUN_REAPER_SECOND",
                    false,
                    "二次冻结后自动离开执行异常：" + e.getMessage(),
                    "job-run-reaper-second"
            );
        }
    }

    /**
     * 阶段二：每日豁免回收（由统一定时管理中心触发）。
     */
    public void dailyExemptResetTask() {
        System.out.println("🧹 [系统维护] 正在执行每日豁免权回收...");
        boolean autoSignout = jobSchedulerService.isDailyExemptRevokeAutoSignoutEnabled();
        if (!autoSignout) {
            System.out.println("🧹 [系统维护] 回收后自动签离：未开启（定时管理·每日豁免回收 → revoke_auto_signout_enabled=false）");
        } else {
            System.out.println("🧹 [系统维护] 回收后自动签离：已开启（仅今日曾豁免且流水仍在馆）");
        }
        int[] result = mappingService.runDailyExemptMaintenance(autoSignout);
        int rows = result != null && result.length > 0 ? result[0] : 0;
        int signoutOk = result != null && result.length > 1 ? result[1] : 0;
        automationLogService.write(
                com.example.demo.modules.twin.service.TwinAutomationLogService.TYPE_EXEMPTION,
                "DAILY_EXEMPT_RESET",
                "TIMER",
                "DAILY_EXEMPT_RESET_TIMER",
                null,
                "DAILY_EXEMPT_RESET",
                true,
                "定时兜底豁免回收完成；收回条数=" + rows
                        + (autoSignout
                        ? "；自动签离成功=" + signoutOk + "（仅今日曾豁免+流水在馆）"
                        : "；未开启定时任务「回收后自动签离」")
                        + "。时效到期收回不签离。单人明细见 EXEMPT_REVOKED / AUTO_SIGNOUT。",
                "job-daily-exempt-reset"
        );
    }

    // ==========================================================
    // 🏋️‍♂️ 沉重的开机自检任务 (在独立线程中执行，想跑多久跑多久)
    // ==========================================================
    private void executeHeavyStartupCheck() {
        // 1. 人员核验
        Integer personnelCount = aroDatabaseMapper.countPersonnel();
        if (personnelCount == null || personnelCount == 0) {
            System.out.println("⚠️ [开机后台自检] 人员库为空！正在全量拉取人员 (不影响正常业务)...");
            List<AroPersonnel> allPersonnel = aroService.fetchAllPersonnel();
            if (!allPersonnel.isEmpty()) aroPersonnelDatabaseService.upsertPersonnel(allPersonnel);
        } else {
            System.out.println("✅ [开机后台自检] 人员库正常，当前录入人数: " + personnelCount);
        }

        // 2. 流水核验与历史重建
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        Integer logCount = aroDatabaseMapper.countAccessLogs();

        if (logCount == null || logCount == 0) {
            String startDate = "2025-10-01";
            String rangeDate = startDate + " - " + today;
            System.out.println("⚠️ [开机后台自检] 流水库为空！开启历史防洪追溯，目标时间：" + rangeDate);

            int pageNum = 1;
            int totalRecovered = 0;
            while (true) {
                List<AroRecord> records = aroService.fetchRecordsByCondition(rangeDate, null, pageNum, 100);
                if (records == null || records.isEmpty()) break;

                aroDatabaseService.batchInsert(records);
                totalRecovered += records.size();
                System.out.println("✅ [历史重建] 成功入库第 " + pageNum + " 页，已累计找回 " + totalRecovered + " 条...");

                if (pageNum == 1 && !records.isEmpty()) lastRecordTime = records.get(0).getCreateTime();
                if (records.size() < 100) break;

                pageNum++;
                try { Thread.sleep(1500); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            }
            System.out.println("🎉 [历史重建] 大功告成！完美补齐了 " + totalRecovered + " 条记录！");
        } else {
            // 如果库里有数据，随便查一条最近的时间赋给 lastRecordTime，防止重启后狂拉数据
            try {
                String latestTime = aroDatabaseMapper.getLatestAccessLogCreateTime();
                if (latestTime != null) lastRecordTime = latestTime;
            } catch (Exception e) {}
        }

        // 在开机自检方法的末尾加入：
        mappingService.reconcileExemptionsByLogs();
        // 自检完成后，推一次首屏饼图
        pushPieChartUpdate();
    }

    // ==========================================================
    // 📊 饼图推送组件
    // ==========================================================
    private void pushPieChartUpdate() {
        try {
            System.out.println("📊 [大屏推送] 正在计算最新饼图数据...");
            Map<String, Object> newPieData = dashboardService.getTodayRoomStats();
            socketServer.getBroadcastOperations().sendEvent("TWIN_PIE_UPDATE", newPieData);
        } catch (Exception e) {
            System.err.println("❌ 饼图推送失败: " + e.getMessage());
        }
    }

    // ==========================================================
    // 📢 瀑布流推送组件 (代码保持你的原样，完美适配大屏)
    // ==========================================================
    private void pushToFrontend(List<AroRecord> records) {
        for (AroRecord record : records) {
            String recordId = String.valueOf(record.getId());
            if (realtimeEventDedupService.shouldSkipSyncPush(recordId)) {
                continue;
            }
            UniversalEvent event = new UniversalEvent();
            event.setEventId("ARO-" + record.getId());
            event.setSource("ARO");
            event.setCategory("ACCESS");
            event.setTimestamp(record.getCreateTime());

            String standardAction = "UNKNOWN";
            String rawMessage = "未知状态";
            if (record.getAccessType() != null) {
                if (record.getAccessType() == 1) { standardAction = "ENTER"; rawMessage = "合法进入"; }
                else if (record.getAccessType() == 2) { standardAction = "EXIT"; rawMessage = "合法离开"; }
                else if (record.getAccessType() == 0) { standardAction = "WARN"; rawMessage = "进入未离开"; }
            }
            event.setAction(standardAction);

            UniversalEvent.PersonInfo person = new UniversalEvent.PersonInfo();
            person.setUserId(record.getUserId());
            person.setName(record.getName());
            person.setRole(record.getUserTypeNames());
            person.setGroup(record.getProjectGroupNames());
            event.setPerson(person);

            UniversalEvent.LocationInfo location = new UniversalEvent.LocationInfo();
            location.setCampus(record.getAreaName());
            location.setFloor(record.getFloorName());
            location.setRoom(roomNormalizer.normalize(record.getRoomName()));
            location.setRoomId(record.getRoomId());
            event.setLocation(location);

            UniversalEvent.OriginalData original = new UniversalEvent.OriginalData();
            original.setRawStatusCode(String.valueOf(record.getAccessType()));
            original.setMessage(rawMessage);
            event.setOriginalData(original);
            event.setFeedProvenance(AccessLogFeedProvenanceBuilder.fromAroRecord(record));

            socketServer.getBroadcastOperations().sendEvent("TWIN_GLOBAL_EVENT", event);
        }
    }
}