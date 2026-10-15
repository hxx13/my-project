package com.example.demo.modules.avidity.service;

import com.example.demo.modules.avidity.entity.AvidityAlarmEvent;
import com.example.demo.modules.avidity.entity.AvidityChannel;
import com.example.demo.modules.avidity.mapper.AvidityAlarmEventMapper;
import com.example.demo.modules.avidity.mapper.AvidityChannelMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.ClassPathResource;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 我们自己记的**报警历史**：每个点位一条「开始时间 / 结束时间」，并且带上它在平面图上的分区。
 *
 * <p>为什么不用厂平台那份历史：那份是他们的流水，字段是他们给的、筛选参数还无效；我们要的是
 * 「这个点位这一轮从几点开始报、几点恢复」，只有盯着实时状态自己记才拿得到。所以厂平台那份
 * 直接舍弃，改用这张表。
 *
 * <p>判据：长连接推来的每个点位值变化都过这里。翻红＝开一条（同一「变化时刻」只开一条，
 * 重连重推也不会重复），翻绿＝把该点位未收口的行补上结束时间。结束时间为空的行，
 * 就是「此刻正在报警」。
 *
 * <p>分区（前室号 / 内间名 / 点位号）在开条时从该通道的平面图布局里查出来落库 ——
 * 这样历史列表可以按房间归文件夹，不用每次再去翻布局。
 */
@Service
public class AvidityAlarmEventService {

    private static final Logger log = LoggerFactory.getLogger(AvidityAlarmEventService.class);

    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final java.time.format.DateTimeFormatter STAMP =
            java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    /** 点位在平面图上的位置：分区 / 内间 / 点位号 */
    private record Spot(String room, String rack, Integer no) {
    }

    private final AvidityAlarmEventMapper eventMapper;
    private final AvidityChannelMapper channelMapper;
    private final ObjectMapper objectMapper;

    /** device|var → 位置。布局是静态资源，进程内缓存一份就够，隔几分钟过期一次兜住改版。 */
    private volatile Map<String, Spot> spotIndex;
    private volatile long spotIndexAt;

    public AvidityAlarmEventService(AvidityAlarmEventMapper eventMapper,
                                    AvidityChannelMapper channelMapper,
                                    ObjectMapper objectMapper) {
        this.eventMapper = eventMapper;
        this.channelMapper = channelMapper;
        this.objectMapper = objectMapper;
    }

    /** 长连接推来一次值变化：翻红开一条，翻绿收口。 */
    @Async
    @EventListener
    public void onLiveChange(AvidityLiveStateService.LiveChange change) {
        try {
            if (change.alarming()) {
                ensureOpen(change.deviceId(), change.variable(), change.at());
            } else {
                eventMapper.closeOpen(change.deviceId(), change.variable(), parseStamp(change.at()));
            }
        } catch (Exception e) {
            // 记录失败不该影响长连接，也不该静默 —— 日志里留痕
            log.warn("[安维迪报警历史] 记录失败 {} {}：{}", change.deviceId(), change.variable(), e.getMessage());
        }
    }

    /**
     * 开一条报警（同一「变化时刻」＝同一次报警，已经开过就什么都不做）。
     *
     * <p>推送那边在数「今日第几次」之前会先调它 —— 两个监听器是并发的，不保证记录先于推送，
     * 先补一次才能保证数出来的次数把当前这条算进去。
     */
    public void ensureOpen(long deviceId, String variable, String at) {
        Spot spot = spotIndex().get(deviceId + "|" + variable);
        AvidityAlarmEvent row = new AvidityAlarmEvent();
        row.setVirtualDeviceId(deviceId);
        row.setAlarmName(variable);
        if (spot != null) {
            row.setRoom(spot.room());
            row.setRack(spot.rack());
            row.setPointNo(spot.no());
        }
        row.setStartedAt(parseStamp(at));
        row.setLastSeenAt(LocalDateTime.now(ZONE));
        row.setCreatedAt(LocalDateTime.now(ZONE));
        if (eventMapper.openIfAbsent(row) > 0) {
            log.info("[安维迪报警历史] {} {} 开始报警", spot == null ? "" : label(spot), variable);
        }
    }

    /** 这个点位**今天**第几次报警（含刚开的这条）。 */
    public int todaySeq(long deviceId, String variable) {
        return eventMapper.countSince(deviceId, variable, LocalDate.now(ZONE).atStartOfDay());
    }

    /** 这个点位**累计**第几次报警。 */
    public int totalSeq(long deviceId, String variable) {
        return eventMapper.countAll(deviceId, variable);
    }

    /** 此刻正在报警的（按开始时间倒序）。 */
    public List<AvidityAlarmEvent> openAlarms(Collection<Long> deviceIds) {
        return eventMapper.selectOpen(deviceIds);
    }

    /** 历史流水，倒序。 */
    public List<AvidityAlarmEvent> history(LocalDateTime since, Collection<Long> deviceIds,
                                           String alarmName, int limit) {
        return eventMapper.selectSince(since, deviceIds, alarmName, Math.min(Math.max(limit, 1), 1000));
    }

