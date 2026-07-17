package com.example.demo.common.component;

import com.corundumstudio.socketio.SocketIOClient;
import com.corundumstudio.socketio.SocketIOServer;
import com.example.demo.common.config.JwtTokenService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.student.service.MobileUserSocketPushService;
import com.example.demo.modules.student.service.StudentMobileTokenService;
import com.example.demo.modules.twin.common.service.ClientVersionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * WebSocket 客户端连接时的 Room 分配器。
 * <p>
 * 合并了原有的 FrontendVersionGuard、ClientReloadBroadcastService.registerConnectListener、
 * MobileSocketConnectListener 三个独立 ConnectListener。
 * <p>
 * <b>注册时机（重要）</b>：必须在 {@code @PostConstruct} 中注册，而不是
 * {@code ApplicationReadyEvent}。Socket.IO 端口由 {@code SocketIOStartupRunner}
 * （ApplicationRunner，order=5）在 context refresh 之后、ApplicationReadyEvent 之前打开——
 * 若监听器在 ApplicationReadyEvent 才注册，重启期间持续重试的客户端会在
 * 端口开放到监听器注册之间的窗口内完成握手，从而不加入任何 room，
 * 永久收不到所有 room 定向广播。@PostConstruct 在 Bean 构造期执行，
 * 严格早于任何 ApplicationRunner，窗口不存在。
 * <p>
 * Room 映射：
 * <ul>
 *   <li>{@code channel=mobile} → mobile:broadcast + mobile_user:{id}（仅此而已）</li>
 *   <li>{@code channel=student} + JWT → mobile_user:{id}（仅此而已）</li>
 *   <li>其他所有类型 → reload:web + console:live</li>
 * </ul>
 * <p>
 * 自愈兜底：room 分配完成后向客户端发送 {@code ROOM_ACK}（含 bootId + rooms）；
 * 客户端若在连接后未收到 ACK，可发送 {@code ROOM_RESYNC} 请求重新分配
 * （{@link #assignRooms} 幂等，joinRoom 重复调用无害）。
 */
@Component
public class SocketRoomAssigner {

    public static final String ROOM_RELOAD_WEB = "reload:web";
    public static final String ROOM_CONSOLE_LIVE = "console:live";
    public static final String ROOM_MOBILE_BROADCAST = "mobile:broadcast";

    /** room 分配完成后推送给客户端的确认事件 */
    public static final String EVENT_ROOM_ACK = "ROOM_ACK";
    /** 客户端请求重新分配 room 的事件 */
    public static final String EVENT_ROOM_RESYNC = "ROOM_RESYNC";

    /** RESYNC 冷却存储在 client 会话属性中的 key */
    private static final String KEY_LAST_RESYNC_AT = "roomResyncLastAt";
    private static final long RESYNC_COOLDOWN_MS = 2000;

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

    @PostConstruct
    public void register() {
        socketIOServer.addConnectListener(this::assignRooms);

        // 自愈通道：客户端发现自己没收到 ROOM_ACK 时主动请求重新分配。
        // 每 session 2s 冷却，防止高频 emit 放大 token/JWT 校验开销。
        socketIOServer.addEventListener(EVENT_ROOM_RESYNC, Object.class, (client, data, ackSender) -> {
            Long lastAt = client.get(KEY_LAST_RESYNC_AT);
            long now = System.currentTimeMillis();
            if (lastAt != null && now - lastAt < RESYNC_COOLDOWN_MS) {
                return;
            }
            client.set(KEY_LAST_RESYNC_AT, now);
            log.info("[RoomAssigner] 收到 ROOM_RESYNC，重新分配 sessionId={}", client.getSessionId());
            assignRooms(client);
        });

        log.info("[RoomAssigner] 已注册（@PostConstruct，早于 Socket.IO start），rooms: {}, {}, {}, {}",
                ROOM_RELOAD_WEB, ROOM_CONSOLE_LIVE, ROOM_MOBILE_BROADCAST,
                MobileUserSocketPushService.ROOM_PREFIX + "{userId}");
    }

    /**
     * 按 channel 握手参数将连接分配到对应 room。幂等——重复调用只会重复 joinRoom（无害）。
     * 分配完成后发送 ROOM_ACK 供客户端确认成员资格。
     */
    private void assignRooms(SocketIOClient client) {
        String channel = client.getHandshakeData().getSingleUrlParam("channel");
        List<String> joined = new ArrayList<>();

        // ── mobile channel: 加入广播 + 个人 room ──
        if ("mobile".equals(channel)) {
            client.joinRoom(ROOM_MOBILE_BROADCAST);
            joined.add(ROOM_MOBILE_BROADCAST);
            String mobileToken = client.getHandshakeData().getSingleUrlParam("mobileToken");
            if (mobileToken != null && !mobileToken.isBlank()) {
                try {
                    String userId = mobileTokenService.resolveUserIdByToken(mobileToken.trim());
                    String room = MobileUserSocketPushService.roomForUser(userId);
                    client.joinRoom(room);
                    joined.add(room);
                    log.info("[RoomAssigner] mobile 用户 {} 已加入个人 room", userId);
                } catch (Exception e) {
                    log.warn("[RoomAssigner] mobileToken 校验失败: {}", e.getMessage());
                }
            }
            sendRoomAck(client, joined);
            return; // ← mobile 不加入 reload:web / console:live
        }

        // ── student channel (小程序/JWT H5): 仅加入个人 room ──
        if ("student".equals(channel)) {
            String jwt = client.getHandshakeData().getSingleUrlParam("token");
            if (jwt != null && !jwt.isBlank()) {
                User user = jwtTokenService.validateTokenAndResolveUser(jwt.trim());
                if (user != null && user.getId() != null && !user.getId().isBlank()) {
                    String room = MobileUserSocketPushService.roomForUser(user.getId());
                    client.joinRoom(room);
                    joined.add(room);
                    log.info("[RoomAssigner] student JWT 用户 {} 已加入个人 room", user.getId());
                }
            }
            sendRoomAck(client, joined);
            return; // ← student 不加入 reload:web / console:live
        }

        // ── web client (后台管理页面): 加入所有 web room ──
        client.joinRoom(ROOM_RELOAD_WEB);
        client.joinRoom(ROOM_CONSOLE_LIVE);
        joined.add(ROOM_RELOAD_WEB);
        joined.add(ROOM_CONSOLE_LIVE);
        sendRoomAck(client, joined);

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
    }

    /** 向客户端确认 room 分配结果。bootId 用于客户端识别"服务端已重启但连接未感知"。 */
    private void sendRoomAck(SocketIOClient client, List<String> joinedThisPass) {
        // 报告实际成员资格（而非仅本次加入的 room）：RESYNC 重跑 + 凭证过期时
        // 本次 pass 可能为空，但客户端仍在原 room 中，据实上报避免前端误判重连。
        List<String> rooms = new ArrayList<>();
        try {
            for (String room : client.getAllRooms()) {
                if (room != null && !room.isBlank()) { // 过滤 netty-socketio 默认的 "" room
                    rooms.add(room);
                }
            }
        } catch (Exception e) {
            rooms = joinedThisPass; // 兜底：读取失败时退回本次分配列表
        }
        Map<String, Object> ack = new LinkedHashMap<>();
        ack.put("bootId", clientVersionService.getBootId());
        ack.put("rooms", rooms);
        ack.put("at", Instant.now().toString());
        client.sendEvent(EVENT_ROOM_ACK, ack);
    }
}
