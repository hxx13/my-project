package com.example.demo.common.component;

import com.corundumstudio.socketio.SocketIOServer;
import com.corundumstudio.socketio.listener.ConnectListener;
import com.example.demo.common.config.JwtTokenService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.student.service.MobileUserSocketPushService;
import com.example.demo.modules.student.service.StudentMobileTokenService;
import com.example.demo.modules.twin.common.service.ClientVersionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * WebSocket 客户端连接时的 Room 分配器。
 * <p>
 * 合并了原有的 FrontendVersionGuard、ClientReloadBroadcastService.registerConnectListener、
 * MobileSocketConnectListener 三个独立 ConnectListener——它们通过
 * {@code @EventListener(ApplicationReadyEvent.class)} 注册，Spring 不保证执行顺序。
 * 现在所有 room 加入逻辑在一个确定性的分支中完成。
 * <p>
 * Room 映射：
 * <ul>
 *   <li>{@code channel=mobile} → mobile:broadcast + mobile_user:{id}（仅此而已）</li>
 *   <li>{@code channel=student} + JWT → mobile_user:{id}（仅此而已）</li>
 *   <li>其他所有类型 → reload:web + console:live</li>
 * </ul>
 */
@Component
public class SocketRoomAssigner {

    public static final String ROOM_RELOAD_WEB = "reload:web";
    public static final String ROOM_CONSOLE_LIVE = "console:live";
    public static final String ROOM_MOBILE_BROADCAST = "mobile:broadcast";

    private static final Logger log = LoggerFactory.getLogger(SocketRoomAssigner.class);

    private final SocketIOServer socketIOServer;
    private final ClientVersionService clientVersionService;
    private final MobileUserSocketPushService pushService;
    private final StudentMobileTokenService mobileTokenService;
    private final JwtTokenService jwtTokenService;

    public SocketRoomAssigner(SocketIOServer socketIOServer,
                              ClientVersionService clientVersionService,
                              MobileUserSocketPushService pushService,
                              StudentMobileTokenService mobileTokenService,
                              JwtTokenService jwtTokenService) {
        this.socketIOServer = socketIOServer;
        this.clientVersionService = clientVersionService;
        this.pushService = pushService;
        this.mobileTokenService = mobileTokenService;
        this.jwtTokenService = jwtTokenService;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void register() {
        socketIOServer.addConnectListener(client -> {
            String channel = client.getHandshakeData().getSingleUrlParam("channel");

            // ── mobile channel: 加入广播 + 个人 room ──
            if ("mobile".equals(channel)) {
                client.joinRoom(ROOM_MOBILE_BROADCAST);
                String mobileToken = client.getHandshakeData().getSingleUrlParam("mobileToken");
                if (mobileToken != null && !mobileToken.isBlank()) {
                    try {
                        String userId = mobileTokenService.resolveUserIdByToken(mobileToken.trim());
                        client.joinRoom(MobileUserSocketPushService.roomForUser(userId));
                        log.info("[RoomAssigner] mobile 用户 {} 已加入个人 room", userId);
                    } catch (Exception e) {
                        log.warn("[RoomAssigner] mobileToken 校验失败: {}", e.getMessage());
                    }
                }
                return; // ← mobile 不加入 reload:web / console:live
            }

            // ── student channel (小程序/JWT H5): 仅加入个人 room ──
            if ("student".equals(channel)) {
                String jwt = client.getHandshakeData().getSingleUrlParam("token");
                if (jwt != null && !jwt.isBlank()) {
                    User user = jwtTokenService.validateTokenAndResolveUser(jwt.trim());
                    if (user != null && user.getId() != null && !user.getId().isBlank()) {
                        client.joinRoom(MobileUserSocketPushService.roomForUser(user.getId()));
                        log.info("[RoomAssigner] student JWT 用户 {} 已加入个人 room", user.getId());
                    }
                }
                return; // ← student 不加入 reload:web / console:live
            }

            // ── web client (后台管理页面): 加入所有 web room ──
            client.joinRoom(ROOM_RELOAD_WEB);
            client.joinRoom(ROOM_CONSOLE_LIVE);

            // 版本不匹配检测（原 FrontendVersionGuard 逻辑）
            String clientVersion = client.getHandshakeData().getSingleUrlParam("v");
            String expected = clientVersionService.getExpectedBuildId();
            if (clientVersion != null && !clientVersion.isBlank()
                    && expected != null && !"unknown".equals(expected)
                    && !expected.equals(clientVersion)) {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("reason", "version-mismatch");
                payload.put("clientVersion", clientVersion);
                payload.put("expectedBuildId", expected);
                payload.put("reloadId", clientVersionService.getCurrentReloadId());
                payload.put("at", Instant.now().toString());
                client.sendEvent("CLIENT_FORCE_RELOAD", payload);
                log.info("[RoomAssigner] 版本不匹配 client={} expected={} sessionId={}",
                        clientVersion, expected, client.getSessionId());
            }
        });

        log.info("[RoomAssigner] 已注册，rooms: {}, {}, {}, {}",
                ROOM_RELOAD_WEB, ROOM_CONSOLE_LIVE, ROOM_MOBILE_BROADCAST,
                MobileUserSocketPushService.ROOM_PREFIX + "{userId}");
    }
}