    /**
     * 按**平面图上的房间**把事件归成文件夹：分区 → 内间 → 事件。
     * 前端（网页/小程序）照这个结构直接展开成树，不用各自再算一遍。
     */
    public List<Map<String, Object>> folderTree(List<AvidityAlarmEvent> rows) {
        Map<String, Map<String, List<AvidityAlarmEvent>>> byRoom = new LinkedHashMap<>();
        for (AvidityAlarmEvent e : rows) {
            String room = blankTo(e.getRoom(), "未分区");
            String rack = blankTo(e.getRack(), "未标内间");
            byRoom.computeIfAbsent(room, k -> new LinkedHashMap<>())
                    .computeIfAbsent(rack, k -> new java.util.ArrayList<>())
                    .add(e);
        }
        List<Map<String, Object>> out = new java.util.ArrayList<>();
        byRoom.forEach((room, racks) -> {
            List<Map<String, Object>> rackNodes = new java.util.ArrayList<>();
            int[] roomCount = {0};
            racks.forEach((rack, items) -> {
                List<Map<String, Object>> list = new java.util.ArrayList<>();
                for (AvidityAlarmEvent e : items) {
                    list.add(eventNode(e));
                }
                roomCount[0] += items.size();
                Map<String, Object> rackNode = new LinkedHashMap<>();
                rackNode.put("rack", rack);
                rackNode.put("count", items.size());
                rackNode.put("items", list);
                rackNodes.add(rackNode);
            });
            Map<String, Object> roomNode = new LinkedHashMap<>();
            roomNode.put("room", room);
            roomNode.put("count", roomCount[0]);
            roomNode.put("racks", rackNodes);
            out.add(roomNode);
        });
        return out;
    }

    private Map<String, Object> eventNode(AvidityAlarmEvent e) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("id", e.getId());
        node.put("alarmName", e.getAlarmName());
        node.put("pointNo", e.getPointNo());
        node.put("virtualDeviceId", e.getVirtualDeviceId());
        node.put("startedAt", e.getStartedAt() == null ? null : STAMP.format(e.getStartedAt()));
        node.put("endedAt", e.getEndedAt() == null ? null : STAMP.format(e.getEndedAt()));
        node.put("ongoing", e.getEndedAt() == null);
        if (e.getStartedAt() != null) {
            LocalDateTime end = e.getEndedAt() == null ? LocalDateTime.now(ZONE) : e.getEndedAt();
            node.put("durationSec", java.time.Duration.between(e.getStartedAt(), end).getSeconds());
        }
        return node;
    }

    private static String blankTo(String s, String fallback) {
        return s == null || s.isEmpty() ? fallback : s;
    }

    /** 点位在平面图上的位置索引：device|var → (分区, 内间, 点位号)。 */
    private Map<String, Spot> spotIndex() {
        Map<String, Spot> cached = spotIndex;
        if (cached != null && System.currentTimeMillis() - spotIndexAt < 5 * 60_000L) {
            return cached;
        }
        Map<String, Spot> fresh = new LinkedHashMap<>();
        for (AvidityChannel channel : channelMapper.selectAll()) {
            if (channel.getVirtualDeviceId() == null || channel.getConfigureViewId() == null) continue;
            ClassPathResource resource = new ClassPathResource("avidity/" + channel.getConfigureViewId() + ".json");
            if (!resource.exists()) continue;
            try (InputStream in = resource.getInputStream()) {
                JsonNode plan = objectMapper.readTree(in);
                for (JsonNode room : plan.path("rooms")) {
                    for (JsonNode rack : room.path("racks")) {
                        for (JsonNode point : rack.path("points")) {
                            String v = point.path("var").asText("");
                            if (v.isEmpty()) continue;
                            fresh.put(channel.getVirtualDeviceId() + "|" + v,
                                    new Spot(room.path("room").asText(""),
                                            rack.path("display").asText(rack.path("rack").asText("")),
                                            point.hasNonNull("no") ? point.path("no").asInt() : null));
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("[安维迪报警历史] 布局 {} 读取失败：{}", channel.getConfigureViewId(), e.getMessage());
            }
        }
        spotIndex = fresh;
        spotIndexAt = System.currentTimeMillis();
        return fresh;
    }

    private static String label(Spot spot) {
        StringBuilder sb = new StringBuilder();
        if (spot.rack() != null && !spot.rack().isEmpty()) sb.append(spot.rack());
        else if (spot.room() != null && !spot.room().isEmpty()) sb.append(spot.room());
        if (spot.no() != null) sb.append(" 第").append(spot.no()).append("点位");
        return sb.toString();
    }

    /** 平台给的是 UTC（2026-10-15T08:47:28Z），存库统一北京墙钟。 */
    private static LocalDateTime parseStamp(String iso) {
        if (iso != null && !iso.isEmpty()) {
            try {
                return Instant.parse(iso).atZone(ZONE).toLocalDateTime();
            } catch (Exception ignored) {
                // 格式变了就用本机时刻兜底，不让记录缺时间
            }
        }
        return LocalDateTime.now(ZONE);
    }
}
