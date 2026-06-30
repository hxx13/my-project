package com.example.demo.modules.twin.rpg.service;

import com.example.demo.modules.aro.dto.RpgStatsDto;
import com.example.demo.modules.twin.rpg.mapper.RpgMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private static final Logger log = LoggerFactory.getLogger(RpgEngineService.class);

    @Autowired
    private RpgDatabaseService rpgDatabaseService;

    // 💥 换装新数值体系：首签 50，每分钟 1 点经验，单次最高 8 小时
    private static final double DAILY_FIRST_ENTER_EXP = 50.0;
    private static final double EXP_PER_MINUTE = 1.0;
    private static final int MAX_SESSION_MINUTES = 480; // 8 小时上限

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
            boolean isEnter = "1".equals(action);
            boolean isExit = "2".equals(action);

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
                // 所有 aro_access_log 中的离开记录均计入时长结算
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
     * 💥 核心防挂机时间算法：单次停留最高计算 8 小时 (480分钟)，严禁跨天
     */
    private double calculateTimeExp(LocalDateTime enter, LocalDateTime exit) {
        // 跨天检查 —— 进入和离开必须在同一天
        if (!enter.toLocalDate().equals(exit.toLocalDate())) {
            return 0;
        }
        long minutes = Duration.between(enter, exit).toMinutes();
        minutes = Math.min(minutes, MAX_SESSION_MINUTES);
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

    @Autowired(required = false)
    private TwinExpReconcileService twinExpReconcileService;

    /**
     * 🛡️ 慢轨重算引擎：委托给 TwinExpReconcileService 执行全量历史对账。
     *
     * @deprecated 新代码请直接调用 {@link TwinExpReconcileService#reconcileAllHistorical()}
     */
    @Deprecated
    public String recalculateAllHistoricalExp() {
        if (twinExpReconcileService != null) {
            Map<String, Object> result = twinExpReconcileService.reconcileAllHistorical();
            return "✅ 历史经验追溯完毕！" + result.getOrDefault("message", "");
        }
        // 降级：旧逻辑
        log.info("[RPG 引擎] 降级使用旧版重算逻辑...");
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

                String currentDate = recordTime.toLocalDate().toString();
                if (!currentDate.equals(lastProcessedDate)) {
                    lastProcessedDate = currentDate;
                    dailyFirstBlood = false;
                    currentEnterTime = null;
                }

                String action = String.valueOf(log.get("action"));
                boolean isEnter = "1".equals(action);
                boolean isExit = "2".equals(action);

                if (isEnter) {
                    if (!dailyFirstBlood) {
                        userTotalExp += DAILY_FIRST_ENTER_EXP;
                        dailyFirstBlood = true;
                    }
                    currentEnterTime = recordTime;
                } else if (isExit && currentEnterTime != null) {
                    // 所有 aro_access_log 的离开记录均计入时长结算
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
    public PredictResult predictActionReward(String userId, int accessType) {
        // 拿到截至此刻的今日本地流水（含自动签退记录，用于正确关闭 ENTER 会话）
        List<Map<String, Object>> todayRecords = rpgDatabaseService.getTodayRecords(userId);

        if (accessType == 1) {
            // 🟢 尝试进入：检查今天之前有没有进入过？
            boolean hasEnteredToday = todayRecords.stream().anyMatch(record -> {
                String action = String.valueOf(record.get("action"));
                return "1".equals(action);
            });
            if (hasEnteredToday) {
                return new PredictResult(0, null);
            }
            return new PredictResult((int) DAILY_FIRST_ENTER_EXP, "FIRST_ENTRY");
        }
        else if (accessType == 2) {
            // 🔴 尝试离开：计算这次在里面呆了多久？
            // 自动签退的离开记录会正确关闭 ENTER 会话，但不计入时长结算
            LocalDateTime lastEnterTime = null;
            DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

            for (Map<String, Object> record : todayRecords) {
                String action = String.valueOf(record.get("action"));
                if ("1".equals(action)) {
                    Object timeObj = record.get("create_time");
                    if (timeObj != null) {
                        try {
                            String timeStr = timeObj.toString();
                            if (timeStr.length() > 19) timeStr = timeStr.substring(0, 19);
                            else if (timeStr.length() == 16) timeStr += ":00";
                            lastEnterTime = LocalDateTime.parse(timeStr, formatter);
                        } catch (Exception e) {
                            log.warn("解析lastEnterTime失败: {}", e.getMessage());
                        }
                    }
                } else if ("2".equals(action)) {
                    // 自动签退：关闭会话但不计 XP（已在 calculateRealtimeExp 中同样处理）
                    // 非自动签退的正常离开：正常关闭会话
                    lastEnterTime = null; // 中间有离开过，上一段作废
                }
            }

            if (lastEnterTime != null) {
                LocalDateTime now = LocalDateTime.now();
                // 跨天检查 —— 上次进入和当前必须在同一天
                if (!lastEnterTime.toLocalDate().equals(now.toLocalDate())) {
                    return new PredictResult(0, null);
                }
                // 💥 核心算法：算出从上次进入到现在的时长！
                long minutes = Duration.between(lastEnterTime, now).toMinutes();
                minutes = Math.min(minutes, MAX_SESSION_MINUTES);
                int exp = (int) (Math.max(0, minutes) * EXP_PER_MINUTE);
                return new PredictResult(exp, exp > 0 ? "TIME_BASED" : null);
            }
        }
        return new PredictResult(0, null); // 异常情况保底给 0
    }


    /**
     * 💥 极速快轨重算引擎：直接基于 SQL 聚合重算全服经验 (从 Controller 平移下来的逻辑)
     */
    public Map<String, Object> recalculateAllExp() {
        Map<String, Object> response = new java.util.HashMap<>();
        try {
            log.info("[RPG 系统] 开始全量重算人员经验值...");

            // 核心逻辑：
            // 假设每一次有效的进入 (accessType = 1) 给 10 点经验值
            // 这段 SQL 会把 access_log 里的打卡次数统计出来，直接 UPDATE 到 personnel 表里！
            int updatedRows = rpgMapper.recalculateAllExpByEntryCount();

            log.info("[RPG 系统] 重算完成！受影响的人员数量: {}", updatedRows);
            response.put("code", 200);
            response.put("msg", "全量经验重算完毕！共更新 " + updatedRows + " 条人员档案。");
        } catch (Exception e) {
            response.put("code", 500);
            response.put("msg", "重算失败: " + e.getMessage());
        }
        return response;
    }
}