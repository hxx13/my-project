package com.example.demo.modules.twin.service;

import com.corundumstudio.socketio.SocketIOServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;

/**
 * 通过 Socket.IO 通知所有已连接的前端页面执行 {@code location.reload()}（用于部署新静态资源后刷新大屏等）。
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
     * @return 广播载荷（含触发时间）
     */
    public Map<String, Object> broadcastForceReload(String operatorUserId) {
        String at = Instant.now().toString();
        String uid = operatorUserId != null ? operatorUserId.trim() : "";
        Map<String, Object> payload = Map.of(
                "reason", "admin",
                "at", at,
                "operatorUserId", uid
        );
        socketIOServer.getBroadcastOperations().sendEvent(EVENT_CLIENT_FORCE_RELOAD, payload);
        log.info("[client-reload] broadcast CLIENT_FORCE_RELOAD operatorUserId={} at={}", uid, at);
        return payload;
    }
}
