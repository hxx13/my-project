package com.example.demo.modules.notification.service;

import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class NotificationPushService {
    /** 与 application.properties 中 spring.mvc.async.request-timeout（毫秒）保持一致 */
    private static final long EMITTER_TIMEOUT_MS = 30L * 60L * 1000L;
    private final Map<String, CopyOnWriteArrayList<SseEmitter>> emitterMap = new ConcurrentHashMap<>();

    public SseEmitter subscribe(String userId) {
        SseEmitter emitter = new SseEmitter(EMITTER_TIMEOUT_MS);
        emitterMap.computeIfAbsent(userId, k -> new CopyOnWriteArrayList<>()).add(emitter);
        emitter.onCompletion(() -> removeEmitter(userId, emitter));
        emitter.onTimeout(() -> removeEmitter(userId, emitter));
        emitter.onError((ex) -> removeEmitter(userId, emitter));
        try {
            emitter.send(SseEmitter.event().name("connected").data(Map.of("ok", true)));
        } catch (IOException ignored) {
            removeEmitter(userId, emitter);
            try {
                emitter.complete();
            } catch (Exception ignoredComplete) {
            }
        }
        return emitter;
    }

    public void pushToUsers(Set<String> userIds, Map<String, Object> payload) {
        pushEventToUsers("notification", userIds, payload);
    }

    /**
     * 向指定用户已订阅的 SSE 连接发送命名事件（如 staff_chat、notification）。
     */
    public void pushEventToUsers(String eventName, Set<String> userIds, Map<String, Object> payload) {
        if (userIds == null || userIds.isEmpty()) {
            return;
        }
        String name = eventName == null || eventName.isBlank() ? "message" : eventName;
        for (String userId : userIds) {
            List<SseEmitter> emitters = emitterMap.get(userId);
            if (emitters == null || emitters.isEmpty()) continue;
            for (SseEmitter emitter : emitters) {
                try {
                    emitter.send(SseEmitter.event().name(name).data(payload != null ? payload : Map.of()));
                } catch (IOException e) {
                    removeEmitter(userId, emitter);
                    try {
                        emitter.complete();
                    } catch (Exception ignoredComplete) {
                    }
                }
            }
        }
    }

    private void removeEmitter(String userId, SseEmitter emitter) {
        List<SseEmitter> emitters = emitterMap.get(userId);
        if (emitters == null) return;
        emitters.remove(emitter);
        if (emitters.isEmpty()) {
            emitterMap.remove(userId);
        }
    }
}
