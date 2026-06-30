package com.example.demo.modules.twin.rpg.service;

import com.example.demo.modules.twin.rpg.entity.TwinExpRecord;
import com.example.demo.modules.twin.rpg.mapper.RpgMapper;
import com.example.demo.modules.twin.rpg.mapper.TwinExpRecordMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 经验值对账引擎 —— 以 aro_access_log 为唯一数据源，逐日配对进出记录并写入 twin_exp_record。
 *
 * <p>实时扫码产生的 XP 记录 source_type = TIME_BASED / FIRST_ENTRY；
 * 本服务（定时/手动触发）写入的记录 source_type = TIME_BASED_SYNC / FIRST_ENTRY_SYNC，
 * 便于在统计页区分数据来源。</p>
 *
 * <p>异常标记（anomaly_types 逗号分隔）：</p>
 * <ul>
 *   <li>OVER_CAP —— 单次会话超过 480 分钟上限</li>
 *   <li>CROSS_DAY —— 进入和离开不在同一天，整条跳过</li>
 *   <li>NIGHT_HOURS —— 进入或离开时间在 22:00-06:00 夜间时段</li>
 * </ul>
 */
@Service
public class TwinExpReconcileService {

    private static final Logger log = LoggerFactory.getLogger(TwinExpReconcileService.class);

    private static final double DAILY_FIRST_ENTER_EXP = 50.0;
    private static final double EXP_PER_MINUTE = 1.0;
    private static final int MAX_SESSION_MINUTES = 480; // 8 小时上限
    private static final LocalTime NIGHT_START = LocalTime.of(22, 0);
    private static final LocalTime NIGHT_END = LocalTime.of(6, 0);

    /** 定时对账使用的 source_type 后缀标记 */
    static final String SYNC_SUFFIX = "_SYNC";
    static final String SOURCE_FIRST_ENTRY = "FIRST_ENTRY";
    static final String SOURCE_TIME_BASED = "TIME_BASED";
    static final String SOURCE_FIRST_ENTRY_SYNC = SOURCE_FIRST_ENTRY + SYNC_SUFFIX;
    static final String SOURCE_TIME_BASED_SYNC = SOURCE_TIME_BASED + SYNC_SUFFIX;

    static final String ANOMALY_OVER_CAP = "OVER_CAP";
    static final String ANOMALY_CROSS_DAY = "CROSS_DAY";
    static final String ANOMALY_NIGHT_HOURS = "NIGHT_HOURS";

    @Autowired
    private RpgMapper rpgMapper;

    @Autowired
    private TwinExpRecordMapper twinExpRecordMapper;

    // ──────────────────────────────────────────────
    // 公共入口
    // ──────────────────────────────────────────────

