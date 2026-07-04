package com.example.demo.common.component;

import com.corundumstudio.socketio.SocketIOClient;
import com.corundumstudio.socketio.SocketIOServer;
import com.corundumstudio.socketio.listener.ConnectListener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Map;

/**
 * WebSocket 连接时比对客户端版本号与后端期望版本。
 * 不一致则向该客户端发送 CLIENT_FORCE_RELOAD，触发页面自动刷新以加载最新前端资源。
 * <p>
 * 配置 {@code app.frontend.expected-version} 留空则不校验。
 */
@Component
public class FrontendVersionGuard {

    private static final Logger log = LoggerFactory.getLogger(FrontendVersionGuard.class);

    public static final String EVENT_CLIENT_FORCE_RELOAD = "CLIENT_FORCE_RELOAD";

    private final SocketIOServer socketIOServer;

    @Value("${app.frontend.expected-version:}")
    private String expectedVersion;

    public FrontendVersionGuard(SocketIOServer socketIOServer) {
        this.socketIOServer = socketIOServer;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void register() {
        if (expectedVersion == null || expectedVersion.isBlank()) {
            log.info("[FrontendVersionGuard] app.frontend.expected-version 未配置，跳过版本校验");
            return;
        }

        socketIOServer.addConnectListener(client -> {
            String clientVersion = client.getHandshakeData().getSingleUrlParam("v");
            if (clientVersion == null || clientVersion.isBlank()) {
                // 旧客户端未携带版本号 → 不强制刷新（向后兼容）
                return;
            }
            if (!expectedVersion.equals(clientVersion)) {
                log.info("[FrontendVersionGuard] 客户端版本 {} != 期望版本 {}，通知刷新 (sessionId={})",
                        clientVersion, expectedVersion, client.getSessionId());
                Map<String, Object> payload = Map.of(
                        "reason", "version-mismatch",
                        "clientVersion", clientVersion,
                        "expectedVersion", expectedVersion,
                        "at", Instant.now().toString()
                );
                client.sendEvent(EVENT_CLIENT_FORCE_RELOAD, payload);
            }
        });

        log.info("[FrontendVersionGuard] 已注册版本校验 (expected={})", expectedVersion);
    }
}
