package com.example.demo.modules.twin.common.service;

import com.corundumstudio.socketio.SocketIOClient;
import com.corundumstudio.socketio.SocketIOServer;
import com.corundumstudio.socketio.listener.ConnectListener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import javax.annotation.PreDestroy;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;

/**
 * 通过 Socket.IO 通知所有已连接的前端页面执行 {@code location.reload()}（用于部署新静态资源后刷新大屏等）。
 * <p>
 * 内置"待处理重载"机制：广播后 5 分钟内新连上的客户端会自动补发 CLIENT_FORCE_RELOAD，
 * 解决后端重启后客户端重连退避期间错过广播的问题。
 */
@Service
public class ClientReloadBroadcastService {

    public static final String EVENT_CLIENT_FORCE_RELOAD = "CLIENT_FORCE_RELOAD";

    /** 广播后多长时间内新连上的客户端会补收 reload 指令 */
    private static final long RELOAD_WINDOW_MINUTES = 5;

    private static final Logger log = LoggerFactory.getLogger(ClientReloadBroadcastService.class);

    private final SocketIOServer socketIOServer;

    /**
     * 最近一次广播请求的时间戳（volatile 保证多线程可见）。
     * null 表示当前没有待处理的重载请求。
     */
    private volatile Instant reloadRequestedAt = null;

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

        // 1. 先记录时间戳，保证后续 ConnectListener 能检测到
        reloadRequestedAt = Instant.now();

        // 2. 广播给当前已连接的客户端
        socketIOServer.getBroadcastOperations().sendEvent(EVENT_CLIENT_FORCE_RELOAD, payload);
        log.info("[client-reload] broadcast CLIENT_FORCE_RELOAD operatorUserId={} at={}", uid, at);
        return payload;
    }

    /**
     * 注册 ConnectListener：新客户端连上时，如果距离上次广播在窗口期内，补发 reload 指令。
     * 通过 {@link ApplicationReadyEvent} 确保在 Socket.IO Server 启动后注册。
     */
    @EventListener(ApplicationReadyEvent.class)
    public void registerConnectListener() {
        socketIOServer.addConnectListener(client -> {
            Instant requestedAt = reloadRequestedAt;
            if (requestedAt == null) return;

            // 跳过 mobile channel（手机端 HTML5 页面不需要 reload）
            String channel = client.getHandshakeData().getSingleUrlParam("channel");
            if ("mobile".equals(channel)) return;

            // 检查窗口期是否已过
            if (requestedAt.plus(RELOAD_WINDOW_MINUTES, ChronoUnit.MINUTES).isBefore(Instant.now())) {
                reloadRequestedAt = null;
                return;
            }

            // 窗口期内 → 向该客户端补发 reload 指令
            Map<String, Object> payload = Map.of(
                    "reason", "admin-pending",
                    "at", Instant.now().toString(),
                    "requestedAt", requestedAt.toString()
            );
            client.sendEvent(EVENT_CLIENT_FORCE_RELOAD, payload);
            log.info("[client-reload] pending reload delivered to sessionId={} (requestedAt={})",
                    client.getSessionId(), requestedAt);
        });

        log.info("[client-reload] ConnectListener 已注册（pending reload 窗口 {} 分钟）", RELOAD_WINDOW_MINUTES);
    }

    /** 查询当前是否有待处理的重载请求（监控用） */
    public boolean isReloadPending() {
        Instant requestedAt = reloadRequestedAt;
        if (requestedAt == null) return false;
        if (requestedAt.plus(RELOAD_WINDOW_MINUTES, ChronoUnit.MINUTES).isBefore(Instant.now())) {
            reloadRequestedAt = null;
            return false;
        }
        return true;
    }

    @PreDestroy
    public void cleanup() {
        reloadRequestedAt = null;
    }
}
