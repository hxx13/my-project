package com.example.demo.modules.twin.scan.state;

import com.example.demo.modules.twin.scan.mapper.ScanOccupancyStateMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
public class ScanOccupancyStateService {

    public static final String STATE_INSIDE = "INSIDE";
    public static final String STATE_OUTSIDE = "OUTSIDE";

    private final ScanOccupancyStateMapper mapper;

    public ScanOccupancyStateService(ScanOccupancyStateMapper mapper) {
        this.mapper = mapper;
    }

    public static ScanOccupancyState buildInside(String userId, String roomId, String roomName, String enterLogId, LocalDateTime now) {
        ScanOccupancyState row = new ScanOccupancyState();
        row.setUserId(userId);
        row.setState(STATE_INSIDE);
        row.setCurrentRoomId(roomId);
        row.setCurrentRoomName(roomName);
        row.setEnterLogId(enterLogId);
        row.setUpdatedAt(now);
        return row;
    }

    public static ScanOccupancyState buildOutside(String userId, LocalDateTime now) {
        ScanOccupancyState row = new ScanOccupancyState();
        row.setUserId(userId);
        row.setState(STATE_OUTSIDE);
        row.setCurrentRoomId(null);
        row.setCurrentRoomName(null);
        row.setEnterLogId(null);
        row.setUpdatedAt(now);
        return row;
    }

    public ScanOccupancyState getByUserId(String userId) {
        return mapper.selectByUserId(userId);
    }

    public void markInside(String userId, String roomId, String roomName, String enterLogId) {
        mapper.upsert(buildInside(userId, roomId, roomName, enterLogId, LocalDateTime.now()));
    }

    public void markOutside(String userId) {
        mapper.upsert(buildOutside(userId, LocalDateTime.now()));
    }
}
