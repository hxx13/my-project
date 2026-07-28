package com.example.demo.modules.cageshelf.service;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 笼架实时数据源 5 分钟冷却控制器。
 * 复用 PushRateLimiter 的 ConcurrentHashMap + compute 模式。
 *
 * <p>Key 规则：
 * <ul>
 *   <li>全房间模式：{@code roomId:*} </li>
 *   <li>单笼架模式：{@code roomId:shelveId}</li>
 * </ul>
 */
@Component
public class CageShelfRealtimeCooldown {

    private static final long COOLDOWN_MS = 5 * 60 * 1000; // 5 分钟

    private final ConcurrentHashMap<String, Long> lastFetchMap = new ConcurrentHashMap<>();

    /** 检查该 key 是否仍在冷却期内。 */
    public boolean isInCooldown(String key) {
        Long last = lastFetchMap.get(key);
        if (last == null) return false;
        return System.currentTimeMillis() - last < COOLDOWN_MS;
    }

    /** 标记该 key 刚从 ARO 拉取过数据，开始冷却。 */
    public void markFetched(String key) {
        lastFetchMap.put(key, System.currentTimeMillis());
    }

    /** 返回该 key 剩余冷却毫秒数（已过期则返回 0）。 */
    public long remainingCooldownMs(String key) {
        Long last = lastFetchMap.get(key);
        if (last == null) return 0;
        long elapsed = System.currentTimeMillis() - last;
        return elapsed >= COOLDOWN_MS ? 0 : COOLDOWN_MS - elapsed;
    }

    /** 强制清除冷却（分配/取消后调用）。 */
    public void forceRefresh(String key) {
        lastFetchMap.remove(key);
    }

    /** 清除该房间的所有冷却（全房间 + 所有单笼架）。 */
    public void forceRefreshRoom(Long roomId) {
        String prefix = roomId + ":";
        lastFetchMap.keySet().removeIf(k -> k.startsWith(prefix));
    }

    /** 各 key 的冷却剩余（毫秒）。 */
    public Map<String, Long> allRemaining() {
        long now = System.currentTimeMillis();
        Map<String, Long> result = new ConcurrentHashMap<>();
        lastFetchMap.forEach((k, v) -> {
            long remaining = COOLDOWN_MS - (now - v);
            if (remaining > 0) result.put(k, remaining);
        });
        return result;
    }
}
