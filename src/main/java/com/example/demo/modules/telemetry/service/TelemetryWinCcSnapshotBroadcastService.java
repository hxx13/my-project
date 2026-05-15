package com.example.demo.modules.telemetry.service;

import com.corundumstudio.socketio.SocketIOServer;
import com.example.demo.modules.telemetry.dto.TelemetryTagItemDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * WinCC 内存快照变更后广播到 Web（Socket.IO），与前端 React Query 缓存对齐：
 * <ul>
 *   <li>定点合并（如当前分区 10s、写入校验）：{@link #broadcastTagDelta(List)} → 前端就地合并行；</li>
 *   <li>定时全量 {@code refreshFromWinCc}：{@link #broadcastFullSnapshotRefreshed()} → 前端与 pollIntervalMs 拉取同源 invalidate。</li>
 * </ul>
 */
@Service
public class TelemetryWinCcSnapshotBroadcastService {

    private static final Logger log = LoggerFactory.getLogger(TelemetryWinCcSnapshotBroadcastService.class);

    public static final String EVENT_TAG_DELTA = "TELEMETRY_ANIMAL_ROOM_TAG_DELTA";
    /** 与 GET /animal-room（sync=false）同源：提示浏览器拉最新组装页 */
    public static final String EVENT_SNAPSHOT_FULL = "TELEMETRY_ANIMAL_ROOM_SNAPSHOT_FULL";

    private final SocketIOServer socketIOServer;

    public TelemetryWinCcSnapshotBroadcastService(SocketIOServer socketIOServer) {
        this.socketIOServer = socketIOServer;
    }

    public void broadcastTagDelta(List<TelemetryTagItemDto> items) {
        if (items == null || items.isEmpty()) {
            return;
        }
        try {
            socketIOServer.getBroadcastOperations().sendEvent(EVENT_TAG_DELTA, Map.of("items", items));
        } catch (Exception e) {
            log.warn("[WinCC遥测] Socket 广播 TAG_DELTA 失败: {}", e.getMessage());
        }
    }

    public void broadcastFullSnapshotRefreshed() {
        try {
            socketIOServer.getBroadcastOperations().sendEvent(EVENT_SNAPSHOT_FULL, Collections.emptyMap());
        } catch (Exception e) {
            log.warn("[WinCC遥测] Socket 广播 SNAPSHOT_FULL 失败: {}", e.getMessage());
        }
    }
}
