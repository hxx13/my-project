package com.example.demo.modules.analytics.service;

import com.example.demo.modules.cageshelf.entity.CageShelfIndex;
import com.example.demo.modules.cageshelf.mapper.CageShelfMapper;
import com.example.demo.modules.cageshelf.service.CageShelfService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * 笼架占用统计：仅统计「已预约且有笼盒」格位（animalCageType=3）。
 * 筛选范围内笼架全量拉取（无条数上限）；清算时分批请求 ARO。数据为查询时刻实时状态。
 */
@Service
public class CageOccupancyReportService {

    private static final Logger log = LoggerFactory.getLogger(CageOccupancyReportService.class);
    private static final int OCCUPIED_CAGE_TYPE = 3;
    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final CageShelfMapper cageShelfMapper;
    private final CageShelfService cageShelfService;
    private final AnalyticsCageAuditProgressService auditProgressService;
    private final int auditBatchSize;
    private final long auditBatchDelayMs;

    public CageOccupancyReportService(
            CageShelfMapper cageShelfMapper,
            CageShelfService cageShelfService,
            AnalyticsCageAuditProgressService auditProgressService,
            @Value("${analytics.cage-occupancy.audit-batch-size:5}") int auditBatchSize,
            @Value("${analytics.cage-occupancy.audit-batch-delay-ms:400}") long auditBatchDelayMs) {
        this.cageShelfMapper = cageShelfMapper;
        this.cageShelfService = cageShelfService;
        this.auditProgressService = auditProgressService;
        this.auditBatchSize = Math.max(1, auditBatchSize);
        this.auditBatchDelayMs = Math.max(0, auditBatchDelayMs);
    }

    /** 清算进度用：筛选范围内笼架全量计数（无条数上限）。 */
    public int countShelvesInScope(CageAnalyticsFilterParams params) {
        CageAnalyticsFilterParams scope = params != null ? params : CageAnalyticsFilterParams.fromMap(null);
        return cageShelfMapper.countShelveIndexesForAnalytics(
                scope.campusIds(),
                scope.areaIds(),
                scope.floorIds(),
                scope.roomIds(),
                scope.legacyCampusNames(),
                scope.legacyFloorNames(),
                scope.legacyRoomName());
    }

    /**
     * 实时快照（忽略时间窗参数；与隔离服 queryWithFilter 签名对齐便于审计复用）。
     */
    public Map<String, Object> querySnapshot(CageAnalyticsFilterParams params) {
        return querySnapshot(params, null, null);
    }

    public Map<String, Object> querySnapshot(CageAnalyticsFilterParams params, String startTime, String endTime) {
        return buildSnapshot(params, startTime, endTime, false, null);
    }

    /**
     * 清算/历史回填专用：按批拉取笼架详情，批间休眠，降低 ARO 瞬时压力（在 heavyCalc 异步线程执行）。
     */
    public Map<String, Object> querySnapshotForAudit(
            CageAnalyticsFilterParams params, String startTime, String endTime) {
        return querySnapshotForAudit(params, startTime, endTime, null);
    }

    public Map<String, Object> querySnapshotForAudit(
            CageAnalyticsFilterParams params, String startTime, String endTime, Long progressViewId) {
        return buildSnapshot(params, startTime, endTime, true, progressViewId);
    }

