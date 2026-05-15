package com.example.demo.modules.aro.controller;

import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.service.AroPersonnelDatabaseService;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.aro.task.AroSyncTask;
import com.example.demo.modules.twin.service.ExamRoomPermissionSyncService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/twin") // 💥 确保基础路径完全一致
public class TwinSyncController {

    @Autowired private AroService aroService;
    @Autowired private AroPersonnelDatabaseService aroPersonnelDatabaseService;
    @Autowired private AroSyncTask aroSyncTask; // 💥 直接注入你的老黄牛任务
    @Autowired private ExamRoomPermissionSyncService examRoomPermissionSyncService;

    // 1. 对应前端：全量同步人员库按钮
    @PostMapping("/personnel/sync-all")
    public Map<String, Object> syncPersonnel() {
        Map<String, Object> response = new HashMap<>();
        try {
            System.out.println("🚀 [前端触发] 开始全量拉取 ARO 官方人员库...");
            List<AroPersonnel> allPersonnel = aroService.fetchAllPersonnel();
            if (allPersonnel != null && !allPersonnel.isEmpty()) {
                aroPersonnelDatabaseService.upsertPersonnel(allPersonnel);
                examRoomPermissionSyncService.refreshAllowedRoomsDisplayForPersonnelList(allPersonnel);
                response.put("code", 200);
                response.put("msg", "成功同步 " + allPersonnel.size()
                        + " 名人员信息，并已拉取官方可进房间权限写入档案库展示列。");
            } else {
                response.put("code", 500);
                response.put("msg", "官方接口返回空数据");
            }
        } catch (Exception e) {
            response.put("code", 500);
            response.put("msg", "同步失败: " + e.getMessage());
        }
        return response;
    }

    // 2. 对应前端：立刻同步最新流水按钮
    @PostMapping("/dashboard/sync-logs")
    public Map<String, Object> syncLogs() {
        Map<String, Object> response = new HashMap<>();
        try {
            System.out.println("🚀 [前端触发] 手动召唤打卡机数据...");
            // 💥 直接手动调用你写好的定时任务逻辑！一滴代码都不浪费！
            aroSyncTask.syncAroRecords();
            response.put("code", 200);
            response.put("msg", "最新流水追溯完成！");
        } catch (Exception e) {
            response.put("code", 500);
            response.put("msg", "流水同步失败: " + e.getMessage());
        }
        return response;
    }
}