package com.example.demo.modules.aro.service;

import com.corundumstudio.socketio.SocketIOServer;
import com.example.demo.common.component.SocketRoomAssigner;
import com.example.demo.common.dto.UniversalEvent;
import com.example.demo.modules.aro.dto.AroRecord;
import com.example.demo.modules.twin.common.component.RoomNormalizer;
import com.example.demo.modules.twin.common.support.AccessLogFeedProvenanceBuilder;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class RealtimeFeedPushService {

    private final SocketIOServer socketServer;
    private final RealtimeEventDedupService realtimeEventDedupService;
    private final RoomNormalizer roomNormalizer;

    public RealtimeFeedPushService(SocketIOServer socketServer,
                                   RealtimeEventDedupService realtimeEventDedupService,
                                   RoomNormalizer roomNormalizer) {
        this.socketServer = socketServer;
        this.realtimeEventDedupService = realtimeEventDedupService;
        this.roomNormalizer = roomNormalizer;
    }

    public void pushRecords(List<AroRecord> records) {
        for (AroRecord record : records) {
            String recordId = String.valueOf(record.getId());
            if (realtimeEventDedupService.shouldSkipSyncPush(recordId)) {
                continue;
            }
            UniversalEvent event = new UniversalEvent();
            event.setEventId("ARO-" + record.getId());
            event.setSource("ARO");
            event.setCategory("ACCESS");
            event.setTimestamp(record.getCreateTime());

            String standardAction = "UNKNOWN";
            String rawMessage = "未知状态";
            if (record.getAccessType() != null) {
                if (record.getAccessType() == 1) { standardAction = "ENTER"; rawMessage = "合法进入"; }
                else if (record.getAccessType() == 2) { standardAction = "EXIT"; rawMessage = "合法离开"; }
                else if (record.getAccessType() == 0) { standardAction = "WARN"; rawMessage = "进入未离开"; }
            }
            event.setAction(standardAction);

            UniversalEvent.PersonInfo person = new UniversalEvent.PersonInfo();
            person.setUserId(record.getUserId());
            person.setName(record.getName());
            person.setRole(record.getUserTypeNames());
            person.setGroup(record.getProjectGroupNames());
            event.setPerson(person);

            UniversalEvent.LocationInfo location = new UniversalEvent.LocationInfo();
            location.setCampus(record.getAreaName());
            location.setFloor(record.getFloorName());
            location.setRoom(roomNormalizer.normalize(record.getRoomName()));
            location.setRoomId(record.getRoomId());
            event.setLocation(location);

            UniversalEvent.OriginalData original = new UniversalEvent.OriginalData();
            original.setRawStatusCode(String.valueOf(record.getAccessType()));
            original.setMessage(rawMessage);
            event.setOriginalData(original);
            event.setFeedProvenance(AccessLogFeedProvenanceBuilder.fromAroRecord(record));

            socketServer.getRoomOperations(SocketRoomAssigner.ROOM_CONSOLE_LIVE).sendEvent("TWIN_GLOBAL_EVENT", event);
        }
    }
}
