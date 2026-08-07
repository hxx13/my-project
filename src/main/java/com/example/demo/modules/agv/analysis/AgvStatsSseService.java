package com.example.demo.modules.agv.analysis;

import com.example.demo.modules.agv.mapper.AgvStatsMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * AGV 统计管道 SSE 推送服务。
 * <p>
 * 管理按管道 slug 分组的 SSE 订阅者列表，
 * 提供订阅、取消和广播能力。
 * <p>
 * 线程安全：使用 ConcurrentHashMap + CopyOnWriteArrayList，
 * 允许并发订阅/取消/广播。
 */
@Service
public class AgvStatsSseService {

    private static final Logger log = LoggerFactory.getLogger(AgvStatsSseService.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final AgvStatsMapper statsMapper;

    /** 按管道 slug 分组的管理器列表 */
    private final ConcurrentHashMap<String, List<SseEmitter>> emitters = new ConcurrentHashMap<>();

    public AgvStatsSseService(AgvStatsMapper statsMapper) {
        this.statsMapper = statsMapper;
    }

    /**
     * 订阅指定管道的 SSE 推送。
     * <p>
     * 创建无超时的 SseEmitter，注册到对应 slug 的分组中，
     * 并立即发送当前快照作为初始数据。
     *
     * @param slug 管道标识
     * @param from 时间范围起点（预留，当前用于快照查询）
     * @param to   时间范围终点（预留）
     * @return SseEmitter 实例，由 Spring MVC 写入响应
     */
    public SseEmitter subscribe(String slug, LocalDateTime from, LocalDateTime to) {
        SseEmitter emitter = new SseEmitter(0L); // no timeout

        List<SseEmitter> list = emitters.computeIfAbsent(slug, k -> new CopyOnWriteArrayList<>());
        list.add(emitter);

        emitter.onCompletion(() -> remove(slug, emitter));
        emitter.onTimeout(() -> remove(slug, emitter));
        emitter.onError(e -> {
            log.debug("[AgvStatsSSE] Emitter error for slug={}: {}", slug, e.getMessage());
            remove(slug, emitter);
        });

        // Send initial snapshot immediately
        try {
            Map<String, Object> config = statsMapper.selectConfigBySlug(slug);
            if (config != null) {
                List<Map<String, Object>> snapshots = statsMapper.selectSnapshotsByConfigId(
                    toLong(config.get("id")));
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("type", "snapshot");
                payload.put("slug", slug);
                payload.put("data", snapshots != null ? snapshots : Collections.emptyList());
                payload.put("timestamp", System.currentTimeMillis());
                emitter.send(SseEmitter.event()
                    .name("snapshot")
                    .data(JSON.writeValueAsString(payload)));
            }
        } catch (IOException e) {
            log.debug("[AgvStatsSSE] Failed to send initial snapshot for slug={}: {}", slug, e.getMessage());
            remove(slug, emitter);
        }

        return emitter;
    }

    /**
     * 向指定 slug 的所有订阅者广播数据。
     * <p>
     * 由 {@link AgvStatsComputeEngine} 在每个 tick 完成后调用。
     * 自动清理已关闭或异常的 emitter。
     *
     * @param slug 管道标识
     * @param data 广播数据（会被序列化为 JSON）
     */
    public void broadcast(String slug, Map<String, Object> data) {
        List<SseEmitter> list = emitters.get(slug);
        if (list == null || list.isEmpty()) return;

        List<SseEmitter> dead = new ArrayList<>();

        for (SseEmitter emitter : list) {
            try {
                emitter.send(SseEmitter.event()
                    .name("update")
                    .data(JSON.writeValueAsString(data)));
            } catch (IOException e) {
                log.debug("[AgvStatsSSE] Send failed for slug={}: {}", slug, e.getMessage());
                dead.add(emitter);
            }
        }

        // Clean up dead emitters
        for (SseEmitter d : dead) {
            remove(slug, d);
        }
    }

    /**
     * 获取指定 slug 的当前订阅者数量（用于监控）。
     */
    public int subscriberCount(String slug) {
        List<SseEmitter> list = emitters.get(slug);
        return list != null ? list.size() : 0;
    }

    /**
     * 获取所有管道的订阅者总数（用于监控）。
     */
    public int totalSubscribers() {
        return emitters.values().stream().mapToInt(List::size).sum();
    }

    // ── internal ──

    private void remove(String slug, SseEmitter emitter) {
        List<SseEmitter> list = emitters.get(slug);
        if (list != null) {
            list.remove(emitter);
            if (list.isEmpty()) {
                emitters.remove(slug, list);
            }
        }
        try {
            emitter.complete();
        } catch (Exception ignored) {
            // already closed
        }
    }

    private static long toLong(Object o) {
        if (o instanceof Number n) return n.longValue();
        if (o instanceof String s) try { return Long.parseLong(s); } catch (Exception e) { /* fall through */ }
        return 0;
    }
}
