package com.example.demo.modules.twin.common.service;

import com.corundumstudio.socketio.SocketIOServer;
import com.example.demo.common.component.SocketRoomAssigner;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 通过 Socket.IO Room 通知 {@code reload:web} room 中的所有 web 客户端执行页面刷新。
 * <p>
 * 简化版：移除了 ConnectListener/pending-window/过期清理——Room Pub/Sub 保证了
 * 消息只投递给当前在 room 中的客户端，不再需要补发机制。
 */
@Service
public class ClientReloadBroadcastService {

    public static final String EVENT_CLIENT_FORCE_RELOAD = "CLIENT_FORCE_RELOAD";

    private static final Logger log = LoggerFactory.getLogger(ClientReloadBroadcastService.class);

    private final SocketIOServer socketIOServer;

    public ClientReloadBroadcastService(SocketIOServer socketIOServer) {
        this.socketIOServer = socketIOServer;
    }

    /**
     * @param operatorUserId 触发人用户 ID（审计用）
     * @param reloadId       客户端版本 reload 序号
     * @return 广播载荷（含触发时间）
     */
    public Map<String, Object> broadcastForceReload(String operatorUserId, long reloadId) {
        String at = Instant.now().toString();
        String uid = operatorUserId != null ? operatorUserId.trim() : "";
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("reason", "admin");
        payload.put("at", at);
        payload.put("operatorUserId", uid);
        payload.put("reloadId", reloadId);

        socketIOServer.getRoomOperations(SocketRoomAssigner.ROOM_RELOAD_WEB)
                .sendEvent(EVENT_CLIENT_FORCE_RELOAD, payload);
        log.info("[client-reload] broadcast to reload:web operatorUserId={} at={}", uid, at);
        return payload;
    }
}
