package com.example.demo.modules.twin.service;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/**
 * Debug 预测库按人聚合：周曲线均值、离场推演、房间列表组装。
 */
@Service
public class PredictionDebugAssemblerService {

    @Autowired
    private TwinPredictionEngineService predictionEngine;

    public List<Map<String, Object>> assembleUserPage(List<Map<String, Object>> userRows,
                                                      List<Map<String, Object>> predictionRows) {
        if (userRows == null || userRows.isEmpty()) {
            return List.of();
        }
        Map<String, List<Map<String, Object>>> predsByUser = new LinkedHashMap<>();
        for (Map<String, Object> row : predictionRows != null ? predictionRows : List.<Map<String, Object>>of()) {
            String uid = str(row.get("user_id"));
            if (uid.isEmpty()) continue;
            predsByUser.computeIfAbsent(uid, k -> new ArrayList<>()).add(row);
        }

        LocalDate today = LocalDate.now();
        LocalDateTime now = LocalDateTime.now();
        List<Map<String, Object>> out = new ArrayList<>();

        for (Map<String, Object> user : userRows) {
            String userId = str(user.get("user_id"));
            boolean authorized = toBool(user.get("has_official_room_permission"));
            int totalExp = toInt(user.get("total_exp"), 0);
            int level = (int) Math.floor(Math.sqrt(totalExp / 50.0)) + 1;

            List<Map<String, Object>> roomRows = predsByUser.getOrDefault(userId, List.of());
            double[] weeklyEntry = aggregateWeeklyCurve(roomRows, "weekly_entry_curve_json");
            double[] weeklyExit = aggregateWeeklyCurve(roomRows, "weekly_exit_curve_json");

            List<Map<String, Object>> rooms = new ArrayList<>();
            for (Map<String, Object> r : roomRows) {
                rooms.add(buildRoomDto(r, authorized, today, now));
            }

            Map<String, Object> dto = new LinkedHashMap<>();
            dto.put("userId", userId);
            dto.put("userName", firstNonBlank(str(user.get("user_name")), str(roomRows.isEmpty() ? "" : roomRows.get(0).get("user_name"))));
            dto.put("hasOfficialRoomPermission", authorized);
            dto.put("totalExp", totalExp);
            dto.put("level", level);
            dto.put("weeklyEntryCurve", weeklyEntry);
            dto.put("weeklyExitCurve", weeklyExit);
            dto.put("rooms", rooms);
            out.add(dto);
        }
        return out;
    }

    private Map<String, Object> buildRoomDto(Map<String, Object> row, boolean authorized,
                                             LocalDate today, LocalDateTime now) {
        int medianMins = toInt(row.get("median_duration_mins"), 30);
        String peakEntry = str(row.get("peak_entry_time"));
        double overtimeProb = toDouble(row.get("overtime_prob"), 0.0);

        LocalDateTime entryRef = predictionEngine.parsePeakEntryForToday(peakEntry, today);
        LocalDateTime predictedExit = predictionEngine.calculateSmartExitTime(
                entryRef, medianMins, overtimeProb, now, authorized);
        String policyTag = predictionEngine.resolvePolicyTag(entryRef, authorized);

        Map<String, Object> room = new LinkedHashMap<>();
        room.put("roomId", str(row.get("room_id")));
        room.put("roomName", str(row.get("room_name")));
        room.put("medianDurationMins", medianMins);
        room.put("peakEntryTime", peakEntry);
        room.put("predictedExitTime", predictionEngine.formatExitLabel(predictedExit));
        room.put("predictedExitLabel", "~" + predictionEngine.formatExitLabel(predictedExit));
        room.put("policyTag", policyTag);
        room.put("overtimeProb", overtimeProb);
        room.put("visitCount", parseVisitCount(str(row.get("companion_impact_json"))));
        room.put("nextRoomProb", parseJsonMap(str(row.get("next_room_prob_json"))));
        room.put("entryCurve", parseJsonDoubleArray(str(row.get("entry_curve_json"))));
        room.put("exitCurve", parseJsonDoubleArray(str(row.get("exit_curve_json"))));
        return room;
    }

