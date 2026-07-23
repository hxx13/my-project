package com.example.demo.modules.notification.service;

import com.corundumstudio.socketio.SocketIOServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 手机端 HTML5 全局强提醒广播。
 * 向 {@code mobile:broadcast} room 中的 mobile 客户端发送 MOBILE_ALERT 事件。
 */
@Service
public class MobileNotificationBroadcastService {

    /** mobile 客户端全局广播 room，与 {@code SocketRoomAssigner} 中保持一致的字符串字面量 */
    public static final String ROOM_MOBILE_BROADCAST = "mobile:broadcast";

    private static final Logger log = LoggerFactory.getLogger(MobileNotificationBroadcastService.class);

    private final SocketIOServer server;

    public MobileNotificationBroadcastService(SocketIOServer server) {
        this.server = server;
    }

    /** 广播全局通知提醒（标题 + 摘要） */
    public void broadcastAlert(String title, String summary, String type) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("title", title);
            payload.put("summary", summary);
            payload.put("type", type != null ? type : "PLATFORM");
            payload.put("at", java.time.LocalDateTime.now().toString());

            server.getRoomOperations(ROOM_MOBILE_BROADCAST).sendEvent("MOBILE_ALERT", payload);
            log.info("[MobileSocket] 向 mobile:broadcast 广播提醒: title={}, type={}", title, type);
        } catch (Exception e) {
            log.warn("[MobileSocket] 广播失败: {}", e.getMessage());
        }
    }

    /** 快速广播纯文本消息 */
    public void broadcastSimple(String message) {
        broadcastAlert(message, "", "PLATFORM");
    }
}
