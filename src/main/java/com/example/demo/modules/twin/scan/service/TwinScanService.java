package com.example.demo.modules.twin.scan.service; // 请核对一下你的真实包名

import com.corundumstudio.socketio.SocketIOServer;
import com.example.demo.common.config.DebugToggleService;
import com.example.demo.common.dto.UniversalEvent;
import com.example.demo.modules.aro.dto.AroRecord;
import com.example.demo.modules.aro.service.AroDatabaseService;
import com.example.demo.modules.aro.service.RealtimeEventDedupService;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.roommapping.entity.RoomMappingRoom;
import com.example.demo.modules.roommapping.mapper.RoomMappingRoomMapper;
import com.example.demo.modules.twin.scan.state.ScanDataSource;
import com.example.demo.modules.twin.scan.support.ScanAnalyzeTimingTrace;
import com.example.demo.modules.twin.scan.support.ScanCampusTagResolver;
import com.example.demo.modules.twin.scan.support.ScanPopupFlowLog;
import com.example.demo.modules.twin.common.support.TwinTimingDiagnostics;
import com.example.demo.modules.twin.card.service.TwinAccessLogCorrelationService;
import com.example.demo.modules.twin.common.service.AroMiniPenetrationSyncService;
import com.example.demo.modules.twin.common.service.ExamRoomPermissionSyncService;
import com.example.demo.modules.twin.common.service.RoomDictionaryManager;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class TwinScanService {
    private static final Logger log = LoggerFactory.getLogger(TwinScanService.class);
    private final Map<String, Long> noLeaveBypassUntilMap = new ConcurrentHashMap<>();

    @Autowired
    private RoomDictionaryManager dictionaryManager;

    @Autowired
    private TwinDashboardMapper dashboardMapper;

    @Autowired
    private AroService aroService;

    @Autowired
    private AroDatabaseService aroDatabaseService;

    // 💥 引入 WebSocket 发射器
    @Autowired
    private SocketIOServer socketIOServer;

    @Autowired
    private RealtimeEventDedupService realtimeEventDedupService;

    @Autowired
    private AroMiniPenetrationSyncService miniPenetrationSyncService;

    @Autowired
    private TwinAccessLogCorrelationService twinAccessLogCorrelationService;

    @Autowired
    private DebugToggleService debugToggleService;

    @Autowired
    private ExamRoomPermissionSyncService examRoomPermissionSyncService;

    @Autowired
    private RoomMappingRoomMapper roomMappingRoomMapper;

    @Autowired
    private ScanCampusEnterConfigService scanCampusEnterConfigService;

    @Autowired
    private ScanAnalyzeTimingTrace analyzeTimingTrace;

    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 扫码阶段 1：探测状态与权限（日志由 traceId 串联为 3/5、4/5 步）。
     */
    public Map<String, Object> processScanStatus(String userId, String traceId) {
        long aroParallelStart = System.currentTimeMillis();

        CompletableFuture<List<Map<String, Object>>> noLeaveFuture = CompletableFuture.supplyAsync(() -> {
            long t0 = System.currentTimeMillis();
            List<Map<String, Object>> rooms = aroService.getNoLeaveRoom(userId);
            long ms = System.currentTimeMillis() - t0;
            int cnt = rooms == null ? -1 : rooms.size();
            if (traceId != null) {
                TwinTimingDiagnostics.logScanPhase(traceId, "aro.noLeaveRoom", ms, "rooms=" + cnt);
                analyzeTimingTrace.stepForTrace(traceId,
                        "aro.GET https://aro.shsmu.edu.cn/jtu/api/admin/user/noLeaveRoom",
                        ms, "rooms=" + cnt);
            }
            return rooms;
        });

        CompletableFuture<List<Map<String, Object>>> allowedFuture = CompletableFuture.supplyAsync(() -> {
            long t0 = System.currentTimeMillis();
            List<Map<String, Object>> rooms = aroService.getExamOfflineRoom(userId);
            long ms = System.currentTimeMillis() - t0;
            int cnt = rooms == null ? 0 : rooms.size();
            if (traceId != null) {
                TwinTimingDiagnostics.logScanPhase(traceId, "aro.examOfflineRoom", ms, "rooms=" + cnt);
                analyzeTimingTrace.stepForTrace(traceId,
                        "aro.GET https://aro.shsmu.edu.cn/jtu/api/admin/user/examOfflineRoom",
                        ms, "rooms=" + cnt);
            }
            return rooms;
        });

        CompletableFuture.allOf(noLeaveFuture, allowedFuture).join();

        List<Map<String, Object>> noLeaveRooms = noLeaveFuture.join();
        List<Map<String, Object>> allowedRooms = allowedFuture.join();

        long aroParallelMs = System.currentTimeMillis() - aroParallelStart;
        int noLeaveCount = noLeaveRooms == null ? -1 : noLeaveRooms.size();
        int allowedCount = allowedRooms == null ? 0 : allowedRooms.size();
        if (traceId != null) {
            TwinTimingDiagnostics.logScanPhase(traceId, "aroParallel(noLeave+examOffline)",
                    aroParallelMs, "noLeave=" + noLeaveCount + " allowed=" + allowedCount);
        }
        analyzeTimingTrace.step("aroParallel(wall-clock max of noLeave+examOffline)",
                aroParallelMs, "noLeave=" + noLeaveCount + " allowed=" + allowedCount);

        Map<String, Object> response = new HashMap<>();

        Long bypassUntil = noLeaveBypassUntilMap.get(userId);
        boolean bypassNoLeave = bypassUntil != null && bypassUntil > System.currentTimeMillis();
        if (bypassNoLeave) {
            // 只放行一次，避免后续真实 ENTER 后仍被强制判 OUTSIDE
            noLeaveBypassUntilMap.remove(userId);
        } else if (bypassUntil != null) {
            noLeaveBypassUntilMap.remove(userId);
        }

        if (noLeaveRooms == null) {
            String reason = aroService.getLastAroErrorMessage();
            response.put("currentState", "UNKNOWN");
            response.put("allowedRooms", new ArrayList<>());
            response.put("pendingRooms", new ArrayList<>());
            response.put("message", reason);
            if (traceId != null) {
                log.debug("[扫码·解析] trace={} 官方状态未知 id={} reason={}", traceId, userId, reason);
            }
        } else if (!noLeaveRooms.isEmpty() && !bypassNoLeave) {
            long tTranslate = System.currentTimeMillis();
            List<Map<String, Object>> finalPending = translateAndFilterRooms(noLeaveRooms);
            List<Map<String, Object>> finalAllowed = translateAndFilterRooms(allowedRooms);
            analyzeTimingTrace.step("mysql.translateAndFilterRooms(pending+allowed)",
                    System.currentTimeMillis() - tTranslate,
                    "pending=" + finalPending.size() + " allowed=" + finalAllowed.size());

            try {
                String todayStr = java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd"));
                applyDayTrajectoryRoomLocks(userId, todayStr + "%", finalAllowed, traceId);
                applyCampusEnterAdminLocks(finalAllowed, traceId);
            } catch (Exception e) {
                log.warn("[scan-status] day-trajectory-lock failed userId={} err={}", userId, e.getMessage());
            }

            response.put("currentState", "INSIDE");
            response.put("pendingRooms", finalPending);
            response.put("allowedRooms", finalAllowed);
        } else {
            long tTranslate = System.currentTimeMillis();
            List<Map<String, Object>> finalAllowed = translateAndFilterRooms(allowedRooms);
            analyzeTimingTrace.step("mysql.translateAndFilterRooms(allowed)",
                    System.currentTimeMillis() - tTranslate, "rows=" + finalAllowed.size());

            try {
                String todayStr = java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd"));
                long tLocks = System.currentTimeMillis();
                applyDayTrajectoryRoomLocks(userId, todayStr + "%", finalAllowed, traceId);
                analyzeTimingTrace.step("mysql.dayTrajectoryRoomLocks",
                        System.currentTimeMillis() - tLocks, "rooms=" + finalAllowed.size());
                long tCampus = System.currentTimeMillis();
                applyCampusEnterAdminLocks(finalAllowed, traceId);
                analyzeTimingTrace.step("mysql.campusEnterAdminLocks",
                        System.currentTimeMillis() - tCampus, "");
            } catch (Exception e) {
                log.warn("[scan-status] day-trajectory-lock failed userId={} err={}", userId, e.getMessage());
            }

            // 审查完毕，组装并放行给前端
            response.put("currentState", "OUTSIDE");
            response.put("allowedRooms", finalAllowed);

            if (!finalAllowed.isEmpty()) {
                CompletableFuture.runAsync(() -> {
                    try {
                        dashboardMapper.updateUserAllowedRoomsJson(userId, objectMapper.writeValueAsString(finalAllowed));
                    } catch (Exception e) {
                        log.warn("[scan-flow] persist-allowed-rooms failed userId={} err={}", userId, e.getMessage());
                    }
                });
            }
        }
        return response;
    }

    private static String joinRoomDisplayNames(List<Map<String, Object>> rooms) {
        if (rooms == null || rooms.isEmpty()) {
            return "无";
        }
        return rooms.stream()
                .map(TwinScanService::roomDisplayName)
                .distinct()
                .collect(Collectors.joining("、"));
    }

    private static String roomDisplayName(Map<String, Object> room) {
        if (room == null) {
            return "?";
        }
        Object dn = room.get("displayName");
        if (dn != null && !String.valueOf(dn).isBlank()) {
            return String.valueOf(dn).trim();
        }
        Object on = room.get("officialRoomName");
        if (on != null && !String.valueOf(on).isBlank()) {
            return String.valueOf(on).trim();
        }
        return "?";
    }

    /**
     * 🚀 扫码阶段 2：执行终极打卡操作 + 💥 立即同步流水 + 📢 瞬间推流前端！
     * 注意：本方法只负责官方登记与流水同步，不负责清理大华联动状态。
     * 调用方在 accessType=2 且登记成功后，必须执行 clearActivationStatesForUser(userId)。
     */
    // 💥 方法入参增加了 isShared 和 isKeep
    public boolean executeAccessAction(String userId, String officialRoomId, int accessType, boolean isShared, boolean isKeep, String dahuaSeq, boolean isBorrowedCard) {
        if (debugToggleService.getScanDataSource() == ScanDataSource.LOCAL) {
            return executeLocalAccess(userId, officialRoomId, accessType);
        }

        // 0. 离开前预同步本地流水，确保后续 predictActionReward 能找到今日 ENTER 记录
        if (accessType == 2) {
            try {
                miniPenetrationSyncService.syncLatestForUser(userId, null, 20, false);
            } catch (Exception syncEx) {
                log.debug("[scan·core] pre-exit sync failed userId={} err={}", userId, syncEx.getMessage());
            }
        }

        // 1. 发送打卡指令给官方
        boolean success = aroService.submitAccessRecord(userId, officialRoomId, accessType);
        if (!success && accessType == 2 && aroService.isNoLeaveRoomError()) {
            // 复核官方待离：真无待离房间才自愈；仍在场（或查询失败）则如实失败，杜绝"假离开"
            List<Map<String, Object>> noLeaveRooms = aroService.getNoLeaveRoom(userId);
            if (noLeaveRooms != null && noLeaveRooms.isEmpty()) {
                noLeaveBypassUntilMap.put(userId, System.currentTimeMillis() + 30_000L);
                log.debug("[扫码·登记] id={} 离开状态自愈（官方确认已无待离房间）", userId);
                return true;
            }
            return false;
        }
        if (success && accessType == 1) {
            // ENTER 成功后必须立刻取消旧的自愈放行，避免状态卡在 OUTSIDE
            noLeaveBypassUntilMap.remove(userId);
        }

        if (success) {
            try {
                twinAccessLogCorrelationService.registerPending(
                        accessType,
                        userId,
                        officialRoomId,
                        TwinAccessLogCorrelationService.SOURCE_WEB_SCAN,
                        null,
                        accessType == 1 ? "Web扫码进入（待官方流水对齐）" : "Web扫码离开（待官方流水对齐）",
                        "由孪生 Web 扫码发起 ARO 登记；官方流水批量入库后将自动合并溯源。"
                );
            } catch (Exception e) {
                log.debug("[scan] register correlation pending skip: {}", e.getMessage());
            }
            // 💥 2. 打卡成功！立刻开辟异步子线程拉取流水，绝不阻塞前端！
            CompletableFuture.runAsync(() -> {
                try {
                    // ⏳ 战术停顿：给官方服务器 1.5 秒的落盘时间，避免我们查得太快它还没存进去
                    Thread.sleep(1000);
                    // 轻量实时请求：每次动作拉取最新 20 条；用于补齐落库，瀑布仅推当前用户目标事件。
                    com.example.demo.modules.aro.dto.AroRecord targetRecord =
                            miniPenetrationSyncService.syncLatestForUser(userId, accessType, 20, true);

                    if (targetRecord != null) {
                        int sharedVal = isShared ? 1 : 0;
                        int keepVal = isKeep ? 1 : 0;
                        int borrowedVal = isBorrowedCard ? 1 : 0;
                        try {
                            dashboardMapper.updateAccessLogCardFlags(targetRecord.getId(), sharedVal, keepVal, borrowedVal);
                            String summary = accessType == 1 ? "Web扫码进入" : accessType == 2 ? "Web扫码离开" : "Web扫码登记";
                            StringBuilder det = new StringBuilder();
                            det.append("由 Web 扫码发起 ARO 登记，流水已同步；记录ID=").append(targetRecord.getId()).append("。");
                            if (isBorrowedCard) {
                                det.append("领用卡；");
                            }
                            if (isShared) {
                                det.append("共享卡；");
                            }
                            if (isKeep) {
                                det.append("保管卡；");
                            }
                            dashboardMapper.updateAccessLogFeedProvenance(
                                    String.valueOf(targetRecord.getId()),
                                    "WEB_SCAN",
                                    summary,
                                    det.toString(),
                                    null
                            );
                        } catch (Exception e) {
                            log.warn("[扫码·流水] id={} 标记失败 err={}", userId, e.getMessage());
                        }
                        ScanPopupFlowLog.logSync(
                                userId, accessType, true, targetRecord.getId(), isBorrowedCard, isShared, isKeep);
                    } else {
                        ScanPopupFlowLog.logSync(userId, accessType, false, null, isBorrowedCard, isShared, isKeep);
                    }
                } catch (Exception e) {
                    log.error("[扫码·流水] id={} 同步失败 err={}", userId, e.getMessage(), e);
                }
            });
        }

        return success;
    }

    private boolean executeLocalAccess(String userId, String roomId, int accessType) {
        AroRecord rec = new AroRecord();
        rec.setId("LOCAL-" + UUID.randomUUID().toString().replace("-", ""));
        rec.setAccessType(accessType);
        rec.setCreateTime(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
        rec.setUserId(userId);
        rec.setRoomId(roomId);
        try {
            RoomMappingRoom catalog = roomMappingRoomMapper.selectByRoomId(roomId);
            if (catalog != null && catalog.getRoomName() != null) {
                rec.setRoomName(catalog.getRoomName());
            }
        } catch (Exception e) {
            // 房间名查不到不影响直写
        }
        rec.setFeedSource("LOCAL_SCAN");
        rec.setFeedSummaryZh(accessType == 1 ? "Web扫码进入（本地直写）" : "Web扫码离开（本地直写）");
        rec.setFeedDetailZh("本地数据源模式：由孪生 Web 扫码直写本地流水，切回官方后自动对齐溯源。");
        try {
            aroDatabaseService.batchInsert(List.of(rec));
        } catch (Exception e) {
            log.error("[scan·本地直写] userId={} 写入失败 err={}", userId, e.getMessage(), e);
            return false;
        }
        try {
            twinAccessLogCorrelationService.registerPending(
                    accessType, userId, roomId,
                    TwinAccessLogCorrelationService.SOURCE_WEB_SCAN, null,
                    accessType == 1 ? "Web扫码进入（本地直写）" : "Web扫码离开（本地直写）",
                    "本地数据源模式：本地直写流水，切回官方后自动对齐溯源。");
        } catch (Exception e) {
            log.debug("[scan] local registerPending skip: {}", e.getMessage());
        }
        return true;
    }

    /**
     * 🛠️ 清洗过滤房间数据，并带上官方 {@code level}（数字越小权限越高）。
     */
    private List<Map<String, Object>> translateAndFilterRooms(List<Map<String, Object>> officialRooms) {
        examRoomPermissionSyncService.persistLevelsFromOfficialRoomPayload(officialRooms);
        List<Map<String, Object>> resultList = new ArrayList<>();

        for (Map<String, Object> room : officialRooms) {
            try {
                String roomId = room.get("id").toString();
                RoomDictionaryManager.RoomMapping mapping = dictionaryManager.translate(roomId);

                if (mapping != null) {
                    RoomMappingRoom catalog = roomMappingRoomMapper.selectByRoomId(roomId);
                    String campusTag = ScanCampusTagResolver.resolve(catalog, mapping.displayName);
                    Map<String, Object> cleanRoom = new HashMap<>();
                    cleanRoom.put("officialRoomId", roomId);
                    cleanRoom.put("displayName", mapping.displayName);
                    cleanRoom.put("floorName", mapping.floorName);
                    cleanRoom.put("officialRoomName", room.get("name"));
                    if (catalog != null && catalog.getRegionName() != null) {
                        cleanRoom.put("regionName", catalog.getRegionName());
                    }
                    if (!campusTag.isEmpty()) {
                        cleanRoom.put("campusTag", campusTag);
                    }
                    Integer lvl = examRoomPermissionSyncService.parseLevel(room.get("level"));
                    if (lvl != null) {
                        cleanRoom.put("officialPermissionLevel", lvl);
                    }
                    resultList.add(cleanRoom);
                }
            } catch (Exception e) {
                // 忽略解析错误
            }
        }
        return resultList;
    }

    /**
     * 今日已进入轨迹 + 房间登记等级：统一决定按钮是否可点（替代原先仅「浦西→禁浦东」的硬编码）。
     */
    private void applyDayTrajectoryRoomLocks(String userId, String todayPrefix, List<Map<String, Object>> rooms, String traceId) {
        if (rooms == null || rooms.isEmpty()) {
            return;
        }
        Map<String, Object> cnt = dashboardMapper.countTodayCampusEntries(userId, todayPrefix);
        int pudong = toCount(cnt.get("pudongCnt"));
        int puxi = toCount(cnt.get("puxiCnt"));
        Map<String, Object> lvlAgg = dashboardMapper.selectTodayOfficialLevelVisitAgg(userId, todayPrefix);
        Integer minVisitedLevel = intOrNull(lvlAgg != null ? lvlAgg.get("minLvl") : null);
        Integer maxVisitedLevel = intOrNull(lvlAgg != null ? lvlAgg.get("maxLvl") : null);
        Integer catalogGlobalMax = roomMappingRoomMapper.selectMaxOfficialPermissionLevelInCatalog();
        Integer nextStricterBelowSingleton = null;
        if (minVisitedLevel != null && maxVisitedLevel != null
                && minVisitedLevel.equals(maxVisitedLevel)
                && catalogGlobalMax != null
                && minVisitedLevel.equals(catalogGlobalMax)) {
            nextStricterBelowSingleton = roomMappingRoomMapper.selectMaxStrictLevelStrictlyBelow(minVisitedLevel);
        }

        for (Map<String, Object> room : rooms) {
            String roomName = String.valueOf(room.get("displayName"));
            boolean pudongTarget = roomName.contains("浦东");
            boolean puxiTarget = roomName.contains("浦西");

            boolean disabled = false;
            StringBuilder reason = new StringBuilder();
            if (puxi > 0 && pudongTarget) {
                disabled = true;
                reason.append("今日已到浦西，浦东房间不可再选");
            }
            if (pudong > 0 && puxiTarget) {
                if (disabled) {
                    reason.append("；");
                }
                disabled = true;
                reason.append("今日已到浦东，浦西房间不可再选");
            }
            Object lvObj = room.get("officialPermissionLevel");
            if (lvObj instanceof Number && minVisitedLevel != null && maxVisitedLevel != null) {
                int cand = ((Number) lvObj).intValue();
                boolean levelBlock = shouldBlockCandidateByTodayLevelRule(
                        cand,
                        minVisitedLevel,
                        maxVisitedLevel,
                        catalogGlobalMax,
                        nextStricterBelowSingleton);
                if (levelBlock) {
                    if (disabled) {
                        reason.append("；");
                    }
                    disabled = true;
                    reason.append("今日已进入轨迹与房间库等级规则不允许再选该房间");
                }
            }
            room.put("isDisabled", disabled);
            if (disabled) {
                room.put("disableReason", reason.toString());
                if (traceId != null) {
                    log.debug("[扫码·解析] trace={} 房间锁定 id={} room={} reason={}", traceId, userId, roomName, reason);
                }
            } else {
                room.put("disableReason", null);
            }
        }
    }

    /**
     * 系统设置：禁用某校区「进入」按钮（仅影响场外可进列表，不影响离开）。
     */
    private void applyCampusEnterAdminLocks(List<Map<String, Object>> rooms, String traceId) {
        if (rooms == null || rooms.isEmpty()) {
            return;
        }
        boolean blockPd = scanCampusEnterConfigService.isPudongEnterBlocked();
        boolean blockPx = scanCampusEnterConfigService.isPuxiEnterBlocked();
        if (!blockPd && !blockPx) {
            return;
        }
        for (Map<String, Object> room : rooms) {
            String campus = room.get("campusTag") != null ? String.valueOf(room.get("campusTag")).trim() : "";
            if (campus.isEmpty()) {
                campus = ScanCampusTagResolver.resolveFromText(String.valueOf(room.get("displayName")));
            }
            boolean block = ("浦东".equals(campus) && blockPd) || ("浦西".equals(campus) && blockPx);
            if (!block) {
                continue;
            }
            room.put("enterBlocked", true);
            room.put("enterBlockReason", "不在此校区");
            if (traceId != null) {
                log.debug("[扫码·解析] trace={} 校区禁入 room={} campus={}", traceId, room.get("displayName"), campus);
            }
        }
    }

    private static int toCount(Object v) {
        if (v == null) {
            return 0;
        }
        if (v instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static Integer intOrNull(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * 等级数字越小权限越高；比较与锁定均基于 {@code room_mapping_room.official_permission_level}（同步全员档案/扫码拉官方接口写入）。
     * <ul>
     *     <li>今日已进入过多种等级：不能再选比「当日已进最严」更严的房间（candidate &lt; minVisited）。</li>
     *     <li>今日仅一种等级 L：若 L 等于库中已同步等级里的<strong>全局最松</strong>（MAX），则允许再往严<strong>一档</strong>——
     *     该档为库中 {@code MAX(level) WHERE level &lt; L}；无则更严者一律 candidate &lt; L 禁入。
     *     若 L 不是全局最松，则一律 candidate &lt; L 禁入。</li>
     * </ul>
     */
    static boolean shouldBlockCandidateByTodayLevelRule(
            int candidateLevel,
            int minVisited,
            int maxVisited,
            Integer catalogGlobalMax,
            Integer nextStricterBelowSingleton) {
        if (maxVisited > minVisited) {
            return candidateLevel < minVisited;
        }
        int l = minVisited;
        if (catalogGlobalMax != null && Objects.equals(l, catalogGlobalMax)) {
            if (nextStricterBelowSingleton != null) {
                return candidateLevel < nextStricterBelowSingleton;
            }
            return candidateLevel < l;
        }
        return candidateLevel < l;
    }
}