package com.example.demo.modules.agv.service;

import com.example.demo.modules.agv.dto.AgvRobotStatus;

import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 四台 AGV 最新状态的内存缓存，供 /current 接口秒返。
 * 采集线程写入，查询接口读取。
 */
@Component
public class AgvStatusCache {

    private final Map<String, CachedStatus> store = new ConcurrentHashMap<>(4);

    public void put(String ip, AgvRobotStatus status) {
        store.put(ip, new CachedStatus(status, Instant.now()));
    }

    public CachedStatus get(String ip) {
        return store.get(ip);
    }

    public Map<String, CachedStatus> all() {
        return Map.copyOf(store);
    }

    public static class CachedStatus {
        private final AgvRobotStatus status;
        private final Instant lastPolledAt;

        CachedStatus(AgvRobotStatus status, Instant lastPolledAt) {
            this.status = status;
            this.lastPolledAt = lastPolledAt;
        }

        public AgvRobotStatus getStatus() { return status; }
        public Instant getLastPolledAt() { return lastPolledAt; }
    }
}
