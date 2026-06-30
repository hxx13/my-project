package com.example.demo.modules.twin.rpg.service;

import com.example.demo.modules.twin.rpg.entity.TwinExpRecord;
import com.example.demo.modules.twin.rpg.mapper.RpgMapper;
import com.example.demo.modules.twin.rpg.mapper.TwinExpRecordMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 经验值慢轨对账 —— 以 aro_access_log 为唯一数据源，写入 twin_exp_record 并同步 aro_personnel。
 * 方案 A：扫码不写流水，仅本服务（定时/手动重算）写入权威数据。
 */
@Service
public class TwinExpReconcileService {

    private static final Logger log = LoggerFactory.getLogger(TwinExpReconcileService.class);

    @Autowired
    private RpgMapper rpgMapper;

    @Autowired
    private TwinExpRecordMapper twinExpRecordMapper;

    @Autowired
    private RpgExpCutoffService rpgExpCutoffService;

    /**
     * 对账单日全部用户的经验值（幂等：先删该日流水再重建）。
     */
    public Map<String, Object> reconcileDate(LocalDate date) {
        if (!rpgExpCutoffService.isOnOrAfterCutoff(date)) {
            Map<String, Object> skipped = new LinkedHashMap<>();
            skipped.put("date", date.toString());
            skipped.put("skipped", true);
            skipped.put("reason", "before exp cutoff " + rpgExpCutoffService.cutoffDate());
            return skipped;
        }

        twinExpRecordMapper.deleteByEventDate(date.toString());

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
     * 全量历史重算：清空流水 → 逐日对账 → 汇总更新 aro_personnel。
     */
    public Map<String, Object> reconcileAllHistorical() {
        log.info("[XP对账] 全量历史重算：清空 twin_exp_record 并重置 personnel.total_exp");
        twinExpRecordMapper.deleteAll();
        rpgMapper.resetAllPersonnelTotalExp();

        List<String> dates = rpgMapper.getDistinctAccessLogDates(rpgExpCutoffService.cutoffStartForQuery());
        log.info("[XP对账] 全量历史重算 日期数={}", dates.size());

        int totalRecords = 0;
        int totalAnomalies = 0;
        int totalSkipped = 0;

        for (String dateStr : dates) {
            try {
                LocalDate date = LocalDate.parse(dateStr);
                Map<String, Object> dayResult = reconcileDate(date);
                totalRecords += intVal(dayResult, "recordsCreated");
                totalAnomalies += intVal(dayResult, "anomaliesFlagged");
                totalSkipped += intVal(dayResult, "recordsSkippedCrossDay");
            } catch (Exception e) {
                log.error("[XP对账] 日期 {} 重算失败: {}", dateStr, e.getMessage(), e);
            }
        }

        List<String> userIds = rpgMapper.getDistinctAccessLogUserIds(rpgExpCutoffService.cutoffStartForQuery());
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
        if (v instanceof Number n) {
            return n.intValue();
        }
        return 0;
    }

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

        for (Map<String, Object> logRow : logs) {
            String action = String.valueOf(logRow.get("action"));
            boolean isEnter = ExpSessionCalculator.isEnterAction(action);
            boolean isExit = ExpSessionCalculator.isExitAction(action);

            LocalDateTime recordTime = ExpSessionCalculator.parseRecordTime(logRow.get("create_time"), fmt);
            if (recordTime == null) {
                continue;
            }

            if (isEnter) {
                if (!dailyFirstBlood) {
                    dailyFirstBlood = true;

                    TwinExpRecord firstEntryRec = buildExpRecord(userId, logRow,
                            (int) ExpSessionCalculator.DAILY_FIRST_ENTER_EXP,
                            ExpSessionCalculator.SOURCE_FIRST_ENTRY, 1, null, recordTime);
                    twinExpRecordMapper.insert(firstEntryRec);
                    recordsCreated++;
                    firstEntryRecords++;
                    totalExpAwarded += (int) ExpSessionCalculator.DAILY_FIRST_ENTER_EXP;
                }
                currentEnterTime = recordTime;
                currentEnterRoomId = ExpSessionCalculator.str(logRow.get("room_id"));
                currentEnterRoomName = ExpSessionCalculator.str(logRow.get("room_name"));
                currentEnterFeedSource = ExpSessionCalculator.str(logRow.get("feed_source"));
            } else if (isExit && currentEnterTime != null) {
                if (ExpSessionCalculator.isAutoSignoutExit(logRow, action)) {
                    currentEnterTime = null;
                    continue;
                }

                ExpSessionCalculator.SessionEval eval =
                        ExpSessionCalculator.evaluateSession(currentEnterTime, recordTime, date);
                if (eval.skipCrossDay) {
                    skippedCrossDay++;
                    currentEnterTime = null;
                    continue;
                }

                int expAmount = eval.cappedMinutes;

                TwinExpRecord rec = buildExpRecord(userId, logRow, expAmount,
                        ExpSessionCalculator.SOURCE_TIME_BASED, 2, eval.anomalyTypes, recordTime);
                rec.setRoomId(currentEnterRoomId);
                rec.setRoomName(currentEnterRoomName);
                rec.setSessionDurationMinutes(eval.actualMinutes);
                if (currentEnterFeedSource != null && !currentEnterFeedSource.isBlank()) {
                    rec.setFeedSource(currentEnterFeedSource);
                }

                twinExpRecordMapper.insert(rec);
                recordsCreated++;
                totalExpAwarded += expAmount;
                if (eval.hasAnomaly()) {
                    anomaliesFlagged++;
                }

                currentEnterTime = null;
            }
        }

        if (updatePersonnel) {
            long totalFromRecords = recalcPersonnelTotalFromExpRecords(userId);
            rpgMapper.updatePersonnelTotalExp(userId, totalFromRecords);
        }

        return new ReconcileResult(recordsCreated, skippedCrossDay, anomaliesFlagged, firstEntryRecords, totalExpAwarded);
    }

    private long recalcPersonnelTotalFromExpRecords(String userId) {
        Long sum = twinExpRecordMapper.sumExpByUserIdExcludeRejected(userId);
        return sum != null ? sum : 0L;
    }

    private TwinExpRecord buildExpRecord(String userId, Map<String, Object> log,
                                          int expAmount, String sourceType, int accessType,
                                          List<String> anomalyTypes, LocalDateTime eventTime) {
        TwinExpRecord rec = new TwinExpRecord();
        rec.setUserId(userId);
        rec.setUserName(ExpSessionCalculator.str(log.get("person_name")));
        rec.setExpAmount(expAmount);
        rec.setSourceType(sourceType);
        rec.setAccessType(accessType);
        rec.setRoomId(ExpSessionCalculator.str(log.get("room_id")));
        rec.setRoomName(ExpSessionCalculator.str(log.get("room_name")));
        rec.setFeedSource(ExpSessionCalculator.str(log.get("feed_source")));
        rec.setCreateTime(eventTime);
        if (anomalyTypes != null && !anomalyTypes.isEmpty()) {
            rec.setAnomalyFlag(1);
            rec.setAnomalyTypes(String.join(",", anomalyTypes));
            rec.setReviewStatus(0);
        } else {
            rec.setAnomalyFlag(0);
            rec.setReviewStatus(1);
        }
        rec.setSessionDurationMinutes(null);
        return rec;
    }

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
