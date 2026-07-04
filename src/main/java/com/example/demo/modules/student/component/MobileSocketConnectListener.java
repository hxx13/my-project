package com.example.demo.modules.student.component;

import com.corundumstudio.socketio.SocketIOServer;
import com.example.demo.common.config.JwtTokenService;
import com.example.demo.modules.auth.entity.User;
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
    private final JwtTokenService jwtTokenService;

    public MobileSocketConnectListener(SocketIOServer socketIOServer,
                                       StudentMobileTokenService tokenService,
                                       MobileUserSocketPushService pushService,
                                       JwtTokenService jwtTokenService) {
        this.socketIOServer = socketIOServer;
        this.tokenService = tokenService;
        this.pushService = pushService;
        this.jwtTokenService = jwtTokenService;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void registerConnectListener() {
        socketIOServer.addConnectListener(client -> {
            String channel = client.getHandshakeData().getSingleUrlParam("channel");
            if ("mobile".equals(channel)) {
                String mobileToken = client.getHandshakeData().getSingleUrlParam("mobileToken");
                if (mobileToken == null || mobileToken.isBlank()) {
                    return;
                }
                try {
                    String userId = tokenService.resolveUserIdByToken(mobileToken.trim());
                    pushService.joinUserRoom(client, userId);
                    log.info("[MobileSocket] mobileToken 用户 {} 已订阅个人通知", userId);
                } catch (Exception e) {
                    log.warn("[MobileSocket] mobileToken 校验失败，不加入用户 room: {}", e.getMessage());
                }
                return;
            }

            // JWT 模式（小程序 / JWT H5）：channel=student + token
            String jwt = client.getHandshakeData().getSingleUrlParam("token");
            if (jwt == null || jwt.isBlank()) {
                return;
            }
            User user = jwtTokenService.validateTokenAndResolveUser(jwt.trim());
            if (user == null || user.getId() == null || user.getId().isBlank()) {
                log.warn("[MobileSocket] JWT 无效，不加入用户 room");
                return;
            }
            pushService.joinUserRoom(client, user.getId());
            log.info("[MobileSocket] JWT 用户 {} 已订阅个人通知", user.getId());
        });
    }
}
