package com.example.demo.modules.aro.service;

import com.corundumstudio.socketio.SocketIOServer;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.dto.AroRecord;
import com.example.demo.modules.aro.mapper.AroDatabaseMapper;
import com.example.demo.modules.twin.service.TwinCardMappingService;
import com.example.demo.modules.twin.service.TwinDashboardService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

@Service
public class AroStartupAsyncService {

    @Autowired private AroService aroService;
    @Autowired private AroDatabaseService aroDatabaseService;
    @Autowired private AroPersonnelDatabaseService aroPersonnelDatabaseService;
    @Autowired private AroDatabaseMapper aroDatabaseMapper;
    @Autowired private TwinDashboardService dashboardService;
    @Autowired private TwinCardMappingService mappingService;
    @Autowired private SocketIOServer socketServer;

    @Async("heavyCalcExecutor")
    public void executeHeavyStartupCheckAsync() {
        Integer personnelCount = aroDatabaseMapper.countPersonnel();
        if (personnelCount == null || personnelCount == 0) {
            System.out.println("⚠️ [开机后台自检] 人员库为空！正在全量拉取人员 (不影响正常业务)...");
            List<AroPersonnel> allPersonnel = aroService.fetchAllPersonnel();
            if (!allPersonnel.isEmpty()) aroPersonnelDatabaseService.upsertPersonnel(allPersonnel);
        } else {
            System.out.println("✅ [开机后台自检] 人员库正常，当前录入人数: " + personnelCount);
        }

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

                if (records.size() < 100) break;
                pageNum++;
                try { Thread.sleep(1500); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            }
            System.out.println("🎉 [历史重建] 大功告成！完美补齐了 " + totalRecovered + " 条记录！");
        }

        mappingService.reconcileExemptionsByLogs();
        mappingService.resetDailyExemptions();
        try {
            System.out.println("📊 [大屏推送] 正在计算最新饼图数据...");
            Map<String, Object> newPieData = dashboardService.getTodayRoomStats();
            socketServer.getBroadcastOperations().sendEvent("TWIN_PIE_UPDATE", newPieData);
        } catch (Exception e) {
            System.err.println("❌ 饼图推送失败: " + e.getMessage());
        }
    }
}
