package com.example.demo.modules.aro.service;

import com.corundumstudio.socketio.SocketIOServer;
import com.example.demo.common.component.SocketRoomAssigner;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.dto.AroRecord;
import com.example.demo.modules.aro.mapper.AroDatabaseMapper;
import com.example.demo.modules.aro.task.AroSyncTask;
import com.example.demo.modules.twin.card.service.TwinCardMappingService;
import com.example.demo.modules.twin.dashboard.service.TwinDashboardService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

@Service
public class AroStartupAsyncService {

    private static final Logger log = LoggerFactory.getLogger(AroStartupAsyncService.class);

    @Autowired private AroService aroService;
    @Autowired private AroDatabaseService aroDatabaseService;
    @Autowired private AroPersonnelDatabaseService aroPersonnelDatabaseService;
    @Autowired private AroDatabaseMapper aroDatabaseMapper;
    @Autowired private TwinDashboardService dashboardService;
    @Autowired private TwinCardMappingService mappingService;
    @Autowired private SocketIOServer socketServer;
    @Autowired @Lazy private AroSyncTask aroSyncTask;

    @Async("heavyCalcExecutor")
    public void executeHeavyStartupCheckAsync() {
        Integer personnelCount = aroDatabaseMapper.countPersonnel();
        if (personnelCount == null || personnelCount == 0) {
            log.warn("[开机后台自检] 人员库为空！正在全量拉取人员 (不影响正常业务)...");
            List<AroPersonnel> allPersonnel = aroService.fetchAllPersonnel();
            if (!allPersonnel.isEmpty()) aroPersonnelDatabaseService.upsertPersonnel(allPersonnel);
        } else {
            log.info("[开机后台自检] 人员库正常，当前录入人数: {}", personnelCount);
        }

        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        Integer logCount = aroDatabaseMapper.countAccessLogs();

        if (logCount == null || logCount == 0) {
            String startDate = "2025-10-01";
            String rangeDate = startDate + " - " + today;
            log.warn("[开机后台自检] 流水库为空！开启历史防洪追溯，目标时间：{}", rangeDate);

            int pageNum = 1;
            int totalRecovered = 0;
            while (true) {
                List<AroRecord> records = aroService.fetchRecordsByCondition(rangeDate, null, pageNum, 100);
                if (records == null || records.isEmpty()) break;

                aroDatabaseService.batchInsert(records);
                totalRecovered += records.size();
                log.info("[历史重建] 成功入库第 {} 页，已累计找回 {} 条...", pageNum, totalRecovered);

                if (records.size() < 100) break;
                pageNum++;
                try { Thread.sleep(1500); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            }
            log.info("[开机自检] 历史流水重建完成，共 {} 条", totalRecovered);
        }

        aroSyncTask.refreshWatermarkFromDatabase();
        mappingService.reconcileExemptionsByLogs();
        mappingService.resetDailyExemptions();
        try {
            log.info("[大屏推送] 正在计算最新饼图数据...");
            Map<String, Object> newPieData = dashboardService.getTodayRoomStats();
            socketServer.getRoomOperations(SocketRoomAssigner.ROOM_CONSOLE_LIVE).sendEvent("TWIN_PIE_UPDATE", newPieData);
        } catch (Exception e) {
            log.error("饼图推送失败: {}", e.getMessage());
        }
    }
}
