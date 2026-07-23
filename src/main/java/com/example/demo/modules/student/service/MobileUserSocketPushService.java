package com.example.demo.modules.student.service;

import com.corundumstudio.socketio.SocketIOClient;
import com.corundumstudio.socketio.SocketIOServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 手机 HTML5 用户级 Socket.IO 推送（room = mobile_user:{userId}）。
 */
@Service
public class MobileUserSocketPushService {

    private static final Logger log = LoggerFactory.getLogger(MobileUserSocketPushService.class);
    public static final String EVENT_USER_NOTIFY = "MOBILE_USER_NOTIFY";
    public static final String ROOM_PREFIX = "mobile_user:";

    private final SocketIOServer server;

    public MobileUserSocketPushService(SocketIOServer server) {
        this.server = server;
    }

    public static String roomForUser(String userId) {
        return ROOM_PREFIX + (userId == null ? "" : userId.trim());
    }

    public void pushAlertItem(String userId, Map<String, Object> alertItem) {
        if (userId == null || userId.isBlank() || alertItem == null || alertItem.isEmpty()) {
            return;
        }
        try {
            Map<String, Object> payload = new LinkedHashMap<>(alertItem);
            payload.putIfAbsent("at", java.time.LocalDateTime.now().toString());
            server.getRoomOperations(roomForUser(userId.trim())).sendEvent(EVENT_USER_NOTIFY, payload);
            log.debug("[MobileSocket] 用户 {} 推送通知 kind={}", userId, payload.get("kind"));
        } catch (Exception e) {
            log.warn("[MobileSocket] 用户推送失败 userId={}: {}", userId, e.getMessage());
        }
    }

    public void pushRefresh(String userId, String reason) {
        if (userId == null || userId.isBlank()) {
            return;
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("kind", "refresh");
        payload.put("reason", reason != null ? reason : "update");
        payload.put("at", java.time.LocalDateTime.now().toString());
        pushAlertItem(userId, payload);
    }

    public void joinUserRoom(SocketIOClient client, String userId) {
        if (client == null || userId == null || userId.isBlank()) {
            return;
        }
        client.joinRoom(roomForUser(userId.trim()));
    }
}
