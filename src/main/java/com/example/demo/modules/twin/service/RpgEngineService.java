package com.example.demo.modules.twin.service;

import com.example.demo.modules.aro.dto.RpgStatsDto;
import com.example.demo.modules.twin.mapper.RpgMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

@Service
public class RpgEngineService {

    @Autowired
    private RpgDatabaseService rpgDatabaseService;

    // 💥 换装新数值体系：首签 50，每分钟 1 点经验
    private static final double DAILY_FIRST_ENTER_EXP = 50.0;
    private static final double EXP_PER_MINUTE = 1.0;

    /**
     * ⚡ 快轨引擎：提供给前端的实时查询接口 (只算不存，绝对实时)
     */
    public RpgStatsDto calculateRealtimeExp(String userId, double historicalExp) {
        List<Map<String, Object>> todayRecords = rpgDatabaseService.getTodayRecords(userId);

        double todayExp = 0.0;
        boolean hasDailyFirstBlood = false;
        LocalDateTime currentEnterTime = null;

        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

        for (Map<String, Object> record : todayRecords) {
            String action = String.valueOf(record.get("action"));
            boolean isEnter = "ENTER".equalsIgnoreCase(action) || "1".equals(action) || "进入".equals(action);
            boolean isExit = "EXIT".equalsIgnoreCase(action) || "2".equals(action) || "离开".equals(action);

            Object createTimeObj = record.get("create_time");
            if (createTimeObj == null) continue;

            LocalDateTime recordTime = null;

            try {
                if (createTimeObj instanceof LocalDateTime) {
                    recordTime = (LocalDateTime) createTimeObj;
                } else if (createTimeObj instanceof Timestamp) {
                    recordTime = ((Timestamp) createTimeObj).toLocalDateTime();
                } else {
                    String timeStr = createTimeObj.toString();
                    if (timeStr.length() > 19) timeStr = timeStr.substring(0, 19);
                    else if (timeStr.length() == 16) timeStr += ":00";
                    recordTime = LocalDateTime.parse(timeStr, formatter);
                }
            } catch (Exception e) {
                continue;
            }

            if (isEnter) {
                if (!hasDailyFirstBlood) {
                    todayExp += DAILY_FIRST_ENTER_EXP;
                    hasDailyFirstBlood = true;
                }
                currentEnterTime = recordTime;
            }
            else if (isExit && currentEnterTime != null) {
                // 💥 移除死板的 17:30 cutoff，采用时长结算
                todayExp += calculateTimeExp(currentEnterTime, recordTime);
                currentEnterTime = null;
            }
        }

        // 如果仍在实验室未离开，按当前时间实时结算挂机经验！
        if (currentEnterTime != null) {
            todayExp += calculateTimeExp(currentEnterTime, LocalDateTime.now());
        }

        double realTotalExp = historicalExp + todayExp;
        return buildDto(realTotalExp);
    }

    /**
     * 💥 核心防挂机时间算法
     */
    private double calculateTimeExp(LocalDateTime enter, LocalDateTime exit) {
        long minutes = Duration.between(enter, exit).toMinutes();
        // 💥 防挂机机制：单次停留最高计算 12 小时 (720分钟)
        minutes = Math.min(minutes, 720);
        return Math.max(0, minutes) * EXP_PER_MINUTE;
    }

    /**
     * 💥 核心等级曲线打包机：平滑指数衰减模型
     */
    private RpgStatsDto buildDto(double totalExp) {
        totalExp = Math.round(totalExp * 100.0) / 100.0;
        // 💥 新升级公式: Level = floor( sqrt(EXP / 50) ) + 1
        int level = (int) Math.floor(Math.sqrt(totalExp / 50.0)) + 1;
        // 💥 距离下一级所需总经验 = Level^2 * 50
        double nextLevelExp = Math.pow(level, 2) * 50.0;

        return new RpgStatsDto(level, totalExp, nextLevelExp);
    }

    @Autowired
    private RpgMapper rpgMapper;

