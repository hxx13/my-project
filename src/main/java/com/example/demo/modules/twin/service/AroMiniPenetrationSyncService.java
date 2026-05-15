package com.example.demo.modules.twin.service;

import com.corundumstudio.socketio.SocketIOServer;
import com.example.demo.common.dto.UniversalEvent;
import com.example.demo.modules.aro.dto.AroRecord;
import com.example.demo.modules.aro.service.AroDatabaseService;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.aro.service.RealtimeEventDedupService;
import com.example.demo.modules.twin.support.AccessLogFeedProvenanceBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;

@Service
public class AroMiniPenetrationSyncService {
    private static final Logger log = LoggerFactory.getLogger(AroMiniPenetrationSyncService.class);

    private final AroService aroService;
    private final AroDatabaseService aroDatabaseService;
    private final RealtimeEventDedupService realtimeEventDedupService;
    private final SocketIOServer socketIOServer;
    private final TwinDashboardService twinDashboardService;

    public AroMiniPenetrationSyncService(AroService aroService,
                                         AroDatabaseService aroDatabaseService,
                                         RealtimeEventDedupService realtimeEventDedupService,
                                         SocketIOServer socketIOServer,
                                         TwinDashboardService twinDashboardService) {
        this.aroService = aroService;
        this.aroDatabaseService = aroDatabaseService;
        this.realtimeEventDedupService = realtimeEventDedupService;
        this.socketIOServer = socketIOServer;
        this.twinDashboardService = twinDashboardService;
    }

    public AroRecord syncLatestForUser(String userId, Integer expectedAccessType, int limit, boolean pushPie) {
        List<AroRecord> latest = aroService.fetchLatestRecordsForRealtime(limit);
        int size = latest == null ? 0 : latest.size();
        if (size <= 0) {
            return null;
        }
        aroDatabaseService.batchInsert(latest);
        latest.sort(Comparator.comparing(r -> r == null || r.getCreateTime() == null ? "" : r.getCreateTime()));
        AroRecord target = pickLatestTarget(latest, userId, expectedAccessType);
        if (target != null && target.getId() != null) {
            String recordId = String.valueOf(target.getId());
            if (!realtimeEventDedupService.shouldSkipSyncPush(recordId)) {
                socketIOServer.getBroadcastOperations().sendEvent("TWIN_GLOBAL_EVENT", toEvent(target));
            }
        }
        if (pushPie) {
            try {
                socketIOServer.getBroadcastOperations().sendEvent("TWIN_PIE_UPDATE", twinDashboardService.getTodayRoomStats());
            } catch (Exception e) {
                log.warn("[mini-penetration] pie-push failed userId={} err={}", userId, e.getMessage());
            }
        }
        return target;
    }

    private AroRecord pickLatestTarget(List<AroRecord> latest, String userId, Integer expectedAccessType) {
        if (latest == null || latest.isEmpty()) {
            return null;
        }
        AroRecord fallback = null;
        for (int i = latest.size() - 1; i >= 0; i--) {
            AroRecord r = latest.get(i);
            if (r == null) continue;
            String uid = r.getUserId() == null ? "" : String.valueOf(r.getUserId()).trim();
            if (!userId.equals(uid)) continue;
            if (fallback == null) fallback = r;
            Integer accessType = r.getAccessType();
            if (expectedAccessType == null || (accessType != null && accessType.equals(expectedAccessType))) {
                return r;
            }
        }
        return fallback;
    }

    private UniversalEvent toEvent(AroRecord record) {
        UniversalEvent event = new UniversalEvent();
        event.setEventId("ARO-MINI-" + record.getId());
        event.setSource("ARO");
        event.setCategory("ACCESS");
        event.setTimestamp(record.getCreateTime());
        String action = "UNKNOWN";
        String rawMessage = "未知状态";
        if (record.getAccessType() != null) {
            if (record.getAccessType() == 1) {
                action = "ENTER";
                rawMessage = "合法进入";
            } else if (record.getAccessType() == 2) {
                action = "EXIT";
                rawMessage = "合法离开";
            } else if (record.getAccessType() == 0) {
                action = "WARN";
                rawMessage = "进入未离开";
            }
        }
        event.setAction(action);
        UniversalEvent.PersonInfo person = new UniversalEvent.PersonInfo();
        person.setUserId(record.getUserId());
        person.setName(record.getName());
        person.setRole(record.getUserTypeNames());
        person.setGroup(record.getProjectGroupNames());
        event.setPerson(person);
        UniversalEvent.LocationInfo location = new UniversalEvent.LocationInfo();
        location.setCampus(record.getAreaName());
        location.setFloor(record.getFloorName());
        location.setRoom(record.getRoomName());
        location.setRoomId(record.getRoomId());
        event.setLocation(location);
        UniversalEvent.OriginalData original = new UniversalEvent.OriginalData();
        original.setRawStatusCode(String.valueOf(record.getAccessType()));
        original.setMessage(rawMessage);
        event.setOriginalData(original);
        event.setFeedProvenance(AccessLogFeedProvenanceBuilder.fromAroRecord(record));
        return event;
    }
}
