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
        Long last = lastSendCache.get(key);
        if (last != null && (now - last) < limitSeconds * 1000L) {
            return true;
        }
        lastSendCache.put(key, now);
        return false;
    }

    public void clear() {
        lastSendCache.clear();
    }
}
