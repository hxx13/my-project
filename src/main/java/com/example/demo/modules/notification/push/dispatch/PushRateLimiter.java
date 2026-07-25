package com.example.demo.modules.notification.push.dispatch;

import com.example.demo.modules.notification.push.config.NotifySourceChannel;
import org.springframework.stereotype.Component;

import java.time.LocalTime;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class PushRateLimiter {

    private final Map<String, Long> lastSendCache = new ConcurrentHashMap<>();

    public boolean isQuietTime(NotifySourceChannel config) {
        if (config.getQuietStart() == null || config.getQuietEnd() == null) {
            return false;
        }
        LocalTime now = LocalTime.now();
        LocalTime start = config.getQuietStart();
        LocalTime end = config.getQuietEnd();
        if (start.isBefore(end)) {
            return !now.isBefore(start) && now.isBefore(end);
        } else {
            // Overnight range (e.g., 22:00-06:00)
            return !now.isBefore(start) || now.isBefore(end);
        }
    }

    public boolean isRateLimited(String sourceCode, String userId, String channelCode, int limitSeconds) {
        String key = sourceCode + "|" + userId + "|" + channelCode;
        long now = System.currentTimeMillis();
        // 使用 compute 原子操作，防止并发重复点击跳过限流
        boolean[] blocked = {false};
        lastSendCache.compute(key, (k, v) -> {
            if (v != null && (now - v) < limitSeconds * 1000L) {
                blocked[0] = true; // 在限流窗口内，保持旧时间戳
                return v;
            }
            return now; // 不在窗口内或首次，更新时间戳
        });
        return blocked[0];
    }

    public void clear() {
        lastSendCache.clear();
    }
}
