package com.example.demo.modules.twin.rpg.service;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 经验值统一计算引擎（方案 A：aro_access_log 为唯一事实来源）。
 * 快轨展示、慢轨对账、扫码预测共用同一套规则。
 */
public final class ExpSessionCalculator {

    public static final double DAILY_FIRST_ENTER_EXP = 50.0;
    public static final double EXP_PER_MINUTE = 1.0;
    public static final int MAX_SESSION_MINUTES = 480;

    public static final String FEED_AUTO_SIGNOUT = "TWIN_AUTO_SIGNOUT";

    public static final String SOURCE_FIRST_ENTRY = "FIRST_ENTRY";
    public static final String SOURCE_TIME_BASED = "TIME_BASED";

    public static final String ANOMALY_OVER_CAP = "OVER_CAP";
    public static final String ANOMALY_CROSS_DAY = "CROSS_DAY";
    public static final String ANOMALY_NIGHT_HOURS = "NIGHT_HOURS";

    private static final LocalTime NIGHT_START = LocalTime.of(22, 0);
    private static final LocalTime NIGHT_END = LocalTime.of(6, 0);
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private ExpSessionCalculator() {
    }

    public static boolean isEnterAction(String action) {
        return "1".equals(action);
    }

    public static boolean isExitAction(String action) {
        return "2".equals(action) || "3".equals(action);
    }

    /** 自动签退离开：关闭会话但不计停留 XP */
    public static boolean isAutoSignoutExit(Map<String, Object> log, String action) {
        return isExitAction(action) && FEED_AUTO_SIGNOUT.equals(str(log.get("feed_source")));
    }

    public static int levelFromTotalExp(double totalExp) {
        return (int) Math.floor(Math.sqrt(Math.max(0, totalExp) / 50.0)) + 1;
    }

    public static double nextLevelTotalExp(int level) {
        return Math.pow(level, 2) * 50.0;
    }

    /**
     * 按时间升序遍历全量流水，计算总经验（含今日未离开会话的实时挂机部分）。
     */
    public static double calcTotalFromLogs(List<Map<String, Object>> logs, LocalDateTime now) {
        if (logs == null || logs.isEmpty()) {
            return 0;
        }
        double total = 0;
        String lastDate = "";
        boolean dailyFirstBlood = false;
        LocalDateTime currentEnterTime = null;

        for (Map<String, Object> log : logs) {
            LocalDateTime recordTime = parseRecordTime(log.get("create_time"));
            if (recordTime == null) {
                continue;
            }

            String dateKey = recordTime.toLocalDate().toString();
            if (!dateKey.equals(lastDate)) {
                lastDate = dateKey;
                dailyFirstBlood = false;
                currentEnterTime = null;
            }

            String action = String.valueOf(log.get("action"));
            if (isEnterAction(action)) {
                if (!dailyFirstBlood) {
                    total += DAILY_FIRST_ENTER_EXP;
                    dailyFirstBlood = true;
                }
                currentEnterTime = recordTime;
            } else if (isExitAction(action) && currentEnterTime != null) {
                if (!isAutoSignoutExit(log, action)) {
                    total += sessionTimeExp(currentEnterTime, recordTime);
                }
                currentEnterTime = null;
            }
        }

        if (currentEnterTime != null
                && currentEnterTime.toLocalDate().equals(now.toLocalDate())) {
            total += sessionTimeExp(currentEnterTime, now);
        }

        return total;
    }

    /** 评估单次进出会话（慢轨对账用） */
    public static SessionEval evaluateSession(LocalDateTime enterTime, LocalDateTime exitTime, LocalDate targetDate) {
        SessionEval eval = new SessionEval();

        if (!enterTime.toLocalDate().equals(exitTime.toLocalDate())) {
            eval.skipCrossDay = true;
            eval.anomalyTypes.add(ANOMALY_CROSS_DAY);
            return eval;
        }
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
        if (isNightTime(enterTime.toLocalTime()) || isNightTime(exitTime.toLocalTime())) {
            eval.anomalyTypes.add(ANOMALY_NIGHT_HOURS);
        }

        return eval;
    }

    public static double sessionTimeExp(LocalDateTime enter, LocalDateTime exit) {
        if (!enter.toLocalDate().equals(exit.toLocalDate())) {
            return 0;
        }
        long minutes = Duration.between(enter, exit).toMinutes();
        minutes = Math.min(Math.max(0, minutes), MAX_SESSION_MINUTES);
        return minutes * EXP_PER_MINUTE;
    }

    /** 从流水行读取事件时间（兼容 create_time / event_time 别名） */
    public static LocalDateTime parseRecordTimeFromRow(Map<String, Object> record) {
        if (record == null) {
            return null;
        }
        LocalDateTime t = parseRecordTime(record.get("create_time"));
        if (t == null) {
            t = parseRecordTime(record.get("event_time"));
        }
        return t;
    }

    public static LocalDateTime parseRecordTime(Object obj) {
        return parseRecordTime(obj, FMT);
    }

    public static LocalDateTime parseRecordTime(Object obj, DateTimeFormatter fmt) {
        if (obj == null) {
            return null;
        }
        try {
            if (obj instanceof LocalDateTime ldt) {
                return ldt;
            }
            if (obj instanceof Timestamp ts) {
                return ts.toLocalDateTime();
            }
            String s = obj.toString().trim();
            if (s.length() > 19) {
                s = s.substring(0, 19);
            } else if (s.length() == 16) {
                s += ":00";
            }
            return LocalDateTime.parse(s, fmt);
        } catch (Exception e) {
            return null;
        }
    }

    public static String str(Object o) {
        return o == null ? null : String.valueOf(o).trim();
    }

    private static boolean isNightTime(LocalTime t) {
        return !t.isBefore(NIGHT_START) || !t.isAfter(NIGHT_END);
    }

    public static final class SessionEval {
        public int actualMinutes;
        public int cappedMinutes;
        public boolean skipCrossDay;
        public final List<String> anomalyTypes = new ArrayList<>();

        public boolean hasAnomaly() {
            return !anomalyTypes.isEmpty();
        }
    }
}
