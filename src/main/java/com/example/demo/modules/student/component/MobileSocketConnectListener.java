package com.example.demo.modules.student.component;

import com.corundumstudio.socketio.SocketIOServer;
import com.example.demo.modules.student.service.MobileUserSocketPushService;
import com.example.demo.modules.student.service.StudentMobileTokenService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 手机 HTML5 WebSocket：携带 mobileToken 时加入用户专属 room，接收 MOBILE_USER_NOTIFY。
 */
@Component
public class MobileSocketConnectListener {

    private static final Logger log = LoggerFactory.getLogger(MobileSocketConnectListener.class);

    private final SocketIOServer socketIOServer;
    private final StudentMobileTokenService tokenService;
    private final MobileUserSocketPushService pushService;

    public MobileSocketConnectListener(SocketIOServer socketIOServer,
                                       StudentMobileTokenService tokenService,
                                       MobileUserSocketPushService pushService) {
        this.socketIOServer = socketIOServer;
        this.tokenService = tokenService;
        this.pushService = pushService;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void registerConnectListener() {
        socketIOServer.addConnectListener(client -> {
            String channel = client.getHandshakeData().getSingleUrlParam("channel");
            if (!"mobile".equals(channel)) {
                return;
            }
            String mobileToken = client.getHandshakeData().getSingleUrlParam("mobileToken");
            if (mobileToken == null || mobileToken.isBlank()) {
                return;
            }
            try {
                String userId = tokenService.resolveUserIdByToken(mobileToken.trim());
                pushService.joinUserRoom(client, userId);
                log.info("[MobileSocket] 用户 {} 已订阅个人通知", userId);
            } catch (Exception e) {
                log.warn("[MobileSocket] mobileToken 校验失败，不加入用户 room: {}", e.getMessage());
            }
        });
    }
}