    /**
     * 对账单日全部用户的经验值。
     *
     * @return 摘要 Map，包含 usersProcessed / recordsCreated / recordsSkippedCrossDay /
     *         anomaliesFlagged / firstEntryRecords / totalExpAwarded
     */
    public Map<String, Object> reconcileDate(LocalDate date) {
        String dateStart = date.toString() + " 00:00:00";
        String dateEnd = date.plusDays(1).toString() + " 00:00:00";

        List<String> userIds = rpgMapper.getDistinctUserIdsByDate(dateStart, dateEnd);
        log.info("[XP对账] 日期={} 有流水用户数={}", date, userIds.size());

        int usersProcessed = 0;
        int recordsCreated = 0;
        int recordsSkippedCrossDay = 0;
        int anomaliesFlagged = 0;
        int firstEntryRecords = 0;
        long totalExpAwarded = 0;

        for (String userId : userIds) {
            try {
                ReconcileResult result = reconcileUserForDate(userId, date, dateStart, dateEnd, true);
                usersProcessed++;
                recordsCreated += result.recordsCreated;
                recordsSkippedCrossDay += result.skippedCrossDay;
                anomaliesFlagged += result.anomaliesFlagged;
                firstEntryRecords += result.firstEntryRecords;
                totalExpAwarded += result.totalExpAwarded;
            } catch (Exception e) {
                log.error("[XP对账] 用户 {} 对账失败: {}", userId, e.getMessage(), e);
            }
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("date", date.toString());
        summary.put("usersProcessed", usersProcessed);
        summary.put("recordsCreated", recordsCreated);
        summary.put("recordsSkippedCrossDay", recordsSkippedCrossDay);
        summary.put("anomaliesFlagged", anomaliesFlagged);
        summary.put("firstEntryRecords", firstEntryRecords);
        summary.put("totalExpAwarded", totalExpAwarded);
        log.info("[XP对账] 日期={} 完成: {}", date, summary);
        return summary;
    }

    /**
     * 全量历史重算：逐日对账所有历史日期，写入 twin_exp_record 并更新 aro_personnel。
     * 供「重算全员经验」按钮 / JOB_RPG_RECALC 调用。
     */
    public Map<String, Object> reconcileAllHistorical() {
        // 找到有记录的全部日期范围
        List<String> dates = rpgMapper.getDistinctAccessLogDates();
        log.info("[XP对账] 全量历史重算 日期数={}", dates.size());

        int totalRecords = 0;
        int totalAnomalies = 0;
        int totalSkipped = 0;
        int usersProcessed = 0;

        for (String dateStr : dates) {
            try {
                LocalDate date = LocalDate.parse(dateStr);
                Map<String, Object> dayResult = reconcileDate(date);
                totalRecords += intVal(dayResult, "recordsCreated");
                totalAnomalies += intVal(dayResult, "anomaliesFlagged");
                totalSkipped += intVal(dayResult, "recordsSkippedCrossDay");
                usersProcessed = Math.max(usersProcessed, intVal(dayResult, "usersProcessed"));
            } catch (Exception e) {
                log.error("[XP对账] 日期 {} 重算失败: {}", dateStr, e.getMessage(), e);
            }
        }

        // 最终用 twin_exp_record 汇总覆盖全员 personnel.total_exp
        List<String> userIds = rpgMapper.getDistinctAccessLogUserIds();
        for (String userId : userIds) {
            try {
                long total = recalcPersonnelTotalFromExpRecords(userId);
                rpgMapper.updatePersonnelTotalExp(userId, total);
            } catch (Exception e) {
                log.error("[XP对账] 更新 personnel 失败 userId={}: {}", userId, e.getMessage());
            }
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("datesProcessed", dates.size());
        summary.put("totalRecordsCreated", totalRecords);
        summary.put("totalAnomaliesFlagged", totalAnomalies);
        summary.put("totalCrossDaySkipped", totalSkipped);
        summary.put("usersUpdated", userIds.size());
        summary.put("message", "全量历史重算完成：" + dates.size() + " 天，写入 " + totalRecords + " 条记录，更新 " + userIds.size() + " 人");
        log.info("[XP对账] 全量历史完成: {}", summary);
        return summary;
    }

    private int intVal(Map<String, Object> map, String key) {
        Object v = map.get(key);
        if (v instanceof Number n) return n.intValue();
        return 0;
    }

    // ──────────────────────────────────────────────
    // 单用户单日对账
    // ──────────────────────────────────────────────

    /**
     * @param updatePersonnel 是否同步更新 aro_personnel.total_exp（定时对账=true，实时路径=false）
     */
    ReconcileResult reconcileUserForDate(String userId, LocalDate date,
                                          String dateStart, String dateEnd,
                                          boolean updatePersonnel) {
        List<Map<String, Object>> logs = rpgMapper.getUserLogsForDate(userId, dateStart, dateEnd);
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

        boolean dailyFirstBlood = false;
        LocalDateTime currentEnterTime = null;
        String currentEnterRoomId = null;
        String currentEnterRoomName = null;
        String currentEnterFeedSource = null;

        int recordsCreated = 0;
        int skippedCrossDay = 0;
        int anomaliesFlagged = 0;
        int firstEntryRecords = 0;
        long totalExpAwarded = 0;

        double userTotalToday = 0;

        for (Map<String, Object> log : logs) {
            String action = String.valueOf(log.get("action"));
            boolean isEnter = "1".equals(action);
            boolean isExit = "2".equals(action);

            LocalDateTime recordTime = parseRecordTime(log.get("create_time"), fmt);
            if (recordTime == null) continue;

            if (isEnter) {
                // 每日首次进入
                if (!dailyFirstBlood) {
                    userTotalToday += DAILY_FIRST_ENTER_EXP;
                    dailyFirstBlood = true;

                    TwinExpRecord firstEntryRec = buildExpRecord(userId, log, (int) DAILY_FIRST_ENTER_EXP,
                            SOURCE_FIRST_ENTRY_SYNC, 1, null);
                    twinExpRecordMapper.insert(firstEntryRec);
                    recordsCreated++;
                    firstEntryRecords++;
                    totalExpAwarded += (int) DAILY_FIRST_ENTER_EXP;
                }
                currentEnterTime = recordTime;
                currentEnterRoomId = str(log.get("room_id"));
                currentEnterRoomName = str(log.get("room_name"));
                currentEnterFeedSource = str(log.get("feed_source"));
            } else if (isExit && currentEnterTime != null) {
                // 完成一个进出对
                SessionEval eval = evaluateSession(currentEnterTime, recordTime, date);
                if (eval.skipCrossDay) {
                    skippedCrossDay++;
                    currentEnterTime = null;
                    continue;
                }

                int expAmount = eval.cappedMinutes; // 1 XP/min
                userTotalToday += expAmount;

                TwinExpRecord rec = buildExpRecord(userId, log, expAmount,
                        SOURCE_TIME_BASED_SYNC, 2, eval.anomalyTypes);
                rec.setRoomId(currentEnterRoomId);
                rec.setRoomName(currentEnterRoomName);
                rec.setSessionDurationMinutes(eval.actualMinutes);
                if (currentEnterFeedSource != null && !currentEnterFeedSource.isBlank()) {
                    rec.setFeedSource(currentEnterFeedSource);
                }

                twinExpRecordMapper.insert(rec);
                recordsCreated++;
                totalExpAwarded += expAmount;
                if (eval.hasAnomaly()) anomaliesFlagged++;

                currentEnterTime = null;
            }
            // 无当前 ENTER 时的孤立 EXIT 直接忽略
        }
        // 当日结束仍有未关闭 ENTER → 忽略（无合法离开对）

        if (updatePersonnel) {
            // 重新汇总该用户全部历史 twin_exp_record（含本次新写的）写入 personnel
            long totalFromRecords = recalcPersonnelTotalFromExpRecords(userId);
            rpgMapper.updatePersonnelTotalExp(userId, totalFromRecords);
        }

        return new ReconcileResult(recordsCreated, skippedCrossDay, anomaliesFlagged, firstEntryRecords, totalExpAwarded);
    }

    // ──────────────────────────────────────────────
    // 会话评估
    // ──────────────────────────────────────────────

    static class SessionEval {
        int actualMinutes;
        int cappedMinutes;
        boolean skipCrossDay;
        List<String> anomalyTypes = new ArrayList<>();

        boolean hasAnomaly() { return !anomalyTypes.isEmpty(); }
    }

    SessionEval evaluateSession(LocalDateTime enterTime, LocalDateTime exitTime, LocalDate targetDate) {
        SessionEval eval = new SessionEval();

        // 跨天检查 —— enter 和 exit 必须同一天
        if (!enterTime.toLocalDate().equals(exitTime.toLocalDate())) {
            eval.skipCrossDay = true;
            eval.anomalyTypes.add(ANOMALY_CROSS_DAY);
            return eval;
        }
        // 进入日期不是目标日期 → 跳过（防止跨天回补）
        if (!enterTime.toLocalDate().equals(targetDate)) {
            eval.skipCrossDay = true;
            return eval;
        }

        long minutes = Duration.between(enterTime, exitTime).toMinutes();
        eval.actualMinutes = (int) Math.max(0, minutes);
        eval.cappedMinutes = Math.min(eval.actualMinutes, MAX_SESSION_MINUTES);

        if (eval.actualMinutes > MAX_SESSION_MINUTES) {
            eval.anomalyTypes.add(ANOMALY_OVER_CAP);
        }

        // 夜间时段检测
        if (isNightTime(enterTime.toLocalTime()) || isNightTime(exitTime.toLocalTime())) {
            eval.anomalyTypes.add(ANOMALY_NIGHT_HOURS);
        }

        return eval;
    }

    private boolean isNightTime(LocalTime t) {
        return !t.isBefore(NIGHT_START) || !t.isAfter(NIGHT_END);
    }

    // ──────────────────────────────────────────────
    // 全量历史重算逻辑（从 RpgEngineService 平移并修正）
    // ──────────────────────────────────────────────

    double recalcUserTotalFromLogs(List<Map<String, Object>> logs) {
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        double totalExp = 0;
        String lastDate = "";
        boolean dailyFirstBlood = false;
        LocalDateTime currentEnterTime = null;

        for (Map<String, Object> log : logs) {
            LocalDateTime t = parseRecordTime(log.get("create_time"), fmt);
            if (t == null) continue;

            String dateKey = t.toLocalDate().toString();
            if (!dateKey.equals(lastDate)) {
                lastDate = dateKey;
                dailyFirstBlood = false;
                currentEnterTime = null;
            }

            String action = String.valueOf(log.get("action"));
            if ("1".equals(action)) {
                if (!dailyFirstBlood) {
                    totalExp += DAILY_FIRST_ENTER_EXP;
                    dailyFirstBlood = true;
                }
                currentEnterTime = t;
            } else if ("2".equals(action) && currentEnterTime != null) {
                if (currentEnterTime.toLocalDate().equals(t.toLocalDate())) {
                    long minutes = Duration.between(currentEnterTime, t).toMinutes();
                    minutes = Math.min(Math.max(0, minutes), MAX_SESSION_MINUTES);
                    totalExp += minutes * EXP_PER_MINUTE;
                }
                currentEnterTime = null;
            }
        }
        return totalExp;
    }

    /**
     * 从 twin_exp_record 汇总单个用户总经验（仅计算 review_status != 2 即未驳回的记录）。
     */
    private long recalcPersonnelTotalFromExpRecords(String userId) {
        Long sum = twinExpRecordMapper.sumExpByUserIdExcludeRejected(userId);
        return sum != null ? sum : 0L;
    }

    // ──────────────────────────────────────────────
    // 工具方法
    // ──────────────────────────────────────────────

    private TwinExpRecord buildExpRecord(String userId, Map<String, Object> log,
                                          int expAmount, String sourceType, int accessType,
                                          List<String> anomalyTypes) {
        TwinExpRecord rec = new TwinExpRecord();
        rec.setUserId(userId);
        rec.setUserName(str(log.get("person_name")));
        rec.setExpAmount(expAmount);
        rec.setSourceType(sourceType);
        rec.setAccessType(accessType);
        rec.setRoomId(str(log.get("room_id")));
        rec.setRoomName(str(log.get("room_name")));
        rec.setFeedSource(str(log.get("feed_source")));
        rec.setCreateTime(LocalDateTime.now());
        if (anomalyTypes != null && !anomalyTypes.isEmpty()) {
            rec.setAnomalyFlag(1);
            rec.setAnomalyTypes(String.join(",", anomalyTypes));
            rec.setReviewStatus(0); // 异常记录待审核
        } else {
            rec.setAnomalyFlag(0);
            rec.setReviewStatus(1); // 正常记录默认已批准
        }
        rec.setSessionDurationMinutes(null);
        return rec;
    }

    private LocalDateTime parseRecordTime(Object obj, DateTimeFormatter fmt) {
        if (obj == null) return null;
        try {
            String s = obj.toString().trim();
            if (s.length() > 19) s = s.substring(0, 19);
            else if (s.length() == 16) s += ":00";
            return LocalDateTime.parse(s, fmt);
        } catch (Exception e) {
            return null;
        }
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o).trim();
    }

    // ──────────────────────────────────────────────
    // 结果载体
    // ──────────────────────────────────────────────

    static class ReconcileResult {
        final int recordsCreated;
        final int skippedCrossDay;
        final int anomaliesFlagged;
        final int firstEntryRecords;
        final long totalExpAwarded;

        ReconcileResult(int recordsCreated, int skippedCrossDay, int anomaliesFlagged,
                        int firstEntryRecords, long totalExpAwarded) {
            this.recordsCreated = recordsCreated;
            this.skippedCrossDay = skippedCrossDay;
            this.anomaliesFlagged = anomaliesFlagged;
            this.firstEntryRecords = firstEntryRecords;
            this.totalExpAwarded = totalExpAwarded;
        }
    }
}