    private Map<String, Object> buildSnapshot(
            CageAnalyticsFilterParams params,
            String startTime,
            String endTime,
            boolean auditBatched,
            Long progressViewId) {
        CageAnalyticsFilterParams scope = params != null ? params : CageAnalyticsFilterParams.fromMap(null);

        List<CageShelfIndex> shelves = listAllShelvesInScope(scope);

        Accumulator acc = new Accumulator();
        boolean useBatchFetch = auditBatched || shelves.size() > auditBatchSize;
        int batchSize = useBatchFetch ? auditBatchSize : Math.max(1, shelves.size());
        int batchCount = shelves.isEmpty() ? 0 : (shelves.size() + batchSize - 1) / batchSize;

        if (useBatchFetch && !shelves.isEmpty()) {
            log.info(
                    "[cage-occupancy] start batched fetch shelves={} batchSize={} batches={} delayMs={} audit={}",
                    shelves.size(),
                    batchSize,
                    batchCount,
                    auditBatchDelayMs,
                    auditBatched);
        }

        for (int offset = 0; offset < shelves.size(); offset += batchSize) {
            int batchIndex = offset / batchSize + 1;
            int end = Math.min(offset + batchSize, shelves.size());
            for (int i = offset; i < end; i++) {
                processShelf(shelves.get(i), acc);
            }
            if (progressViewId != null) {
                auditProgressService.onShelfBatch(progressViewId, end, shelves.size(), batchIndex, batchCount);
            }
            if (useBatchFetch && end < shelves.size() && auditBatchDelayMs > 0) {
                log.debug(
                        "[cage-occupancy-audit] batch {}/{} done (shelves {}-{}), pause {}ms",
                        batchIndex,
                        batchCount,
                        offset + 1,
                        end,
                        auditBatchDelayMs);
                sleepBetweenBatches();
            }
        }

        if (!shelves.isEmpty()) {
            log.info(
                    "[cage-occupancy] fetch done shelves={} queried={} failed={} occupied={}",
                    shelves.size(),
                    acc.shelfQueried,
                    acc.shelfFailed,
                    acc.occupiedTotal);
        }

        List<Map<String, Object>> regionRows = toRegionRows(acc.byRegion, 30);
        List<Map<String, Object>> groupRows = toNamedCountRows(acc.byProjectGroup, "groupName", 30);
        List<Map<String, Object>> piRows = toNamedCountRows(acc.byPi, "piName", 30);
        List<Map<String, Object>> roomRows = toRoomRows(acc.byRoom, 50);

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalPersonTimes", acc.occupiedTotal);
        summary.put("totalOccupiedSlots", acc.occupiedTotal);
        summary.put("uniqueGroups", acc.uniqueGroups.size());
        summary.put("uniquePis", acc.uniquePis.size());
        summary.put("uniqueRooms", acc.byRoom.size());
        summary.put("uniqueUsers", 0);
        summary.put("shelfCount", acc.shelfQueried);
        summary.put("shelfFailed", acc.shelfFailed);
        summary.put("shelfTotal", shelves.size());
        summary.put("truncated", false);
        summary.put("capturedAt", LocalDateTime.now().format(DT_FMT));
        if (useBatchFetch) {
            summary.put("fetchMode", auditBatched ? "audit_batched" : "batched");
            summary.put("fetchBatchSize", batchSize);
            summary.put("fetchBatchCount", batchCount);
            summary.put("fetchBatchDelayMs", auditBatchDelayMs);
        }
        if (StringUtils.hasText(startTime)) {
            summary.put("queryStart", startTime);
        }
        if (StringUtils.hasText(endTime)) {
            summary.put("queryEnd", endTime);
        }
        summary.put(
                "metricNote",
                "笼位数=已预约且有笼盒（animalCageType=3）；数据为查询时刻 ARO 实时状态");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("summary", summary);
        out.put("byRegion", regionRows);
        out.put("byProjectGroup", groupRows);
        out.put("byPi", piRows);
        out.put("byRoom", roomRows);
        out.put("byDay", List.of());
        return out;
    }

    private List<CageShelfIndex> listAllShelvesInScope(CageAnalyticsFilterParams scope) {
        return cageShelfMapper.listShelveIndexesForAnalytics(
                scope.campusIds(),
                scope.areaIds(),
                scope.floorIds(),
                scope.roomIds(),
                scope.legacyCampusNames(),
                scope.legacyFloorNames(),
                scope.legacyRoomName(),
                null);
    }

    private void processShelf(CageShelfIndex index, Accumulator acc) {
        try {
            Map<String, Object> detail = cageShelfService.fetchShelfDetail(String.valueOf(index.getShelveId()));
            acc.shelfQueried++;
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> grid = (List<Map<String, Object>>) detail.get("grid");
            if (grid == null) {
                return;
            }
            String regionKey = regionLabel(index);
            String roomKey = roomLabel(index);
            long shelfOccupied = 0;
            for (Map<String, Object> cell : grid) {
                if (!isOccupiedSlot(cell)) {
                    continue;
                }
                shelfOccupied++;
                acc.occupiedTotal++;
                String group = projectGroupLabel(cell);
                if (StringUtils.hasText(group)) {
                    acc.uniqueGroups.add(group);
                    acc.byProjectGroup.merge(group, 1L, Long::sum);
                }
                String pi = piLabel(cell);
                if (StringUtils.hasText(pi)) {
                    acc.uniquePis.add(pi);
                    acc.byPi.merge(pi, 1L, Long::sum);
                }
            }
            if (shelfOccupied > 0) {
                acc.byRegion.merge(regionKey, shelfOccupied, Long::sum);
                acc.byRoom.merge(roomKey, shelfOccupied, Long::sum);
            }
        } catch (Exception e) {
            acc.shelfFailed++;
            log.warn(
                    "[cage-occupancy] shelveId={} roomId={} failed: {}",
                    index.getShelveId(),
                    index.getRoomId(),
                    e.getMessage());
        }
    }

