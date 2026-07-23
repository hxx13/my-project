package com.example.demo.modules.aro.service;

import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RealtimeEventDedupService {
    private static final long DEDUP_WINDOW_MS = 3 * 60 * 1000L;

    private final Map<String, Long> instantPushed = new ConcurrentHashMap<>();
    private final Map<String, Long> syncPushed = new ConcurrentHashMap<>();

    public void markInstantPushed(String recordId) {
        if (recordId == null || recordId.isEmpty()) return;
        cleanupExpired();
        instantPushed.put(recordId, System.currentTimeMillis());
    }

    public boolean shouldSkipSyncPush(String recordId) {
        if (recordId == null || recordId.isEmpty()) return false;
        cleanupExpired();

        long now = System.currentTimeMillis();
        Long instantTime = instantPushed.get(recordId);
        if (instantTime != null && now - instantTime <= DEDUP_WINDOW_MS) {
            return true;
        }

        Long syncTime = syncPushed.get(recordId);
        if (syncTime != null && now - syncTime <= DEDUP_WINDOW_MS) {
            return true;
        }

        syncPushed.put(recordId, now);
        return false;
    }

    private void cleanupExpired() {
        long now = System.currentTimeMillis();
        instantPushed.entrySet().removeIf(entry -> now - entry.getValue() > DEDUP_WINDOW_MS);
        syncPushed.entrySet().removeIf(entry -> now - entry.getValue() > DEDUP_WINDOW_MS);
    }
}