    private double[] aggregateWeeklyCurve(List<Map<String, Object>> roomRows, String jsonKey) {
        double[] eSum = new double[7];
        double[] cnt = new double[7];
        for (Map<String, Object> row : roomRows) {
            double[] arr = parseWeekly7(str(row.get(jsonKey)));
            for (int i = 0; i < 7; i++) {
                if (arr[i] >= 0) {
                    eSum[i] += arr[i];
                    cnt[i] += 1;
                }
            }
        }
        double[] avg = new double[7];
        for (int i = 0; i < 7; i++) {
            avg[i] = cnt[i] > 0 ? eSum[i] / cnt[i] : -1;
        }
        return fillWeekTimes(avg);
    }

    private static double[] parseWeekly7(String raw) {
        double[] out = new double[7];
        Arrays.fill(out, -1);
        if (raw == null || raw.isBlank()) return out;
        try {
            JSONArray arr = JSON.parseArray(raw);
            if (arr == null || arr.size() != 7) return out;
            for (int i = 0; i < 7; i++) {
                double v = arr.getDoubleValue(i);
                out[i] = Double.isFinite(v) ? v : -1;
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    private static double[] fillWeekTimes(double[] src) {
        double[] out = new double[7];
        boolean[] has = new boolean[7];
        int present = 0;
        for (int i = 0; i < 7; i++) {
            double v = src[i];
            if (Double.isFinite(v) && v >= 0) {
                out[i] = Math.max(0, Math.min(24, v));
                has[i] = true;
                present++;
            } else {
                out[i] = 12;
            }
        }
        if (present == 0) {
            Arrays.fill(out, 12.0);
            return out;
        }
        if (present == 7) return out;
        for (int i = 0; i < 7; i++) {
            if (has[i]) continue;
            int prev = i, dPrev = 0;
            while (dPrev < 7) {
                prev = (prev + 6) % 7;
                dPrev++;
                if (has[prev]) break;
            }
            int next = i, dNext = 0;
            while (dNext < 7) {
                next = (next + 1) % 7;
                dNext++;
                if (has[next]) break;
            }
            if (has[prev] && has[next]) {
                out[i] = (out[prev] * dNext + out[next] * dPrev) / (dPrev + dNext);
            } else if (has[prev]) {
                out[i] = out[prev];
            } else if (has[next]) {
                out[i] = out[next];
            }
        }
        return out;
    }

    private static List<Double> parseJsonDoubleArray(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        try {
            JSONArray arr = JSON.parseArray(raw);
            List<Double> list = new ArrayList<>();
            for (int i = 0; i < arr.size(); i++) {
                list.add(arr.getDoubleValue(i));
            }
            return list;
        } catch (Exception e) {
            return List.of();
        }
    }

    private static Map<String, Object> parseJsonMap(String raw) {
        if (raw == null || raw.isBlank()) return Map.of();
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = JSON.parseObject(raw, Map.class);
            return m != null ? m : Map.of();
        } catch (Exception e) {
            return Map.of();
        }
    }

    private static int parseVisitCount(String raw) {
        if (raw == null || raw.isBlank()) return 0;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = JSON.parseObject(raw, Map.class);
            if (m == null) return 0;
            Object v = m.get("visit_count");
            return v instanceof Number ? ((Number) v).intValue() : 0;
        } catch (Exception e) {
            return 0;
        }
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o).trim();
    }

    private static String firstNonBlank(String a, String b) {
        return !a.isEmpty() ? a : b;
    }

    private static boolean toBool(Object o) {
        if (o == null) return false;
        if (o instanceof Boolean) return (Boolean) o;
        if (o instanceof Number) return ((Number) o).intValue() == 1;
        return "1".equals(String.valueOf(o)) || "true".equalsIgnoreCase(String.valueOf(o));
    }

    private static int toInt(Object o, int def) {
        if (o == null) return def;
        if (o instanceof Number) return ((Number) o).intValue();
        try {
            return Integer.parseInt(String.valueOf(o));
        } catch (Exception e) {
            return def;
        }
    }

    private static double toDouble(Object o, double def) {
        if (o == null) return def;
        if (o instanceof Number) return ((Number) o).doubleValue();
        try {
            return Double.parseDouble(String.valueOf(o));
        } catch (Exception e) {
            return def;
        }
    }
}