    private void sleepBetweenBatches() {
        try {
            Thread.sleep(auditBatchDelayMs);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("[cage-occupancy-audit] batch sleep interrupted");
        }
    }

    static boolean isOccupiedSlot(Map<String, Object> cell) {
        if (cell == null || Boolean.TRUE.equals(cell.get("empty"))) {
            return false;
        }
        Object typeObj = cell.get("animalCageType");
        if (typeObj instanceof Number n) {
            return n.intValue() == OCCUPIED_CAGE_TYPE;
        }
        try {
            return Integer.parseInt(String.valueOf(typeObj)) == OCCUPIED_CAGE_TYPE;
        } catch (Exception e) {
            return false;
        }
    }

    private static String regionLabel(CageShelfIndex index) {
        return String.join(
                " / ",
                nullToEmpty(index.getCampusName()),
                nullToEmpty(index.getAreaName()),
                nullToEmpty(index.getFloorName()),
                nullToEmpty(index.getRoomName()));
    }

    private static String roomLabel(CageShelfIndex index) {
        return String.join(
                " / ",
                nullToEmpty(index.getCampusName()),
                nullToEmpty(index.getAreaName()),
                nullToEmpty(index.getFloorName()),
                nullToEmpty(index.getRoomName()));
    }

    /** 课题组（projectName） */
    private static String projectGroupLabel(Map<String, Object> cell) {
        return trim(cell.get("projectGroup"));
    }

    /** 课题 PI / 老师 */
    private static String piLabel(Map<String, Object> cell) {
        String pi = trim(cell.get("projectPiName"));
        if (StringUtils.hasText(pi)) {
            return pi;
        }
        return trim(cell.get("piName"));
    }

    private static List<Map<String, Object>> toRegionRows(Map<String, Long> map, int limit) {
        return map.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue(Comparator.reverseOrder()))
                .limit(limit)
                .map(e -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("regionName", e.getKey());
                    row.put("personTimes", e.getValue());
                    return row;
                })
                .toList();
    }

    private static List<Map<String, Object>> toNamedCountRows(Map<String, Long> map, String nameField, int limit) {
        return map.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue(Comparator.reverseOrder()))
                .limit(limit)
                .map(e -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put(nameField, e.getKey());
                    row.put("personTimes", e.getValue());
                    row.put("occupiedSlots", e.getValue());
                    return row;
                })
                .toList();
    }

    private static List<Map<String, Object>> toRoomRows(Map<String, Long> map, int limit) {
        return map.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue(Comparator.reverseOrder()))
                .limit(limit)
                .map(e -> {
                    String full = e.getKey();
                    String roomName = full;
                    int slash = full.lastIndexOf(" / ");
                    if (slash >= 0 && slash + 3 < full.length()) {
                        roomName = full.substring(slash + 3);
                    }
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("roomName", roomName);
                    row.put("location", full);
                    row.put("occupiedSlots", e.getValue());
                    row.put("personTimes", e.getValue());
                    return row;
                })
                .toList();
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s.trim();
    }

    private static String trim(Object o) {
        return o == null ? "" : String.valueOf(o).trim();
    }

    private static final class Accumulator {
        final Map<String, Long> byRegion = new TreeMap<>();
        final Map<String, Long> byRoom = new TreeMap<>();
        final Map<String, Long> byProjectGroup = new TreeMap<>();
        final Map<String, Long> byPi = new TreeMap<>();
        final java.util.HashSet<String> uniqueGroups = new java.util.HashSet<>();
        final java.util.HashSet<String> uniquePis = new java.util.HashSet<>();
        long occupiedTotal;
        long shelfQueried;
        int shelfFailed;
    }
}
