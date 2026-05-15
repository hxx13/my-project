package com.example.demo.modules.twin.service;

import com.example.demo.modules.aro.mapper.AroDatabaseMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class RpgDatabaseService {

    @Autowired
    private AroDatabaseMapper aroDatabaseMapper;

    public List<Map<String, Object>> getTodayRecords(String userId) {
        String todayStart = LocalDate.now().toString() + " 00:00:00";

        // 💥 修复：使用你真实的表名 aro_access_log 和真实的字段 accessType
        // 用 'as action' 骗过引擎，让引擎依然能读到动作！
        try {
            return aroDatabaseMapper.getTodayRecords(userId, todayStart);
        } catch (Exception e) {
            System.err.println("查询今日流水失败: " + e.getMessage());
            return new ArrayList<>();
        }
    }

    public double getUserTotalExp(String userId) {
        // 💥 修复：你的人员表主键是 user_id，不是 id！
        try {
            Double exp = aroDatabaseMapper.getUserTotalExp(userId);
            return exp != null ? exp : 0.0;
        } catch (Exception e) {
            return 0.0;
        }
    }
}