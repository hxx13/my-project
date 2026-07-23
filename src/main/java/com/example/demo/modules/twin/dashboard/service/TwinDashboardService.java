package com.example.demo.modules.twin.dashboard.service;

import com.example.demo.common.dto.UniversalEvent;
import com.example.demo.common.time.BusinessTimeWindow;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class TwinDashboardService {

    private static final Logger log = LoggerFactory.getLogger(TwinDashboardService.class);

    @Autowired
    private TwinDashboardMapper dashboardMapper;

    @Autowired
    private BusinessTimeWindow businessTimeWindow;

    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    /**
     * 🏆 API 1：课题组排行榜 (完全委托给 Mapper)
     */
    public List<Map<String, Object>> getGroupRanking(String timeType, String region) {
        LocalDate today = businessTimeWindow.today();
        String startTime;
        String endTime = null;

        if ("TODAY".equalsIgnoreCase(timeType)) {
            startTime = today.format(FMT) + " 00:00:00";
        } else if ("WEEK".equalsIgnoreCase(timeType)) {
            startTime = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).format(FMT) + " 00:00:00";
        } else if ("MONTH_BEFORE_TODAY".equalsIgnoreCase(timeType)) {
            // 本月 00:00 起至今日 00:00 前（不含当天），作为「凌晨基线」排名
            startTime = today.with(TemporalAdjusters.firstDayOfMonth()).format(FMT) + " 00:00:00";
            endTime = today.format(FMT) + " 00:00:00";
        } else {
            startTime = today.with(TemporalAdjusters.firstDayOfMonth()).format(FMT) + " 00:00:00";
        }

        try {
            return dashboardMapper.getGroupRankingByTimeAndRegion(startTime, endTime, region);
        } catch (Exception e) {
            log.error("课题组排行榜计算失败: {}", e.getMessage());
            return new ArrayList<>();
        }
    }

    /**
     * 📊 API 2 核心引擎：今日饼图与总人数 (完全委托给 Mapper)
     */
    public Map<String, Object> getTodayRoomStats() {
        String todayStart = businessTimeWindow.todayWindow().startInclusive();
        Map<String, Object> result = new HashMap<>();

        try {
            // 💥 解耦：直接调用 Mapper 提取浦东数据
            List<Map<String, Object>> pdPie = dashboardMapper.getRoomPieStats(todayStart, "浦东");
            Integer pdTotal = dashboardMapper.getDailyTotalCountByArea(todayStart, "浦东");

            // 💥 解耦：直接调用 Mapper 提取浦西数据
            List<Map<String, Object>> pxPie = dashboardMapper.getRoomPieStats(todayStart, "浦西");
            Integer pxTotal = dashboardMapper.getDailyTotalCountByArea(todayStart, "浦西");

            result.put("pudongPie", pdPie);
            result.put("pudongTotal", pdTotal != null ? pdTotal : 0);
            result.put("puxiPie", pxPie);
            result.put("puxiTotal", pxTotal != null ? pxTotal : 0);

        } catch (Exception e) {
            log.error("饼图数据计算失败: {}", e.getMessage());
        }

        return result;
    }

    /**
     * 📈 API 3 核心引擎：27 刻度进出高峰折线图 (Java 内存高速分桶)
     */
    public Map<String, Object> getTodayLineChart() {
        String todayStart = businessTimeWindow.todayWindow().startInclusive();

        // 💥 解耦：只负责从 Mapper 拿到原始数据集
        List<Map<String, Object>> records = new ArrayList<>();
        try {
            records = dashboardMapper.getTodayEntryLogs(todayStart);
        } catch (Exception e) {
            log.error("获取今日入场记录失败: {}", e.getMessage());
        }

        List<String> times = new ArrayList<>();
        int[] pdTime = new int[27];
        int[] pxTime = new int[27];

        for (int i = 0; i < 27; i++) {
            int hour = (i / 2) + 7;
            String min = (i % 2 == 0) ? "00" : "30";
            times.add(String.format("%02d:%s", hour, min));
        }

        // Java 内存高速分桶洗牌逻辑保持不变...
        for (Map<String, Object> row : records) {
            String timeStr = (String) row.get("create_time");
            String areaName = (String) row.get("area_name");

            if (timeStr != null && areaName != null && timeStr.length() >= 16) {
                try {
                    int hour = Integer.parseInt(timeStr.substring(11, 13));
                    int minute = Integer.parseInt(timeStr.substring(14, 16));

                    if (hour >= 7 && hour <= 20) {
                        int timeIndex = (hour - 7) * 2 + (minute >= 30 ? 1 : 0);
                        timeIndex = Math.min(timeIndex, 26);

                        if (areaName.contains("浦东")) {
                            pdTime[timeIndex]++;
                        } else if (areaName.contains("浦西")) {
                            pxTime[timeIndex]++;
                        }
                    }
                } catch (Exception e) {
                    log.warn("解析进入时间失败: {}", e.getMessage());
                }
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("times", times);
        result.put("pudong", pdTime);
        result.put("puxi", pxTime);

        return result;
    }

    // 🌀 保留大屏混合推流初始化方法
    public List<UniversalEvent> getLatestMixedFeed(int limit) {
        return new ArrayList<>();
    }

    // 📊 兜底旧接口
    public Map<String, Object> generateRealDashboardStats() {
        Map<String, Object> response = new HashMap<>();
        // 兼容旧接口，使用刚才新抽离的 Mapper 方法
        response.put("pudongPie", dashboardMapper.getRoomPieStats("1970-01-01 00:00:00", "浦东"));
        response.put("puxiPie", dashboardMapper.getRoomPieStats("1970-01-01 00:00:00", "浦西"));
        response.put("lineChart", getTodayLineChart());
        return response;
    }
}