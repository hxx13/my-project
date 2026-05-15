package com.example.demo.modules.twin.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.DayOfWeek;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.*;
import java.text.*;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.time.Duration;
import java.util.stream.Collectors;

@Service
public class TwinPredictionEngineService {

    // 彻底抛弃裸写 SQL，改用规范的 Mapper。
    @Autowired
    private com.example.demo.modules.twin.mapper.TwinDashboardMapper dashboardMapper;

    // ... 下面保留你原来的 runPredictionModelManual 等方法不变

    /**
     * 🟢 引擎入口：手动触发（调试/测试专用）
     * 允许指定 user_id 跑单人模型，或者传 "ALL" 跑全量
     */
    public void runPredictionModelManual(String userId) {
        System.out.println("🚀 [行为预测模型] 手动触发计算开始, 目标: " + userId);
        executeModelPipeline(userId);
    }

    @Async("heavyCalcExecutor")
    public void runPredictionModelManualAsync(String userId) {
        runPredictionModelManual(userId);
    }

    @Async("heavyCalcExecutor")
    public void executeGroupPipelineAsync(String targetGroup) {
        executeGroupPipeline(targetGroup);
    }

    /**
     * ⏰ 引擎入口：定时调度（生产环境自动执行）
     * 每天凌晨 02:00 自动执行全量历史数据清洗和模型重建
     */
    @Scheduled(cron = "0 0 2 * * ?")
    public void runPredictionModelScheduled() {
        System.out.println("🌙 [行为预测模型] 凌晨跑批任务启动...");
        executeModelPipeline("ALL");
        executeGroupPipeline("ALL");
    }

    /**
     * 🧠 核心算法流水线 3.0 (真实会话配对 Session Pairing + 半衰期衰减 + 准确次数还原)
     */
    private void executeModelPipeline(String targetUserId) {
        System.out.println("🔍 [微观预测模型] 正在启动个人数据清洗与推演 (带时间衰减的 3.0 精确配对版)...");
        String currentTime = new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date());
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

        List<String> usersToProcess = new ArrayList<>();
        if ("ALL".equals(targetUserId)) {
            try {
                usersToProcess = dashboardMapper.getDistinctUserIds(); // 💥 解耦：用 Mapper 查
            } catch (Exception e) {
                System.err.println("❌ 获取用户列表失败: " + e.getMessage());
                return;
            }
        } else {
            usersToProcess.add(targetUserId);
        }

        System.out.println("📊 本次共需处理 " + usersToProcess.size() + " 个用户的空间画像...");

        // 💥 解耦：调用 Mapper 清空旧数据
        dashboardMapper.deleteBehaviorPrediction(targetUserId);

        LocalDate today = LocalDate.now();
        // 周维统计闭环：永远截到「上周日」，避免本周未完导致周图只到今天。
        LocalDate weeklyClosedSunday = today.with(TemporalAdjusters.previous(DayOfWeek.MONDAY)).minusDays(1);
        System.out.println("🗓️ [周维闭环] 仅纳入 <= " + weeklyClosedSunday + " 的历史会话（不含本周数据）");

