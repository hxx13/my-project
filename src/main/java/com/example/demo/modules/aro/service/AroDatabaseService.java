package com.example.demo.modules.aro.service;

import com.example.demo.modules.aro.dto.AroRecord;
import com.example.demo.modules.aro.mapper.AroDatabaseMapper;
import com.example.demo.modules.twin.service.TwinAccessLogCorrelationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class AroDatabaseService {

    @Autowired
    private AroDatabaseMapper aroDatabaseMapper;

    @Autowired
    private TwinAccessLogCorrelationService twinAccessLogCorrelationService;

    // 💥 你的核心业务批量入库逻辑 (已追加特权字段支持)
    public void batchInsert(List<com.example.demo.modules.aro.dto.AroRecord> records) {
        if (records == null || records.isEmpty()) return;

        aroDatabaseMapper.batchInsertAccessLogs(records);
        twinAccessLogCorrelationService.reconcileNewOfficialRecords(records);
    }

    // ==========================================
    // 💥 RPG 经验引擎专属方法 (已修复真实字段名)
    // ==========================================

    /**
     * 获取今天流水记录
     */
    public List<Map<String, Object>> getTodayRecords(String userId) {
        String todayStart = LocalDate.now().toString() + " 00:00:00";
        // 💥 核心修复：必须查你的真实表 aro_access_log！
        // 💥 并把真实的 accessType 字段用 'as action' 骗过引擎！
        try {
            return aroDatabaseMapper.getTodayRecords(userId, todayStart);
        } catch (Exception e) {
            // 禁止静默报错，必须打印出来看看！
            System.err.println("❌ 查询今日实时流水失败: " + e.getMessage());
            return new ArrayList<>();
        }
    }

    /**
     * 获取用户的历史总经验
     */
    public double getUserTotalExp(String userId) {
        // 💥 核心修复：主键叫 user_id，不是 id！
        try {
            Double exp = aroDatabaseMapper.getUserTotalExp(userId);
            return exp != null ? exp : 0.0;
        } catch (Exception e) {
            return 0.0; // 如果字段尚未被大结算更新，默认返回 0.0
        }
    }
}