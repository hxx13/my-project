package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageSyncLock;
import com.example.demo.modules.cageshelf.mapper.CageSyncLockMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 笼位同步保护锁：同步（一键同步 / 同步本房间）时跳过被锁节点的写入，
 * 避免人工修正过的内容被 ARO 同步数据覆盖。
 *
 * 四层粒度 FLOOR / ROOM / SHELF / CELL，判定规则是「自下而上取最近一条显式设置」：
 * 对某笼位依次查 CELL → SHELF → ROOM → FLOOR，命中第一条就返回；全都没有则视为不锁。
 *
 * 注意：不能用「房间锁了 → 整个房间短路跳过」的自上而下写法，那样下级 locked=0
 * 的白名单永远没机会生效。
 */
@Service
public class CageSyncLockService {

    private static final long CACHE_TTL_MS = 5_000L;

    private final CageSyncLockMapper mapper;

    /** 锁快照：每层 scope_key → locked。缺 key = 该层无显式设置，继承上级。 */
    public record Snapshot(Map<String, Boolean> floor, Map<String, Boolean> room,
                           Map<String, Boolean> shelf, Map<String, Boolean> cell) {

        public static final Snapshot EMPTY =
                new Snapshot(Map.of(), Map.of(), Map.of(), Map.of());

        /** 笼位是否跳过同步：CELL → SHELF → ROOM → FLOOR 取最近一条显式设置。 */
        public boolean isCellSkipped(String floorId, String roomId, String shelveId, Long animalCageId) {
            Boolean v = animalCageId != null ? cell.get(String.valueOf(animalCageId)) : null;
            if (v != null) return v;
            return isShelfSkipped(floorId, roomId, shelveId);
        }

        /** 整架是否跳过同步（含白名单例外时为 false，调用方需再逐格判定）。 */
        public boolean isShelfSkipped(String floorId, String roomId, String shelveId) {
            Boolean v = shelveId != null ? shelf.get(shelveId) : null;
            if (v == null) v = roomId != null ? room.get(roomId) : null;
            if (v == null) v = floorId != null ? floor.get(floorId) : null;
            return Boolean.TRUE.equals(v);
        }
    }

    public CageSyncLockService(CageSyncLockMapper mapper) {
        this.mapper = mapper;
    }

    private volatile Snapshot cache;
    private volatile long cacheAt = 0L;

    /** 全量锁快照，5 秒 TTL：一次同步内逐步复用，避免每架重复查库。 */
    public Snapshot snapshot() {
        long now = System.currentTimeMillis();
        Snapshot s = cache;
        if (s != null && now - cacheAt < CACHE_TTL_MS) return s;

        Map<String, Boolean> floor = new HashMap<>(), room = new HashMap<>();
        Map<String, Boolean> shelf = new HashMap<>(), cell = new HashMap<>();
        for (CageSyncLock row : mapper.listAll()) {
            if (row.getScopeType() == null || row.getScopeKey() == null) continue;
            boolean locked = Boolean.TRUE.equals(row.getLocked());
            switch (row.getScopeType()) {
                case "FLOOR" -> floor.put(row.getScopeKey(), locked);
                case "ROOM" -> room.put(row.getScopeKey(), locked);
                case "SHELF" -> shelf.put(row.getScopeKey(), locked);
                case "CELL" -> cell.put(row.getScopeKey(), locked);
                default -> { /* 未知层级忽略 */ }
            }
        }
        Snapshot fresh = new Snapshot(floor, room, shelf, cell);
        cache = fresh;
        cacheAt = now;
        return fresh;
    }

    public List<CageSyncLock> listAll() {
        return mapper.listAll();
    }

    /** 单条加锁/解锁（locked=false 即白名单）。先删后插，保证同一 scope 只有一行。 */
    @Transactional
    public void setLock(String scopeType, String scopeKey, boolean locked,
                        String reason, String operatorId, String operatorName) {
        if (scopeType == null || scopeKey == null || scopeKey.isBlank()) return;
        CageSyncLock row = new CageSyncLock();
        row.setScopeType(scopeType);
        row.setScopeKey(scopeKey);
        row.setLocked(locked);
        row.setReason(reason);
        row.setOperatorId(operatorId);
        row.setOperatorName(operatorName);
        mapper.deleteByScope(scopeType, scopeKey);
        mapper.insert(row);
        cacheAt = 0L;
    }

    /** 清除该层设置，回到「继承上级」。 */
    @Transactional
    public void clearLock(String scopeType, String scopeKey) {
        if (scopeType == null || scopeKey == null) return;
        mapper.deleteByScope(scopeType, scopeKey);
        cacheAt = 0L;
    }

    // ── 便捷重载：直接吃 listAllShelfSummaries 返回的架子行 ──

    public boolean isShelfSkipped(Snapshot snap, Map<String, Object> shelf) {
        return snap.isShelfSkipped(str(shelf.get("floorId")), str(shelf.get("roomId")), str(shelf.get("shelveId")));
    }

    public boolean isCellSkipped(Snapshot snap, Map<String, Object> shelf, Long animalCageId) {
        return snap.isCellSkipped(str(shelf.get("floorId")), str(shelf.get("roomId")),
                str(shelf.get("shelveId")), animalCageId);
    }

    private static String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
}