        for (String uId : usersToProcess) {
            try {
                // 💥 解耦：调用 Mapper 拉取流水
                List<Map<String, Object>> userLogs = dashboardMapper.getUserLogsForPrediction(uId);

                Map<String, Map<String, Double>> transitionMatrix = new HashMap<>();
                // 仅由「当日进 + 当日离」成对会话贡献的小时直方图（半衰期加权）
                Map<String, double[]> roomEntryHours = new HashMap<>();
                Map<String, double[]> roomExitHours = new HashMap<>();

                Map<String, ArrayDeque<LocalDateTime>> pendingEntriesByRoom = new HashMap<>();
                Map<String, Double> totalWeightedDuration = new HashMap<>();
                Map<String, Double> sumOfWeightsForDuration = new HashMap<>();

                /** 有效同日配对次数（用于 visit_count）；与半衰期权重独立计数 */
                Map<String, Integer> pairedVisitCounts = new HashMap<>();
                /** 同日配对带来的权重和，用于晚归比例 */
                Map<String, Double> pairedWeightSum = new HashMap<>();
                Map<String, Double> lateExitWeight = new HashMap<>();

                // 周维：每个 weekday 的入/离场平均时刻（半衰期加权）
                double[] wkEntryTimeWeightedSum = new double[7];
                double[] wkExitTimeWeightedSum = new double[7];
                double[] wkPairedWeightByDay = new double[7];

                Set<String> visitedRooms = new HashSet<>();
                Map<String, String> idToNameDict = new HashMap<>();
                String currentUserName = uId;

                for (int i = 0; i < userLogs.size(); i++) {
                    Map<String, Object> currentLog = userLogs.get(i);
                    String roomId = (String) currentLog.get("room_id");
                    String roomName = (String) currentLog.get("room_name");
                    String userName = (String) currentLog.get("name");
                    if (userName != null) currentUserName = userName;
                    if (roomId != null && roomName != null) idToNameDict.put(roomId, roomName);

                    Integer accessType = currentLog.get("access_type") != null ? ((Number) currentLog.get("access_type")).intValue() : -1;
                    String timeStr = (String) currentLog.get("create_time");

                    if (roomId == null || roomId.trim().isEmpty() || timeStr == null) continue;

                    if (timeStr.endsWith(".0")) timeStr = timeStr.substring(0, timeStr.length() - 2);
                    LocalDateTime timestamp;
                    try { timestamp = LocalDateTime.parse(timeStr, formatter); } catch (Exception e) { continue; }

                    LocalDate logDay = timestamp.toLocalDate();
                    if (!logDay.isBefore(today)) continue;
                    if (logDay.isAfter(weeklyClosedSunday)) continue;

                    visitedRooms.add(roomId);

                    if (accessType == 1) {
                        pendingEntriesByRoom.computeIfAbsent(roomId, k -> new ArrayDeque<>()).addLast(timestamp);
                        continue;
                    }

                    if (accessType != 2 && accessType != 3) {
                        continue;
                    }

                    ArrayDeque<LocalDateTime> pending = pendingEntriesByRoom.get(roomId);
                    if (pending == null || pending.isEmpty()) {
                        continue;
                    }

                    LocalDate exitDay = timestamp.toLocalDate();
                    LocalDateTime matchedEntry = null;
                    while (!pending.isEmpty()) {
                        LocalDateTime head = pending.peekFirst();
                        LocalDate headDay = head.toLocalDate();
                        if (headDay.isBefore(exitDay)) {
                            pending.pollFirst();
                            continue;
                        }
                        if (headDay.equals(exitDay)) {
                            matchedEntry = pending.pollFirst();
                            break;
                        }
                        break;
                    }

                    if (matchedEntry == null) {
                        continue;
                    }

                    long daysDiff = ChronoUnit.DAYS.between(exitDay, today);
                    if (daysDiff < 0) daysDiff = 0;
                    double weight = Math.pow(0.5, daysDiff / 14.0);

                    roomEntryHours.putIfAbsent(roomId, new double[24]);
                    roomExitHours.putIfAbsent(roomId, new double[24]);
                    addWeightedHourMass(roomEntryHours.get(roomId), matchedEntry, weight);
                    addWeightedHourMass(roomExitHours.get(roomId), timestamp, weight);

                    int dayOfWeek = exitDay.getDayOfWeek().getValue() - 1;
                    double entryHourFloat = matchedEntry.getHour() + matchedEntry.getMinute() / 60.0 + matchedEntry.getSecond() / 3600.0;
                    double exitHourFloat = timestamp.getHour() + timestamp.getMinute() / 60.0 + timestamp.getSecond() / 3600.0;
                    wkEntryTimeWeightedSum[dayOfWeek] += entryHourFloat * weight;
                    wkExitTimeWeightedSum[dayOfWeek] += exitHourFloat * weight;
                    wkPairedWeightByDay[dayOfWeek] += weight;

                    long durationMins = Duration.between(matchedEntry, timestamp).toMinutes();
                    if (durationMins > 0 && durationMins < 24 * 60) {
                        totalWeightedDuration.put(roomId, totalWeightedDuration.getOrDefault(roomId, 0.0) + (durationMins * weight));
                        sumOfWeightsForDuration.put(roomId, sumOfWeightsForDuration.getOrDefault(roomId, 0.0) + weight);
                    }

                    pairedVisitCounts.put(roomId, pairedVisitCounts.getOrDefault(roomId, 0) + 1);
                    pairedWeightSum.put(roomId, pairedWeightSum.getOrDefault(roomId, 0.0) + weight);

                    double timeValue = timestamp.getHour() + timestamp.getMinute() / 60.0;
                    if (timeValue > 17.5) {
                        lateExitWeight.put(roomId, lateExitWeight.getOrDefault(roomId, 0.0) + weight);
                    }

                    String nextDestination = "EXIT";
                    if (i + 1 < userLogs.size()) {
                        Map<String, Object> nextLog = userLogs.get(i + 1);
                        String nextRoomId = (String) nextLog.get("room_id");
                        Integer nextAccessType = nextLog.get("access_type") != null ? ((Number) nextLog.get("access_type")).intValue() : -1;
                        String nextTimeStr = (String) nextLog.get("create_time");
                        if (nextTimeStr != null && nextTimeStr.length() >= 10
                                && exitDay.equals(LocalDate.parse(nextTimeStr.substring(0, 10)))
                                && nextAccessType != null && nextAccessType == 1 && nextRoomId != null) {
                            nextDestination = nextRoomId;
                        }
                    }
                    transitionMatrix.putIfAbsent(roomId, new HashMap<>());
                    Map<String, Double> nextCounts = transitionMatrix.get(roomId);
                    nextCounts.put(nextDestination, nextCounts.getOrDefault(nextDestination, 0.0) + weight);
                }

                if (visitedRooms.isEmpty()) continue;

                // --- 组装入库逻辑 ---
                for (String realRoomId : visitedRooms) {

                    // 💥 读取精准配对后的平均时长
                    double wDur = totalWeightedDuration.getOrDefault(realRoomId, 0.0);
                    double wSum = sumOfWeightsForDuration.getOrDefault(realRoomId, 0.0);
                    int medianDurationMins = wSum > 0 ? (int)(wDur / wSum) : 30; // 默认给30分钟防呆

                    int pairedSessions = pairedVisitCounts.getOrDefault(realRoomId, 0);
                    double wPair = pairedWeightSum.getOrDefault(realRoomId, 0.0);
                    double lateW = lateExitWeight.getOrDefault(realRoomId, 0.0);
                    double overtimeProb = wPair > 0 ? lateW / wPair : 0.0;
                    if (overtimeProb > 1.0) overtimeProb = 1.0;

                    double[] entryH = roomEntryHours.getOrDefault(realRoomId, new double[24]);
                    double[] exitH = roomExitHours.getOrDefault(realRoomId, new double[24]);
                    double maxEntryCount = Arrays.stream(entryH).max().orElse(1.0);
                    if (maxEntryCount <= 0) maxEntryCount = 1.0;

                    // 多峰提取算法（基于原始加权直方图，而非展示用 PMF）
                    List<Integer> peaks = new ArrayList<>();
                    for (int k = 0; k < 24; k++) {
                        double prev = k == 0 ? 0 : entryH[k - 1];
                        double next = k == 23 ? 0 : entryH[k + 1];
                        if (entryH[k] > prev && entryH[k] > next && entryH[k] >= maxEntryCount * 0.3) peaks.add(k);
                    }
                    if (peaks.isEmpty()) {
                        int bestHour = 0;
                        for (int k = 0; k < 24; k++) if(entryH[k] == maxEntryCount) bestHour = k;
                        peaks.add(bestHour);
                    }
                    peaks.sort((a, b) -> Double.compare(entryH[b], entryH[a]));
                    StringBuilder peakStrBuilder = new StringBuilder();
                    for (int i = 0; i < Math.min(2, peaks.size()); i++) {
                        if (i > 0) peakStrBuilder.append(", ");
                        peakStrBuilder.append(String.format("%02d:00", peaks.get(i)));
                    }
                    String peakEntryTime = peakStrBuilder.toString();

                    // 07–19 展示窗口：日内条件概率质量（对衰减加权计数做轻度平滑后再归一）
                    double[] entryCurve = dayWindowPmF(smoothHourly3(entryH), 7, 19);
                    double[] exitCurve = dayWindowPmF(smoothHourly3(exitH), 7, 19);
                    String entryCurveJson = com.alibaba.fastjson2.JSON.toJSONString(entryCurve);
                    String exitCurveJson = com.alibaba.fastjson2.JSON.toJSONString(exitCurve);

                    double[] weeklyEntryCurve = buildWeeklyAverageTimes(wkEntryTimeWeightedSum, wkPairedWeightByDay);
                    double[] weeklyExitCurve = buildWeeklyAverageTimes(wkExitTimeWeightedSum, wkPairedWeightByDay);

                    Map<String, Double> nextCounts = transitionMatrix.getOrDefault(realRoomId, new HashMap<>());
                    double totalTransitions = nextCounts.values().stream().mapToDouble(Double::doubleValue).sum();
                    StringBuilder nextRoomJsonBuilder = new StringBuilder("{");
                    if (totalTransitions <= 0) {
                        nextRoomJsonBuilder.append("\"EXIT\": 1.0");
                    } else {
                        int count = 0;
                        for (Map.Entry<String, Double> entry : nextCounts.entrySet()) {
                            double prob = entry.getValue() / totalTransitions;
                            String targetId = entry.getKey();
                            String targetName = "EXIT".equals(targetId) ? "EXIT" : idToNameDict.getOrDefault(targetId, targetId);
                            nextRoomJsonBuilder.append(String.format("\"%s\": %.2f", targetName, prob));
                            if (++count < nextCounts.size()) nextRoomJsonBuilder.append(", ");
                        }
                    }
                    nextRoomJsonBuilder.append("}");

                    String primaryKey = UUID.randomUUID().toString().replace("-", "");
                    // visit_count：仅统计「当日进且当日离」的成对会话次数（未离场单条已丢弃）
                    String companionJson = String.format("{\"visit_count\": %d}", pairedSessions);
                    String finalRoomName = idToNameDict.getOrDefault(realRoomId, "未知房间");

                    // 💥 解耦：调用 Mapper 插入
                    dashboardMapper.insertBehaviorPrediction(
                            primaryKey, uId, currentUserName, realRoomId, finalRoomName, "ALL_DAYS",
                            medianDurationMins, peakEntryTime, overtimeProb, entryCurveJson, exitCurveJson,
                            nextRoomJsonBuilder.toString(), companionJson, 0, currentTime,
                            com.alibaba.fastjson2.JSON.toJSONString(weeklyEntryCurve),
                            com.alibaba.fastjson2.JSON.toJSONString(weeklyExitCurve)
                    );
                }
            } catch (Exception e) {
                System.err.println("❌ 处理用户 " + uId + " 的画像时发生异常: " + e.getMessage());
            }
        }
        System.out.println("✅ [微观预测模型] 同日进离场 FIFO 配对 + 孤立离场/跨日遗留入场丢弃，特征已写入表。");
    }


    /**
     * 🧠 计划 A：宏观课题组画像 4.0 (校区隔离 + 物理房间与虚拟套间 双重复式记账)
     */
    public void executeGroupPipeline(String targetGroup) {
        System.out.println("🔍 [宏观调度模型] 正在启动课题组空间热力图推演 (4.0 双重记账版)...");
        String currentTime = new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date());
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

        List<String> groupsToProcess = new ArrayList<>();
        if ("ALL".equals(targetGroup)) {
            try {
                groupsToProcess = dashboardMapper.getDistinctGroupNames(); // 💥 解耦
            } catch (Exception e) { return; }
        } else {
            groupsToProcess.add(targetGroup);
        }
        // 💥 解耦：清空旧数据
        dashboardMapper.deleteGroupRoomPrediction(targetGroup);

        LocalDate today = LocalDate.now();

        for (String groupName : groupsToProcess) {
            try {
                // 💥 解耦：拉取流水
                List<Map<String, Object>> logs = dashboardMapper.getGroupLogsForPrediction(groupName);

                Map<String, double[][]> roomHeatmaps = new HashMap<>();
                Map<String, double[]> roomEntryHours = new HashMap<>();
                Map<String, double[]> roomExitHours = new HashMap<>();
                Map<String, String> idToNameDict = new HashMap<>();
                Map<String, LocalDateTime> userEntryTracker = new HashMap<>();

                for (Map<String, Object> log : logs) {
                    String userId = (String) log.get("user_id");
                    String physicalRoomId = (String) log.get("room_id");
                    String rawRoomName = (String) log.get("room_name");
                    String areaName = (String) log.get("area_name");
                    Integer accessType = log.get("access_type") != null ? ((Number) log.get("access_type")).intValue() : -1;
                    String timeStr = (String) log.get("create_time");

                    if (physicalRoomId == null || userId == null || timeStr == null) continue;

                    if (areaName == null || areaName.isEmpty()) areaName = "未知校区";
                    if (rawRoomName == null) rawRoomName = "未知房间";

                    if (timeStr.endsWith(".0")) timeStr = timeStr.substring(0, timeStr.length() - 2);
                    LocalDateTime timestamp;
                    try { timestamp = LocalDateTime.parse(timeStr, formatter); } catch (Exception e) { continue; }
                    if (!timestamp.toLocalDate().isBefore(today)) continue;

                    long daysDiff = java.time.temporal.ChronoUnit.DAYS.between(timestamp.toLocalDate(), today);
                    double weight = Math.pow(0.5, Math.max(0, daysDiff) / 14.0);
                    int hour = timestamp.getHour();
                    int dayOfWeek = timestamp.getDayOfWeek().getValue() - 1;

                    // =========================================================
                    // 💥 核心算法：生成物理单间与虚拟套间的双重坐标系
                    // =========================================================
                    String fullRoomName = "[" + areaName + "] " + rawRoomName;

                    // 提取套间号 (例如：201A -> 201, 305-1 -> 305)
                    // 💥 升级版套间智能提取算法：兼容 E11A-B103 楼栋前缀与 地下E11C 特例
                    String suiteName = rawRoomName;
                    if (suiteName.contains("地下E11C")) {
                        suiteName = "地下E11C"; // 特例直通车
                    } else if (suiteName.contains("-")) {
                        String[] parts = suiteName.split("-");
                        // 如果前面是楼栋号(带字母)，后面是房间号(如 E11A-B103A)，则以后面为准提取
                        if (parts[0].matches(".*[a-zA-Z].*") && parts[parts.length - 1].matches(".*[0-9].*")) {
                            suiteName = parts[parts.length - 1].replaceAll("(?i)([A-Z]*[0-9]+)[A-Z]*.*", "$1");
                        } else {
                            // 如果是 305-1 这种纯数字隔断，以前面为准提取 (305)
                            suiteName = parts[0].replaceAll("(?i)([A-Z]*[0-9]+)[A-Z]*.*", "$1");
                        }
                    } else {
                        // 常规 201A -> 201, B103 -> B103
                        suiteName = suiteName.replaceAll("(?i)([A-Z]*[0-9]+)[A-Z]*.*", "$1");
                    }
                    String virtualSuiteId = "SUITE_" + areaName + "_" + suiteName;
                    String fullSuiteName = "[" + areaName + "] " + suiteName;

                    String[] targetIds = { physicalRoomId, virtualSuiteId };
                    String[] targetNames = { fullRoomName, fullSuiteName };

                    // 💥 循环两次：一次给单间记账，一次给整个大套间记账！
                    for (int t = 0; t < 2; t++) {
                        String tId = targetIds[t];
                        String tName = targetNames[t];
                        idToNameDict.put(tId, tName);

                        String trackKey = userId + "_" + tId; // 隔离追踪状态
                        roomHeatmaps.putIfAbsent(tId, new double[7][24]);
                        roomEntryHours.putIfAbsent(tId, new double[24]);
                        roomExitHours.putIfAbsent(tId, new double[24]);

                        if (accessType == 1) {
                            roomEntryHours.get(tId)[hour] += weight;
                            userEntryTracker.put(trackKey, timestamp);
                        } else if (accessType == 2) {
                            roomExitHours.get(tId)[hour] += weight;
                            LocalDateTime entryTime = userEntryTracker.get(trackKey);
                            if (entryTime != null && entryTime.toLocalDate().equals(timestamp.toLocalDate())) {
                                int startHour = entryTime.getHour();
                                int endHour = hour;
                                if (endHour > 17 || (endHour == 17 && timestamp.getMinute() > 30)) endHour = 17;
                                for (int h = startHour; h <= endHour && h < 24; h++) {
                                    roomHeatmaps.get(tId)[dayOfWeek][h] += weight;
                                }
                            }
                            userEntryTracker.remove(trackKey);
                        }
                    }
                }

                // 兜底有进无出
                for (Map.Entry<String, LocalDateTime> entry : userEntryTracker.entrySet()) {
                    LocalDateTime entryTime = entry.getValue();
                    String tId = entry.getKey().substring(entry.getKey().indexOf("_") + 1); // 提取出 tId
                    long daysDiff = java.time.temporal.ChronoUnit.DAYS.between(entryTime.toLocalDate(), today);
                    double weight = Math.pow(0.5, Math.max(0, daysDiff) / 14.0);
                    int dayOfWeek = entryTime.getDayOfWeek().getValue() - 1;
                    int startHour = entryTime.getHour();
                    for (int h = startHour; h <= 17 && h < 24; h++) {
                        if (roomHeatmaps.containsKey(tId)) roomHeatmaps.get(tId)[dayOfWeek][h] += weight;
                    }
                }

                // 2. 统一入库
                for (String roomId : roomHeatmaps.keySet()) {
                    double[] entryH = roomEntryHours.get(roomId);
                    double[] exitH = roomExitHours.get(roomId);
                    double maxEn = Arrays.stream(entryH).max().orElse(1.0);
                    double maxEx = Arrays.stream(exitH).max().orElse(1.0);
                    if(maxEn <= 0) maxEn = 1.0; if(maxEx <= 0) maxEx = 1.0;

                    List<Integer> enPeaks = new ArrayList<>();
                    for (int k = 0; k < 24; k++) {
                        double prev = k == 0 ? 0 : entryH[k - 1];
                        double next = k == 23 ? 0 : entryH[k + 1];
                        if (entryH[k] > prev && entryH[k] > next && entryH[k] >= maxEn * 0.3) enPeaks.add(k);
                    }
                    if(enPeaks.isEmpty()) { int bestHour = 0; for(int k=0; k<24; k++) if(entryH[k]==maxEn) bestHour=k; enPeaks.add(bestHour); }
                    enPeaks.sort((a, b) -> Double.compare(entryH[b], entryH[a]));
                    StringBuilder peakEnStr = new StringBuilder();
                    for (int i = 0; i < Math.min(2, enPeaks.size()); i++) {
                        if (i > 0) peakEnStr.append(", "); peakEnStr.append(String.format("%02d:00", enPeaks.get(i)));
                    }

                    List<Integer> exPeaks = new ArrayList<>();
                    for (int k = 0; k < 24; k++) {
                        double prev = k == 0 ? 0 : exitH[k - 1];
                        double next = k == 23 ? 0 : exitH[k + 1];
                        if (exitH[k] > prev && exitH[k] > next && exitH[k] >= maxEx * 0.3) exPeaks.add(k);
                    }
                    if(exPeaks.isEmpty()) { int bestHour = 0; for(int k=0; k<24; k++) if(exitH[k]==maxEx) bestHour=k; exPeaks.add(bestHour); }
                    exPeaks.sort((a, b) -> Double.compare(exitH[b], exitH[a]));
                    StringBuilder peakExStr = new StringBuilder();
                    for (int i = 0; i < Math.min(2, exPeaks.size()); i++) {
                        if (i > 0) peakExStr.append(", "); peakExStr.append(String.format("%02d:00", exPeaks.get(i)));
                    }

                    double[][] matrix = roomHeatmaps.get(roomId);
                    String heatmapJson = com.alibaba.fastjson2.JSON.toJSONString(matrix);
                    String primaryKey = UUID.randomUUID().toString().replace("-", "");
                    String finalRoomName = idToNameDict.getOrDefault(roomId, "未知房间");

                    // 💥 解耦：调用 Mapper 插入
                    dashboardMapper.insertGroupRoomPrediction(
                            primaryKey, groupName, roomId, finalRoomName,
                            peakEnStr.toString(), peakExStr.toString(), heatmapJson, currentTime
                    );
                }
            } catch (Exception e) {}
        }
        System.out.println("✅ [宏观调度模型] 4.0 虚拟套间与物理单间双重数据已入库！");
    }

    /**
     * 🖥️ 控制台可视化：漂亮地打印预测结果表
     *
     * @param limit 打印几条记录（防止刷屏）
     */
    public void printPredictionResultsToConsole(int limit) {
        System.out.println("\n=========================================================================================");
        System.out.println("🤖 [空间行为智能预测模型] 预测结果可视化面板 (Console 版)");
        System.out.println("=========================================================================================");

        // 💥 解耦：调用 Mapper 打印
        List<Map<String, Object>> results = dashboardMapper.getLatestPredictionsForConsole(limit);

        if (results.isEmpty()) {
            System.out.println("⚠️ 预测结果表为空，请确认模型是否成功写入数据！");
            return;
        }

        for (Map<String, Object> row : results) {
            String userId = (String) row.get("user_id");
            String roomId = (String) row.get("room_id");
            String dayType = (String) row.get("day_type");

            Object medianDuration = row.get("median_duration_mins");
            String peakEntry = (String) row.get("peak_entry_time");

            // 处理概率展示
            Object probObj = row.get("overtime_prob");
            double prob = probObj != null ? ((Number) probObj).doubleValue() : 0.0;
            String probStr = String.format("%.1f%%", prob * 100);

            // 预测警示标签
            String alertTag = prob > 0.6 ? "🔥 [极易推迟]" : (prob > 0.3 ? "⚠️ [可能推迟]" : "✅ [准时达人]");

            // JSON 字符串过长时进行截断展示
            String entryCurve = truncateJson((String) row.get("entry_curve_json"), 40);
            String exitCurve = truncateJson((String) row.get("exit_curve_json"), 40);
            String nextRoom = truncateJson((String) row.get("next_room_prob_json"), 40);
            String companion = truncateJson((String) row.get("companion_impact_json"), 40);

            Object isColdStart = row.get("is_cold_start");
            String coldStartStr = (isColdStart != null && ((Number) isColdStart).intValue() == 1) ? "❄️ 是 (套用群体均值)" : "👤 否 (专属模型)";

            String updateTime = (String) row.get("update_time");

            // 打印高颜值信息卡片
            System.out.printf("👤 用户ID: %-10s | 🚪 房间: %-10s | 📅 类型: %s\n", userId, roomId, dayType);
            System.out.printf("⏱️ 驻留时长: %-8s 分钟 | 🕒 预测入场: %s\n", medianDuration, peakEntry);
            System.out.printf("🏃 延时概率: %-8s      | 🏷️ 预警: %s\n", probStr, alertTag);
            System.out.printf("📈 入场曲线: %s\n", entryCurve);
            System.out.printf("📉 离开曲线: %s\n", exitCurve);
            System.out.printf("🔮 下一去向: %s\n", nextRoom);
            System.out.printf("🤝 社交因子: %s\n", companion);
            System.out.printf("⚙️ 冷启动: %-18s | 🔄 更新时间: %s\n", coldStartStr, updateTime);
            System.out.println("-----------------------------------------------------------------------------------------");
        }
        System.out.println("✅ [模型面板] 共加载 " + results.size() + " 条预测数据。\n");
    }

    // =========================================================================================
    // 💥 实时推演引擎：全天候弹性时空压缩算法 (支持超时滑动延期)
    // =========================================================================================
    /**
     * @param entryTime          该用户本次真实的刷卡入场时间
     * @param medianDurationMins 预测模型算出的该用户历史基础驻留时长 (分钟)
     * @param overtimeProb       预测模型算出的该用户晚归概率 (0.0 ~ 1.0)
     * @param now                💥 新增：大盘当前探测时的真实时间！(破除时空穿透悖论的核心)
     * @return LocalDateTime     经过弹性压缩与超时校准后的最终预计离开时间
     */
    public LocalDateTime calculateSmartExitTime(LocalDateTime entryTime, int medianDurationMins, double overtimeProb, LocalDateTime now) {

        LocalDateTime softCeiling = entryTime.toLocalDate().atTime(17, 30);
        LocalDateTime hardCeiling = entryTime.toLocalDate().atTime(19, 0);
        LocalTime lateEntryThreshold = LocalTime.of(16, 30);

        LocalDateTime finalPredictedExit;

        // ⚡ 场景 A：极晚入场快闪模式 (16:30 之后进入)
        if (entryTime.toLocalTime().isAfter(lateEntryThreshold)) {
            LocalDateTime quickDashExit = entryTime.plusMinutes(30);
            if (quickDashExit.isAfter(softCeiling)) {
                LocalDateTime absoluteMinExit = entryTime.plusMinutes(15);
                finalPredictedExit = absoluteMinExit.isAfter(softCeiling) ? absoluteMinExit : softCeiling;
            } else {
                finalPredictedExit = quickDashExit;
            }
        }
        // 🌌 场景 B：常规入场模式 & 弹性暮光区 (16:30 之前进入)
        else {
            LocalDateTime naiveExit = entryTime.plusMinutes(medianDurationMins);
            if (naiveExit.isAfter(softCeiling)) {
                long overflowMins = Duration.between(softCeiling, naiveExit).toMinutes();
                long allowedOverflowMins = (long) (overflowMins * overtimeProb);
                LocalDateTime blendedExit = softCeiling.plusMinutes(allowedOverflowMins);
                finalPredictedExit = blendedExit.isAfter(hardCeiling) ? hardCeiling : blendedExit;
            } else {
                finalPredictedExit = naiveExit;
            }
        }

        // ====================================================================
        // 🚨 场景 C：终极补丁 —— 超时滑动拦截器 (The Rolling Extension Override)
        // ====================================================================
        if (finalPredictedExit.isBefore(now)) {
            // 洞察：他本来该走了，但现在还在。打破了历史画像。
            // 对策：从【现在】开始，再给他 30 分钟的“收尾时间”。
            LocalDateTime extendedExit = now.plusMinutes(30);

            // 同样，这 30 分钟绝不能击穿 19:00 的物理底线
            if (extendedExit.isAfter(hardCeiling)) {
                // 如果当前时间早就过了 19:00 (属于严重违规滞留或漏刷卡)
                // 永远维持 [当前时间 + 15 分钟] 的滚动预警，让雷达持续报警
                if (now.isAfter(hardCeiling)) {
                    finalPredictedExit = now.plusMinutes(15);
                } else {
                    finalPredictedExit = hardCeiling; // 压死在 19:00
                }
            } else {
                finalPredictedExit = extendedExit; // 正常滑动延期
            }
        }

        return finalPredictedExit;
    }

    /** 将事件按小数小时线性拆到相邻两个整点桶（07:30 → 0.5×7h + 0.5×8h），兼容一天多次进出。 */
    private static void addWeightedHourMass(double[] hourly24, LocalDateTime t, double mass) {
        if (mass <= 0 || hourly24 == null || hourly24.length != 24) return;
        double h = t.getHour() + t.getMinute() / 60.0 + t.getSecond() / 3600.0;
        int h0 = (int) Math.floor(h);
        if (h0 < 0) h0 = 0;
        if (h0 > 23) h0 = 23;
        double frac = h - h0;
        int h1 = Math.min(23, h0 + 1);
        hourly24[h0] += mass * (1.0 - frac);
        hourly24[h1] += mass * frac;
    }

    /** 3 点滑动平滑（边界保持原值），减轻单小时尖刺对 PMF 的影响。 */
    private static double[] smoothHourly3(double[] hourly) {
        double[] out = Arrays.copyOf(hourly, 24);
        for (int i = 1; i < 23; i++) {
            out[i] = 0.25 * hourly[i - 1] + 0.5 * hourly[i] + 0.25 * hourly[i + 1];
        }
        return out;
    }

    /**
     * 将 [lo, hi] 小时内的加权计数归一为条件概率质量，窗口外为 0；全窗口为 0 时在该窗口上均匀分布。
     * 对应「在 07–19 内发生一次入场/离场，落在各整点小时」的离散近似。
     */
    private static double[] dayWindowPmF(double[] hourlyWeighted, int loInclusive, int hiInclusive) {
        double[] out = new double[24];
        double sum = 0.0;
        for (int h = loInclusive; h <= hiInclusive && h >= 0 && h < 24; h++) {
            sum += Math.max(0.0, hourlyWeighted[h]);
        }
        int span = hiInclusive - loInclusive + 1;
        if (sum <= 0.0 && span > 0) {
            double u = 1.0 / span;
            for (int h = loInclusive; h <= hiInclusive && h < 24; h++) {
                out[h] = u;
            }
            return out;
        }
        for (int h = loInclusive; h <= hiInclusive && h >= 0 && h < 24; h++) {
            out[h] = Math.max(0.0, hourlyWeighted[h]) / sum;
        }
        return out;
    }

    /**
     * 周一到周日：返回每个 weekday 的加权平均时刻（单位小时 0-24）。
     * 为保证展示完整一周，缺失 weekday 用循环插值补全（仅用于展示，不回写原始流水）。
     */
    private static double[] buildWeeklyAverageTimes(double[] weightedTimeSumByDay, double[] pairedWeightByDay) {
        double[] out = new double[7];
        boolean[] has = new boolean[7];
        int present = 0;
        for (int i = 0; i < 7; i++) {
            double w = i < pairedWeightByDay.length ? pairedWeightByDay[i] : 0.0;
            if (w > 0) {
                double avg = weightedTimeSumByDay[i] / w;
                out[i] = Math.max(0.0, Math.min(24.0, avg));
                has[i] = true;
                present++;
            } else {
                out[i] = -1.0;
            }
        }

        // 全缺失时给稳定默认值，避免整周空图。
        if (present == 0) {
            Arrays.fill(out, 12.0);
            return out;
        }
        if (present == 7) {
            return out;
        }

        // 循环插值：补齐缺失 weekday，确保周图始终是完整 7 天闭环。
        for (int i = 0; i < 7; i++) {
            if (has[i]) continue;
            int prev = i;
            int dPrev = 0;
            while (dPrev < 7) {
                prev = (prev + 6) % 7;
                dPrev++;
                if (has[prev]) break;
            }
            int next = i;
            int dNext = 0;
            while (dNext < 7) {
                next = (next + 1) % 7;
                dNext++;
                if (has[next]) break;
            }

            if (has[prev] && has[next]) {
                double vp = out[prev];
                double vn = out[next];
                out[i] = (vp * dNext + vn * dPrev) / (dPrev + dNext);
            } else if (has[prev]) {
                out[i] = out[prev];
            } else if (has[next]) {
                out[i] = out[next];
            } else {
                out[i] = 12.0;
            }
        }
        return out;
    }

    // 辅助方法：截断过长的 JSON 字符串，防止控制台换行乱套
    private String truncateJson(String json, int maxLength) {
        if (json == null || json.isEmpty()) return "[]";
        if (json.length() <= maxLength) return json;
        return json.substring(0, maxLength) + "... (折叠)";
    }
}