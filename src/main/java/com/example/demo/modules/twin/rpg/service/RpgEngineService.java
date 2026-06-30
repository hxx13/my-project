package com.example.demo.modules.twin.rpg.service;

import com.example.demo.modules.aro.dto.RpgStatsDto;
import com.example.demo.modules.twin.rpg.mapper.RpgMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Service
public class RpgEngineService {

    private static final Logger log = LoggerFactory.getLogger(RpgEngineService.class);

    @Autowired
    private RpgDatabaseService rpgDatabaseService;

    @Autowired
    private RpgMapper rpgMapper;

    @Autowired
    private RpgExpCutoffService rpgExpCutoffService;

    @Autowired(required = false)
    private TwinExpReconcileService twinExpReconcileService;

    /**
     * 方案 A 快轨：仅从 aro_access_log 全量计算（含今日未离开挂机），不读 personnel.total_exp。
     */
    public RpgStatsDto calculateFullExpFromAccessLogs(String userId) {
        List<Map<String, Object>> logs = rpgMapper.getUserLogsForRecalc(
                userId, rpgExpCutoffService.cutoffStartForQuery());
        double totalExp = ExpSessionCalculator.calcTotalFromLogs(logs, LocalDateTime.now());
        return buildDto(totalExp);
    }

    /**
     * @deprecated 方案 A 下 historicalExp 已忽略，请使用 {@link #calculateFullExpFromAccessLogs(String)}
     */
    @Deprecated
    public RpgStatsDto calculateRealtimeExp(String userId, double historicalExp) {
        return calculateFullExpFromAccessLogs(userId);
    }

    /**
     * 动作收益预测：流水入库前估算本次打卡经验（不写 twin_exp_record）。
     */
    public PredictResult predictActionReward(String userId, int accessType) {
        if (rpgMapper.countTodayStrandedViolation(userId) > 0) {
            return new PredictResult(0, null);
        }

        List<Map<String, Object>> todayRecords = rpgDatabaseService.getTodayRecords(userId);

        if (accessType == 1) {
            boolean hasEnteredToday = todayRecords.stream().anyMatch(record ->
                    ExpSessionCalculator.isEnterAction(String.valueOf(record.get("action"))));
            if (hasEnteredToday) {
                return new PredictResult(0, null);
            }
            return new PredictResult((int) ExpSessionCalculator.DAILY_FIRST_ENTER_EXP,
                    ExpSessionCalculator.SOURCE_FIRST_ENTRY);
        }

        if (accessType == 2) {
            LocalDateTime lastEnterTime = null;

            for (Map<String, Object> record : todayRecords) {
                String action = String.valueOf(record.get("action"));
                if (ExpSessionCalculator.isEnterAction(action)) {
                    lastEnterTime = ExpSessionCalculator.parseRecordTime(record.get("create_time"));
                } else if (ExpSessionCalculator.isExitAction(action)) {
                    lastEnterTime = null;
                }
            }

            if (lastEnterTime != null) {
                LocalDateTime now = LocalDateTime.now();
                if (!lastEnterTime.toLocalDate().equals(now.toLocalDate())) {
                    return new PredictResult(0, null);
                }
                int exp = (int) ExpSessionCalculator.sessionTimeExp(lastEnterTime, now);
                return new PredictResult(exp, exp > 0 ? ExpSessionCalculator.SOURCE_TIME_BASED : null);
            }
        }
        return new PredictResult(0, null);
    }

    private RpgStatsDto buildDto(double totalExp) {
        totalExp = Math.round(totalExp * 100.0) / 100.0;
        int level = ExpSessionCalculator.levelFromTotalExp(totalExp);
        double nextLevelExp = ExpSessionCalculator.nextLevelTotalExp(level);
        return new RpgStatsDto(level, totalExp, nextLevelExp);
    }

    /**
     * @deprecated 新代码请直接调用 {@link TwinExpReconcileService#reconcileAllHistorical()}
     */
    @Deprecated
    public String recalculateAllHistoricalExp() {
        if (twinExpReconcileService != null) {
            Map<String, Object> result = twinExpReconcileService.reconcileAllHistorical();
            return "✅ 历史经验追溯完毕！" + result.getOrDefault("message", "");
        }
        log.warn("[RPG 引擎] TwinExpReconcileService 未注入，跳过重算");
        return "⚠️ 重算服务不可用";
    }

    /**
     * @deprecated 旧版「每次进入 +10」逻辑，已废弃。请使用 {@link TwinExpReconcileService#reconcileAllHistorical()}
     */
    @Deprecated
    public Map<String, Object> recalculateAllExp() {
        Map<String, Object> response = new java.util.HashMap<>();
        response.put("code", 410);
        response.put("msg", "接口已废弃，请使用 GET /api/v1/twin/rpg/recalculate-all 进行全员经验重算");
        return response;
    }
}