    /**
     * 🛡️ 慢轨重算引擎：一键触发，用新规则洗刷过去所有的历史数据！
     */
    public String recalculateAllHistoricalExp() {
        System.out.println("⏳ [RPG 引擎] 开始执行新版规则的历史数据大结算...");

        List<String> userIds = rpgMapper.getDistinctAccessLogUserIds();
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        int updatedCount = 0;

        for (String userId : userIds) {
            List<Map<String, Object>> logs = rpgMapper.getUserLogsForRecalc(userId);

            double userTotalExp = 0.0;
            String lastProcessedDate = "";
            boolean dailyFirstBlood = false;
            LocalDateTime currentEnterTime = null;

            for (Map<String, Object> log : logs) {
                Object createTimeObj = log.get("create_time");
                if (createTimeObj == null) continue;

                String timeStr = createTimeObj.toString();
                if (timeStr.length() > 19) timeStr = timeStr.substring(0, 19);
                else if (timeStr.length() == 16) timeStr += ":00";

                LocalDateTime recordTime;
                try { recordTime = LocalDateTime.parse(timeStr, formatter); }
                catch (Exception e) { continue; }

                String currentDate = recordTime.toLocalDate().toString();
                if (!currentDate.equals(lastProcessedDate)) {
                    lastProcessedDate = currentDate;
                    dailyFirstBlood = false;
                    currentEnterTime = null;
                }

                String action = String.valueOf(log.get("action"));
                boolean isEnter = "1".equals(action) || "ENTER".equalsIgnoreCase(action);
                boolean isExit = "2".equals(action) || "EXIT".equalsIgnoreCase(action);

                if (isEnter) {
                    if (!dailyFirstBlood) {
                        userTotalExp += DAILY_FIRST_ENTER_EXP;
                        dailyFirstBlood = true;
                    }
                    currentEnterTime = recordTime;
                } else if (isExit && currentEnterTime != null) {
                    // 💥 调用新的时间结算规则 (含 12 小时防挂机)
                    userTotalExp += calculateTimeExp(currentEnterTime, recordTime);
                    currentEnterTime = null;
                }
            }

            rpgMapper.updatePersonnelTotalExp(userId, Math.round(userTotalExp));
            updatedCount++;
        }
        return "✅ 历史经验追溯完毕！采用全新算法，共为 " + updatedCount + " 名人员结算了真实的 RPG 经验值！";
    }

    /**
     * 🔮 动作收益预测引擎：在流水尚未入库前，精准计算本次打卡将获得的经验值！
     */
    public int predictActionReward(String userId, int accessType) {
        // 拿到截至此刻的今日本地流水
        List<Map<String, Object>> todayRecords = rpgDatabaseService.getTodayRecords(userId);

        if (accessType == 1) {
            // 🟢 尝试进入：检查今天之前有没有进入过？
            boolean hasEnteredToday = todayRecords.stream().anyMatch(record -> {
                String action = String.valueOf(record.get("action"));
                return "1".equals(action) || "ENTER".equalsIgnoreCase(action);
            });
            // 💥 核心算法：如果今天没进过，首签拿 50 点；进过了，不给进门分（给 0 点，走时长结算）
            return hasEnteredToday ? 0 : (int) DAILY_FIRST_ENTER_EXP;
        }
        else if (accessType == 2) {
            // 🔴 尝试离开：计算这次在里面呆了多久？
            LocalDateTime lastEnterTime = null;
            DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

            for (Map<String, Object> record : todayRecords) {
                String action = String.valueOf(record.get("action"));
                if ("1".equals(action) || "ENTER".equalsIgnoreCase(action)) {
                    Object timeObj = record.get("create_time");
                    if (timeObj != null) {
                        try {
                            String timeStr = timeObj.toString();
                            if (timeStr.length() > 19) timeStr = timeStr.substring(0, 19);
                            else if (timeStr.length() == 16) timeStr += ":00";
                            lastEnterTime = LocalDateTime.parse(timeStr, formatter);
                        } catch (Exception e) {}
                    }
                } else if ("2".equals(action) || "EXIT".equalsIgnoreCase(action)) {
                    lastEnterTime = null; // 中间有离开过，上一段作废
                }
            }

            if (lastEnterTime != null) {
                // 💥 核心算法：算出从上次进入到现在的时长！
                long minutes = Duration.between(lastEnterTime, LocalDateTime.now()).toMinutes();
                minutes = Math.min(minutes, 720); // 防挂机机制：封顶 12 小时
                return (int) (Math.max(0, minutes) * EXP_PER_MINUTE);
            }
        }
        return 0; // 异常情况保底给 0
    }


    /**
     * 💥 极速快轨重算引擎：直接基于 SQL 聚合重算全服经验 (从 Controller 平移下来的逻辑)
     */
    public Map<String, Object> recalculateAllExp() {
        Map<String, Object> response = new java.util.HashMap<>();
        try {
            System.out.println("⏳ [RPG 系统] 开始全量重算人员经验值...");

            // 核心逻辑：
            // 假设每一次有效的进入 (accessType = 1) 给 10 点经验值
            // 这段 SQL 会把 access_log 里的打卡次数统计出来，直接 UPDATE 到 personnel 表里！
            int updatedRows = rpgMapper.recalculateAllExpByEntryCount();

            System.out.println("✅ [RPG 系统] 重算完成！受影响的人员数量: " + updatedRows);
            response.put("code", 200);
            response.put("msg", "全量经验重算完毕！共更新 " + updatedRows + " 条人员档案。");
        } catch (Exception e) {
            response.put("code", 500);
            response.put("msg", "重算失败: " + e.getMessage());
        }
        return response;
    }
}