package com.example.demo.modules.twin.common.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class ClientVersionService {

    private static final Logger log = LoggerFactory.getLogger(ClientVersionService.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final ClientReloadBroadcastService broadcastService;

    // 客户端统计记录（内存，不持久化）
    private static class ClientPollRecord {
        String clientId;
        String clientBuildId;
        String channel;
        Instant lastSeenAt;
        ClientPollRecord(String clientId, String clientBuildId, String channel) {
            this.clientId = clientId;
            this.clientBuildId = clientBuildId;
            this.channel = channel != null ? channel : "web";
            this.lastSeenAt = Instant.now();
        }
    }

    private final ConcurrentHashMap<String, ClientPollRecord> clientStats = new ConcurrentHashMap<>();

    // 从 build-meta.json 读取的期望版本
    private volatile String expectedBuildId = "unknown";

    // bootId：本次进程启动的唯一标识（启动时间戳）。
    // 客户端用它检测"服务端已重启但 WebSocket 连接未感知"（room 成员资格可能已丢失）。
    private final String bootId = String.valueOf(Instant.now().toEpochMilli());

    // reloadId：单调递增序列号，每次 triggerForceReload 时 +1
    private final AtomicLong reloadIdCounter = new AtomicLong(0);

    // forceReloadAt：最近一次 reload 指令的时间戳（仅用于 UI 展示和 TTL 判断）
    private volatile Instant forceReloadAt = null;

    // 审计字段
    private volatile String lastReloadTriggeredBy = null;
    private volatile Instant lastReloadTriggeredAt = null;

    public ClientVersionService(ClientReloadBroadcastService broadcastService) {
        this.broadcastService = broadcastService;
    }

    @PostConstruct
    public void init() {
        expectedBuildId = readBuildIdFromMetaFile();
        log.info("[client-version] 初始化完成 expectedBuildId={} reloadId={}", expectedBuildId, reloadIdCounter.get());
    }

    private String readBuildIdFromMetaFile() {
        // 1. build-meta.json（首选）
        try {
            ClassPathResource meta = new ClassPathResource("static/build-meta.json");
            if (meta.exists()) {
                try (InputStream is = meta.getInputStream()) {
                    Map<String, Object> obj = objectMapper.readValue(is, Map.class);
                    Object buildId = obj.get("buildId");
                    if (buildId != null && !buildId.toString().isBlank()) {
                        return buildId.toString();
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[client-version] build-meta.json 读取失败，尝试 index.html fallback: {}", e.getMessage());
        }

        // 2. index.html lastModified（JAR 部署 fallback）
        try {
            ClassPathResource index = new ClassPathResource("static/index.html");
            if (index.exists()) {
                // 优先 getFile()（exploded 部署）
                try {
                    return String.valueOf(index.getFile().lastModified());
                } catch (IOException fileEx) {
                    // JAR 内：通过 URLConnection
                    java.net.URL url = index.getURL();
                    java.net.URLConnection conn = url.openConnection();
                    long lastMod = conn.getLastModified();
                    if (lastMod > 0) {
                        return String.valueOf(lastMod);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[client-version] index.html lastModified 读取失败: {}", e.getMessage());
        }

        log.warn("[client-version] 无法读取 buildId，使用 'unknown'");
        return "unknown";
    }

    /** GET /api/client-version 调用 */
    public Map<String, Object> getClientVersion(String clientId, String clientBuildId, String channel) {
        if (clientId != null && !clientId.isBlank()) {
            clientStats.put(clientId, new ClientPollRecord(clientId, clientBuildId, channel));
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("buildId", expectedBuildId);
        result.put("reloadId", reloadIdCounter.get());
        result.put("forceReloadAt", forceReloadAt != null ? forceReloadAt.toString() : null);
        result.put("bootId", bootId);
        return result;
    }

    /** 管理员触发"同步在线页" — 完整执行 ①→⑦ 操作顺序 */
    public Map<String, Object> triggerForceReload(String operatorUserId) {
        // ① 递增 reloadId，并跳变到不小于当前秒级时间戳的值。
        // 为什么跳变：存量旧版本客户端（无下行修正逻辑）的 sessionStorage 中可能残留
        // 任意历史 reloadId 高值，重启后计数器归零导致 "新值 > 存储值" 永远不成立，
        // 这些客户端对同步指令完全免疫。跳到当前时间戳保证显式触发时必然大于
        // 任何机器上的任何历史存储值。
        // 与 C1 审计不冲突：C1 反对的是时间戳做"种子"（重启后自然增长引发误刷全站）；
        // 此处仅在管理员显式点击时跳变——语义上就是要求刷新。重启后计数器仍归零，
        // 新客户端靠下行修正恢复基线。
        long newReloadId = reloadIdCounter.updateAndGet(prev ->
                Math.max(prev + 1, Instant.now().getEpochSecond()));
        // ② 记录触发时间
        forceReloadAt = Instant.now();
        // ③④ WebSocket 广播快速通道
        broadcastService.broadcastForceReload(operatorUserId, newReloadId);
        // ⑤ 审计
        lastReloadTriggeredBy = operatorUserId != null ? operatorUserId.trim() : "";
        lastReloadTriggeredAt = forceReloadAt;

        // ⑥ 统计客户端版本分布
        Map<String, Object> stats = buildVersionStats();

        log.info("[client-reload] ACTION=trigger operatorUserId={} expectedBuildId={} reloadId={} totalClients={} outdated={}",
                operatorUserId, expectedBuildId, newReloadId,
                stats.get("totalClients"), stats.get("outdated"));

        // ⑦ 返回
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("buildId", expectedBuildId);
        result.put("reloadId", newReloadId);
        result.put("forceReloadAt", forceReloadAt.toString());
        result.put("stats", stats);
        return result;
    }

    /** 监控页查询 */
    public Map<String, Object> getVersionStats() {
        Map<String, Object> stats = buildVersionStats();
        stats.put("expectedBuildId", expectedBuildId);
        stats.put("reloadId", reloadIdCounter.get());
        stats.put("forceReloadAt", forceReloadAt != null ? forceReloadAt.toString() : null);
        stats.put("lastReloadTriggeredBy", lastReloadTriggeredBy);
        stats.put("lastReloadTriggeredAt", lastReloadTriggeredAt != null ? lastReloadTriggeredAt.toString() : null);
        return stats;
    }

    private Map<String, Object> buildVersionStats() {
        // 注意：不在此处清理过期记录——由 @Scheduled cleanupStaleClients() 统一处理，
        // 避免读操作（getVersionStats/triggerForceReload）产生副作用

        int total = clientStats.size();
        int upToDate = 0;
        Map<String, Integer> distribution = new LinkedHashMap<>();

        for (ClientPollRecord record : clientStats.values()) {
            String v = record.clientBuildId != null ? record.clientBuildId : "unknown";
            distribution.merge(v, 1, Integer::sum);
            if (expectedBuildId.equals(v)) {
                upToDate++;
            }
        }

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalClients", total);
        stats.put("upToDate", upToDate);
        stats.put("outdated", total - upToDate);
        stats.put("distribution", distribution);
        return stats;
    }

    /** 获取当前 reloadId */
    public long getCurrentReloadId() {
        return reloadIdCounter.get();
    }

    /** 获取期望版本 */
    public String getExpectedBuildId() {
        return expectedBuildId;
    }

    /** 获取本次进程启动标识（用于 ROOM_ACK 与 /api/client-version 一致性比对） */
    public String getBootId() {
        return bootId;
    }

    @Scheduled(fixedRate = 60_000)
    public void cleanupStaleClients() {
        Instant cutoff = Instant.now().minus(2, ChronoUnit.MINUTES);
        int before = clientStats.size();
        clientStats.entrySet().removeIf(e -> e.getValue().lastSeenAt.isBefore(cutoff));
        int removed = before - clientStats.size();
        if (removed > 0) {
            log.debug("[client-version] 清理 {} 个过期客户端记录，剩余 {}", removed, clientStats.size());
        }
    }

    @Scheduled(fixedRate = 60_000)
    public void refreshExpectedBuildId() {
        try {
            String fresh = readBuildIdFromMetaFile();
            if (fresh != null && !fresh.isBlank() && !"unknown".equals(fresh)
                    && !fresh.equals(expectedBuildId)) {
                expectedBuildId = fresh;
                log.info("[client-version] expectedBuildId 已更新: {}", fresh);
            }
        } catch (Throwable t) {
            log.warn("[client-version] 刷新 expectedBuildId 失败", t);
        }
    }

    @Scheduled(fixedRate = 60_000)
    public void expireForceReloadAt() {
        if (forceReloadAt != null && forceReloadAt.plus(10, ChronoUnit.MINUTES).isBefore(Instant.now())) {
            log.info("[client-version] forceReloadAt TTL 过期，清除（reloadId 保持 {}）", reloadIdCounter.get());
            forceReloadAt = null;
        }
    }
}
