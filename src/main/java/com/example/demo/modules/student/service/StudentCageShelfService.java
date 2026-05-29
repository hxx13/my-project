package com.example.demo.modules.student.service;

import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageShelfIndex;
import com.example.demo.modules.cageshelf.mapper.CageShelfMapper;
import com.example.demo.modules.student.mapper.StudentCageShelfSnapshotMapper;
import com.example.demo.modules.twin.common.util.PersonnelProjectGroupUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class StudentCageShelfService {

    private static final Logger log = LoggerFactory.getLogger(StudentCageShelfService.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final int BATCH_CHUNK_SIZE = 500;

    private final AroService aroService;
    private final AroPersonnelMapper aroPersonnelMapper;
    private final CageShelfMapper cageShelfMapper;
    private final StudentCageShelfSnapshotMapper snapshotMapper;

    public StudentCageShelfService(AroService aroService,
                                   AroPersonnelMapper aroPersonnelMapper,
                                   CageShelfMapper cageShelfMapper,
                                   StudentCageShelfSnapshotMapper snapshotMapper) {
        this.aroService = aroService;
        this.aroPersonnelMapper = aroPersonnelMapper;
        this.cageShelfMapper = cageShelfMapper;
        this.snapshotMapper = snapshotMapper;
    }

    // ---- filter options ----

    public Map<String, Object> getFilterOptions(User user) {
        // Pull all imported cage shelves from indexes table (same source as admin page),
        // NOT from snapshots which only contain refreshed shelves.
        List<Map<String, Object>> allShelves = cageShelfMapper.listIndexes(null, null, null, null, 100000, 0);

        List<Map<String, Object>> campuses = new ArrayList<>();
        List<Map<String, Object>> areas = new ArrayList<>();
        List<Map<String, Object>> floors = new ArrayList<>();
        List<Map<String, Object>> rooms = new ArrayList<>();
        List<Map<String, Object>> shelfList = new ArrayList<>();

        Set<String> seenCampuses = new LinkedHashSet<>();
        Set<String> seenAreas = new LinkedHashSet<>();
        Set<String> seenFloors = new LinkedHashSet<>();
        Set<String> seenRooms = new LinkedHashSet<>();
        Set<String> seenShelves = new LinkedHashSet<>();

        for (Map<String, Object> s : allShelves) {
            String campusName = String.valueOf(s.getOrDefault("campusName", ""));
            String areaName = String.valueOf(s.getOrDefault("areaName", ""));
            String floorName = String.valueOf(s.getOrDefault("floorName", ""));
            String roomName = String.valueOf(s.getOrDefault("roomName", ""));
            String shelveId = String.valueOf(s.getOrDefault("shelveId", ""));
            String shelveName = String.valueOf(s.getOrDefault("shelveName", ""));

            if (!campusName.isEmpty() && seenCampuses.add(campusName)) {
                campuses.add(Map.of("id", campusName, "name", campusName));
            }
            if (!areaName.isEmpty() && seenAreas.add(areaName)) {
                areas.add(Map.of("id", areaName, "name", areaName));
            }
            if (!floorName.isEmpty() && seenFloors.add(floorName)) {
                floors.add(Map.of("id", floorName, "name", floorName));
            }
            if (!roomName.isEmpty() && seenRooms.add(roomName)) {
                rooms.add(Map.of("id", roomName, "name", roomName));
            }
            if (!shelveId.isEmpty() && seenShelves.add(shelveId)) {
                shelfList.add(Map.of("id", shelveId, "name", shelveName));
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("campuses", campuses);
        out.put("areas", areas);
        out.put("floors", floors);
        out.put("rooms", rooms);
        out.put("shelves", shelfList);
        return out;
    }

    // ---- shelf detail (grid) ----

    public Map<String, Object> getShelfDetail(User user, String shelveId) {
        if (shelveId == null || shelveId.isBlank()) {
            throw new IllegalArgumentException("shelveId 不能为空");
        }

        // Look up shelf index for meta
        CageShelfIndex index = cageShelfMapper.findByShelveId(shelveId);
        if (index == null) {
            throw new IllegalArgumentException("未找到该笼架索引，请先导入 CSV");
        }

        String latestBatchId = snapshotMapper.selectLatestBatchId(shelveId);
        if (latestBatchId == null) {
            // No snapshot yet — return empty grid with shelf meta
            return buildEmptyGridResponse(index);
        }

        // Get all occupied cells from the latest snapshot (unfiltered)
        List<Map<String, Object>> rawCells = snapshotMapper.selectGridByShelve(shelveId, latestBatchId);

        // Resolve user's project groups for visibility check
        List<String> groupNames = resolveUserGroupNames(user.getId());

        // Build position-indexed map
        Map<String, Map<String, Object>> byPos = new HashMap<>();
        for (Map<String, Object> cell : rawCells) {
            Object xObj = cell.get("positionX");
            Object yObj = cell.get("positionY");
            if (xObj == null || yObj == null) {
                continue;
            }
            int x = toIntVal(xObj);
            int y = toIntVal(yObj);
            if (x < 1 || x > 8 || y < 1 || y > 10) {
                continue;
            }
            byPos.put(y + "-" + x, cell);
        }

        // Build 10x8 grid
        List<Map<String, Object>> grid = new ArrayList<>();
        for (int y = 1; y <= 10; y++) {
            for (int x = 1; x <= 8; x++) {
                Map<String, Object> cell = byPos.get(y + "-" + x);
                if (cell == null) {
                    Map<String, Object> emptyCell = new LinkedHashMap<>();
                    emptyCell.put("x", x);
                    emptyCell.put("y", y);
                    emptyCell.put("position", toPosition(x, y));
                    emptyCell.put("empty", true);
                    emptyCell.put("stateLabel", "空位");
                    emptyCell.put("visible", true);
                    grid.add(emptyCell);
                } else {
                    boolean visible = isCellVisible(cell, groupNames);
                    Map<String, Object> gridCell = new LinkedHashMap<>();
                    gridCell.put("x", x);
                    gridCell.put("y", y);
                    gridCell.put("position", toPosition(x, y));
                    gridCell.put("empty", false);
                    gridCell.put("visible", visible);
                    if (visible) {
                        gridCell.put("stateLabel", cell.getOrDefault("stateLabel", "未知"));
                        gridCell.put("projectPiName", cell.getOrDefault("projectPiName", ""));
                        gridCell.put("departmentName", cell.getOrDefault("departmentName", ""));
                        gridCell.put("cageBoxQrCode", cell.getOrDefault("cageBoxQrCode", ""));
                        gridCell.put("aupNumber", cell.getOrDefault("aupNumber", ""));
                        gridCell.put("animalCageType", cell.getOrDefault("animalCageType", null));
                    } else {
                        gridCell.put("stateLabel", "无权限查看");
                        gridCell.put("projectPiName", "");
                        gridCell.put("departmentName", "");
                        gridCell.put("cageBoxQrCode", "");
                        gridCell.put("aupNumber", "");
                        gridCell.put("animalCageType", null);
                    }
                    grid.add(gridCell);
                }
            }
        }

        Map<String, Object> shelfMeta = new LinkedHashMap<>();
        shelfMeta.put("campusName", index.getCampusName());
        shelfMeta.put("areaName", index.getAreaName());
        shelfMeta.put("floorName", index.getFloorName());
        shelfMeta.put("roomName", index.getRoomName());
        shelfMeta.put("shelveId", index.getShelveId());
        shelfMeta.put("shelveName", index.getShelveName());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("shelfMeta", shelfMeta);
        out.put("grid", grid);
        out.put("totalCells", grid.size());
        out.put("filledCells", byPos.size());
        out.put("latestBatchId", latestBatchId);
        return out;
    }

    // ---- refresh ----

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> refreshShelves(User user) {
        // Rate limit: once per hour
        String oneHourAgo = LocalDateTime.now().minusHours(1).format(DT_FMT);
        int recentRefreshes = snapshotMapper.countRecentRefreshByUser(user.getId(), oneHourAgo);
        if (recentRefreshes > 0) {
            throw new IllegalStateException("请勿频繁刷新，每小时仅可刷新一次。距离上次刷新不足1小时，请稍后再试。");
        }

        String now = LocalDateTime.now().format(DT_FMT);

        // Get all imported shelves
        List<Map<String, Object>> shelves = cageShelfMapper.listIndexes(null, null, null, null, 100000, 0);
        if (shelves.isEmpty()) {
            throw new IllegalStateException("当前没有已导入的笼架数据，请先由管理员导入CSV");
        }

        int shelvesTotal = shelves.size();
        int shelvesSucceeded = 0;
        int shelvesFailed = 0;
        int cellsWritten = 0;

        for (Map<String, Object> shelfRow : shelves) {
            String shelveId = objToStr(shelfRow.get("shelveId"));
            String roomId = objToStr(shelfRow.get("roomId"));

            if (shelveId == null || shelveId.isBlank() || roomId == null || roomId.isBlank()) {
                shelvesFailed++;
                log.warn("[student-cage-shelf] 跳过 shelves 行（缺少 shelveId/roomId） row={}", shelfRow);
                continue;
            }

            Long shelveIdLong = toLongSafe(shelveId);
            Long roomIdLong = toLongSafe(roomId);
            if (shelveIdLong == null || roomIdLong == null) {
                shelvesFailed++;
                log.warn("[student-cage-shelf] 跳过 shelves 行（shelveId/roomId 非数字） shelveId={} roomId={}", shelveId, roomId);
                continue;
            }

            try {
                // Fetch cage data from ARO (same as admin)
                Map<String, Object> raw = aroService.fetchAnimalCagesByRoomAndShelve(roomIdLong, shelveIdLong);
                if (raw == null || raw.isEmpty()) {
                    shelvesFailed++;
                    log.warn("[student-cage-shelf] ARO cage fetch returned empty shelveId={}", shelveId);
                    continue;
                }
                if (!isAroListBodySuccess(raw)) {
                    shelvesFailed++;
                    log.warn("[student-cage-shelf] ARO cage fetch failed shelveId={} msg={}", shelveId, trim(raw.get("message")));
                    continue;
                }
                Object dataObj = raw.get("data");
                List<Map<String, Object>> cages = new ArrayList<>();
                if (dataObj instanceof List<?> list) {
                    for (Object item : list) {
                        if (item instanceof Map<?, ?> m) {
                            @SuppressWarnings("unchecked")
                            Map<String, Object> cage = (Map<String, Object>) m;
                            cages.add(cage);
                        }
                    }
                }

                // Status backfill from book API
                Map<String, Object> statusRaw = aroService.fetchAnimalCagesStatusByBook(roomIdLong, shelveIdLong);
                Map<String, Map<String, Object>> statusByPos = buildStatusByPosition(statusRaw);

                // Build snapshot cells for this shelf — one batch_id per shelf
                String batchId = shelveId + "-" + UUID.randomUUID().toString().substring(0, 8);
                List<Map<String, Object>> batchRows = new ArrayList<>();
                CageShelfIndex index = cageShelfMapper.findByShelveId(shelveId);

                for (Map<String, Object> cage : cages) {
                    Integer x = toIntObj(firstNonNullOr(cage, "postionX", cage.get("positionX")));
                    if (x == null) {
                        x = toIntObj(cage.get("positionX"));
                    }
                    Integer y = toIntObj(firstNonNullOr(cage, "postionY", cage.get("positionY")));
                    if (y == null) {
                        y = toIntObj(cage.get("positionY"));
                    }
                    if (x == null || y == null || x < 1 || x > 8 || y < 1 || y > 10) {
                        continue;
                    }

                    // Backfill status
                    fillStatusFromFallback(cage, statusByPos.get(y + "-" + x));

                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("snapshotBatchId", batchId);
                    row.put("shelveId", shelveId);
                    row.put("roomId", roomIdLong);
                    row.put("roomName", index != null ? index.getRoomName() : (shelfRow.getOrDefault("roomName", "")));
                    row.put("campusName", index != null ? index.getCampusName() : "");
                    row.put("areaName", index != null ? index.getAreaName() : "");
                    row.put("floorName", index != null ? index.getFloorName() : "");
                    row.put("shelveName", index != null ? index.getShelveName() : (shelfRow.getOrDefault("shelveName", "")));
                    row.put("positionX", x);
                    row.put("positionY", y);
                    row.put("positionLabel", toPosition(x, y));
                    row.put("animalCageType", toIntObj(cage.get("animalCageType")));

                    Integer animalCageType = toIntObj(cage.get("animalCageType"));
                    Integer rentType = toIntObj(cage.get("rentType"));
                    row.put("stateLabel", resolveStateLabel(animalCageType, rentType));

                    Map<String, Object> cageBoxVo = castMap(cage.get("cageBoxVo"));
                    row.put("projectPiName", cageBoxVo == null ? "" : trim(cageBoxVo.get("projectPiName")));
                    row.put("departmentName", cageBoxVo == null ? "" : trim(cageBoxVo.get("departmentName")));
                    row.put("cageBoxQrCode", cageBoxVo == null ? "" : trim(
                            firstNonNullOr(cageBoxVo, "cageBoxQrCode", cageBoxVo.get("cageBoxCode"))));
                    row.put("aupNumber", cageBoxVo == null ? "" : trim(cageBoxVo.get("aupNumber")));
                    row.put("isEmpty", false);

                    try {
                        row.put("rawDataJson", objectMapper.writeValueAsString(cage));
                    } catch (Exception e) {
                        row.put("rawDataJson", "");
                    }

                    row.put("refreshedAt", now);
                    row.put("refreshedBy", user.getId());

                    batchRows.add(row);
                }

                // Batch write in chunks
                if (!batchRows.isEmpty()) {
                    for (int i = 0; i < batchRows.size(); i += BATCH_CHUNK_SIZE) {
                        int end = Math.min(i + BATCH_CHUNK_SIZE, batchRows.size());
                        snapshotMapper.batchInsert(batchRows.subList(i, end));
                    }
                    cellsWritten += batchRows.size();
                }

                // Delete old batches for this shelf, keeping only the one we just wrote
                snapshotMapper.deleteOldBatches(shelveId, batchId);

                shelvesSucceeded++;
            } catch (Exception e) {
                shelvesFailed++;
                log.warn("[student-cage-shelf] refresh shelve failed shelveId={} err={}", shelveId, e.getMessage());
            }
        }

        // Clean up snapshots older than 7 days
        try {
            String sevenDaysAgo = LocalDateTime.now().minusDays(7).format(DT_FMT);
            int deleted = snapshotMapper.deleteOlderThan(sevenDaysAgo);
            if (deleted > 0) {
                log.info("[student-cage-shelf] 清理过期快照 {} 条", deleted);
            }
        } catch (Exception e) {
            log.warn("[student-cage-shelf] 清理过期快照失败 err={}", e.getMessage());
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("shelvesTotal", shelvesTotal);
        out.put("shelvesSucceeded", shelvesSucceeded);
        out.put("shelvesFailed", shelvesFailed);
        out.put("cellsWritten", cellsWritten);
        out.put("refreshedAt", now);
        return out;
    }

    // ---- helpers ----

    private List<String> resolveUserGroupNames(String userId) {
        try {
            AroPersonnel personnel = aroPersonnelMapper.findByUserId(userId);
            if (personnel == null) {
                return List.of();
            }
            String resolved = personnel.getResolvedProjectGroupNames();
            return PersonnelProjectGroupUtil.splitGroups(resolved);
        } catch (Exception e) {
            log.warn("[student-cage-shelf] 解析用户课题组失败 userId={} err={}", userId, e.getMessage());
            return List.of();
        }
    }

    private boolean isCellVisible(Map<String, Object> cell, List<String> groupNames) {
        if (groupNames == null || groupNames.isEmpty()) {
            return false;
        }
        String dept = objToStr(cell.get("departmentName"));
        String pi = objToStr(cell.get("projectPiName"));
        for (String g : groupNames) {
            if (g.equals(dept) || g.equals(pi)) {
                return true;
            }
        }
        return false;
    }

    private Map<String, Object> buildEmptyGridResponse(CageShelfIndex index) {
        List<Map<String, Object>> grid = new ArrayList<>();
        for (int y = 1; y <= 10; y++) {
            for (int x = 1; x <= 8; x++) {
                Map<String, Object> cell = new LinkedHashMap<>();
                cell.put("x", x);
                cell.put("y", y);
                cell.put("position", toPosition(x, y));
                cell.put("empty", true);
                cell.put("stateLabel", "空位");
                cell.put("visible", true);
                grid.add(cell);
            }
        }

        Map<String, Object> shelfMeta = new LinkedHashMap<>();
        shelfMeta.put("campusName", index.getCampusName());
        shelfMeta.put("areaName", index.getAreaName());
        shelfMeta.put("floorName", index.getFloorName());
        shelfMeta.put("roomName", index.getRoomName());
        shelfMeta.put("shelveId", index.getShelveId());
        shelfMeta.put("shelveName", index.getShelveName());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("shelfMeta", shelfMeta);
        out.put("grid", grid);
        out.put("totalCells", grid.size());
        out.put("filledCells", 0);
        out.put("latestBatchId", null);
        return out;
    }

    // ---- utility methods ported from CageShelfService ----

    private static String toPosition(int x, int y) {
        char col = (char) ('A' + Math.max(0, x - 1));
        return col + "-" + y;
    }

    private static String trim(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    private static String objToStr(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    private static int toIntVal(Object v) {
        if (v instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(v));
        } catch (Exception ignore) {
            return 0;
        }
    }

    private static Integer toIntObj(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(v));
        } catch (Exception ignore) {
            return null;
        }
    }

    private static Long toLongSafe(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(text.trim());
        } catch (Exception ignore) {
            return null;
        }
    }

    private static Object firstNonNullOr(Map<String, Object> source, String key, Object fallback) {
        Object v = source != null ? source.get(key) : null;
        if (v != null && !isBlankScalar(v)) {
            return v;
        }
        return fallback;
    }

    private static boolean isBlankScalar(Object o) {
        if (o == null) return true;
        if (o instanceof String s) return s.isBlank();
        return false;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> castMap(Object o) {
        if (o instanceof Map<?, ?> m) {
            return (Map<String, Object>) m;
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Map<String, Object>> buildStatusByPosition(Map<String, Object> statusRaw) {
        Map<String, Map<String, Object>> out = new HashMap<>();
        if (statusRaw == null || statusRaw.isEmpty() || !isAroListBodySuccess(statusRaw)) {
            return out;
        }
        Object dataObj = statusRaw.get("data");
        if (!(dataObj instanceof List<?> list)) {
            return out;
        }
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> map)) {
                continue;
            }
            Map<String, Object> row = (Map<String, Object>) map;
            Integer x = toIntObj(firstNonNullOr(row, "postionX", row.get("positionX")));
            Integer y = toIntObj(firstNonNullOr(row, "postionY", row.get("positionY")));
            if (x == null || y == null || x < 1 || x > 8 || y < 1 || y > 10) {
                continue;
            }
            out.put(y + "-" + x, row);
        }
        return out;
    }

    private static void fillStatusFromFallback(Map<String, Object> cage, Map<String, Object> fallback) {
        if (cage == null || fallback == null) {
            return;
        }
        Integer currentAnimalCageType = toIntObj(cage.get("animalCageType"));
        Integer fallbackAnimalCageType = toIntObj(fallback.get("animalCageType"));
        if (isMissingStateCode(currentAnimalCageType) && !isMissingStateCode(fallbackAnimalCageType)) {
            cage.put("animalCageType", fallbackAnimalCageType);
        }
        Integer currentState = toIntObj(cage.get("state"));
        Integer fallbackState = toIntObj(fallback.get("state"));
        if (isMissingStateCode(currentState) && !isMissingStateCode(fallbackState)) {
            cage.put("state", fallbackState);
        }
        Integer mergedAnimalCageType = toIntObj(cage.get("animalCageType"));
        Integer mergedState = toIntObj(cage.get("state"));
        if (isMissingStateCode(mergedAnimalCageType) && !isMissingStateCode(mergedState)) {
            cage.put("animalCageType", mergedState);
        }
        if (isBlankScalar(cage.get("stateName")) && !isBlankScalar(fallback.get("stateName"))) {
            cage.put("stateName", fallback.get("stateName"));
        }
        if (cage.get("rentType") == null) {
            cage.put("rentType", fallback.get("rentType"));
        }
    }

    private static boolean isMissingStateCode(Integer v) {
        return v == null || v <= 0;
    }

    private static String resolveStateLabel(Integer animalCageType, Integer rentType) {
        if (animalCageType != null) {
            return switch (animalCageType) {
                case 1 -> "等待分配";
                case 2 -> "已预约(无笼盒)";
                case 3 -> "已预约(有笼盒)";
                case 4 -> "异常";
                default -> "未知";
            };
        }
        if (rentType != null) {
            return switch (rentType) {
                case 1 -> "空闲";
                case 2 -> "正常租用";
                case 3 -> "接近到期";
                case 4 -> "很快到期";
                default -> "未知";
            };
        }
        return "未知";
    }

    private static boolean isAroListBodySuccess(Map<String, Object> raw) {
        Object succ = raw.get("success");
        if (succ instanceof Boolean && Boolean.FALSE.equals(succ)) {
            return false;
        }
        Object status = raw.get("status");
        if (status == null) {
            return true;
        }
        if (status instanceof Number n) {
            return n.intValue() == 0;
        }
        String s = String.valueOf(status).trim();
        return "0".equals(s) || "0.0".equals(s);
    }
}
