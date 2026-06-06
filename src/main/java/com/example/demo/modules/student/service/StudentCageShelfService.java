package com.example.demo.modules.student.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageShelfIndex;
import com.example.demo.modules.cageshelf.mapper.CageShelfMapper;
import com.example.demo.modules.cageshelf.service.CageShelfService;
import com.example.demo.modules.cageshelf.support.SpecialStatusComputer;
import com.example.demo.modules.student.mapper.CageCellAnnotationMapper;
import com.example.demo.modules.student.mapper.StudentCageShelfPinMapper;
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

    private final CageShelfService cageShelfService;
    private final AroService aroService;
    private final AroPersonnelMapper aroPersonnelMapper;
    private final CageShelfMapper cageShelfMapper;
    private final StudentCageShelfSnapshotMapper snapshotMapper;
    private final CageCellAnnotationMapper annotationMapper;
    private final StudentCageShelfPinMapper cageShelfPinMapper;

    public StudentCageShelfService(CageShelfService cageShelfService,
                                   AroService aroService,
                                   AroPersonnelMapper aroPersonnelMapper,
                                   CageShelfMapper cageShelfMapper,
                                   StudentCageShelfSnapshotMapper snapshotMapper,
                                   CageCellAnnotationMapper annotationMapper,
                                   StudentCageShelfPinMapper cageShelfPinMapper) {
        this.cageShelfService = cageShelfService;
        this.aroService = aroService;
        this.aroPersonnelMapper = aroPersonnelMapper;
        this.cageShelfMapper = cageShelfMapper;
        this.snapshotMapper = snapshotMapper;
        this.annotationMapper = annotationMapper;
        this.cageShelfPinMapper = cageShelfPinMapper;
    }

    // ---- filter options ----

    /**
     * 级联筛选选项：与教职工后台 CageShelfService.filterOptions() 使用相同的 Mapper 方法，
     * 每级根据上级选择逐步缩小范围，不做课题组过滤（笼架索引本身是全局的）。
     */
    public Map<String, Object> getFilterOptions(User user, Integer campusId, String areaId, String floorId, String roomId) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("campuses", cageShelfMapper.listCampuses());
        out.put("areas", cageShelfMapper.listAreas(campusId));
        out.put("floors", cageShelfMapper.listFloors(campusId, areaId, null));
        out.put("rooms", cageShelfMapper.listRooms(campusId, areaId, null, floorId, null));
        out.put("shelves", cageShelfMapper.listShelves(campusId, areaId, floorId, null, null, roomId, null));
        return out;
    }

    // ---- shelf detail (grid) ----

    /**
     * 学生端笼架详情：复用教职工端缓存数据，叠加课题组可见性过滤。
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getShelfDetail(User user, String shelveId) {
        // 直接复用教职工端缓存数据（优先缓存，缓存未命中时实时拉取 ARO）
        Map<String, Object> adminDetail = cageShelfService.fetchShelfDetail(shelveId);

        // 权限控制
        boolean isAdmin = isAdminUser(user);
        List<String> groupNames = isAdmin ? List.of() : resolveUserGroupNames(user.getId());

        // 对 admin 返回的 grid 叠加可见性过滤
        List<Map<String, Object>> adminGrid = (List<Map<String, Object>>) adminDetail.get("grid");
        List<Map<String, Object>> filteredGrid = new ArrayList<>();
        int filled = 0;

        for (Map<String, Object> cell : adminGrid) {
            Boolean empty = cell.get("empty") instanceof Boolean b ? b : false;
            Map<String, Object> gridCell = new LinkedHashMap<>(cell);

            if (Boolean.TRUE.equals(empty)) {
                gridCell.put("visible", true);
                filteredGrid.add(gridCell);
                continue;
            }

            // 可见性检查
            String dept = String.valueOf(gridCell.getOrDefault("departmentName", ""));
            String pi = String.valueOf(gridCell.getOrDefault("projectPiName", ""));
            boolean visible = isAdmin || groupNames.stream().anyMatch(g -> g.equals(dept) || g.equals(pi));
            gridCell.put("visible", visible);
            filled++;

            if (!visible) {
                gridCell.put("projectPiName", "***");
                gridCell.put("departmentName", "***");
                gridCell.put("specialStatuses", List.of());
                // cageBoxInfo 和 detail 中可能含敏感信息，清空
                Map<String, Object> cageBoxInfo = (Map<String, Object>) gridCell.get("cageBoxInfo");
                if (cageBoxInfo != null) {
                    cageBoxInfo.put("ProjectPiName", "***");
                    cageBoxInfo.put("DepartmentName", "***");
                }
            }

            filteredGrid.add(gridCell);
        }

        Map<String, Object> out = new LinkedHashMap<>(adminDetail);
        out.put("grid", filteredGrid);
        out.put("filledCells", filled);
        out.remove("fromCache");
        out.remove("cachedAt");
        return out;
    }

    // ---- refresh ----

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> refreshShelves(User user) {
        // Check if any snapshot exists for this user's accessible scope
        boolean hasExistingData = snapshotMapper.countByRefreshedBy(user.getId()) > 0;

        // Rate limit: once per hour, but only if data already exists (first access is free)
        if (hasExistingData) {
            String oneHourAgo = LocalDateTime.now().minusHours(1).format(DT_FMT);
            int recentRefreshes = snapshotMapper.countRecentRefreshByUser(user.getId(), oneHourAgo);
            if (recentRefreshes > 0) {
                throw new IllegalStateException("请勿频繁刷新，每小时仅可刷新一次。距离上次刷新不足1小时，请稍后再试。");
            }
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

                    // Compute special statuses from cageBoxVo
                    try {
                        List<SpecialStatusComputer.SpecialStatusEntry> statuses =
                                SpecialStatusComputer.compute(cageBoxVo);
                        row.put("specialStatusesJson", objectMapper.writeValueAsString(statuses));
                    } catch (Exception e) {
                        row.put("specialStatusesJson", "[{\"code\":\"NORMAL\",\"label\":\"正常\",\"iconKey\":\"normal\"}]");
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

                // Populate shared grid cache so bookmarks load instantly
                try {
                    cageShelfService.refreshShelfDetail(shelveId);
                } catch (Exception ignored) { /* cache write failure is non-fatal */ }
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

    /** Admin role or above bypasses project-group restrictions. */
    private boolean isAdminUser(User user) {
        if (user == null || user.getRole() == null) return false;
        return user.getRole().getLevel() >= RoleEnum.ADMIN.getLevel();
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
                case 2 -> "已预约(空笼盒)";
                case 3 -> "已预约(饲养中)";
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

    // ---- single cell refresh (on-demand) ----

    public Map<String, Object> refreshCell(User user, String shelveId, int x, int y) {
        if (shelveId == null || shelveId.isBlank()) {
            throw new IllegalArgumentException("shelveId 不能为空");
        }
        CageShelfIndex index = cageShelfMapper.findByShelveId(shelveId);
        if (index == null) {
            throw new IllegalArgumentException("未找到该笼架索引");
        }
        Long shelveIdLong = toLongSafe(shelveId);
        Long roomIdLong = index.getRoomId();
        if (shelveIdLong == null || roomIdLong == null) {
            throw new IllegalArgumentException("shelveId/roomId 非法");
        }

        // 调用 /back
        Map<String, Object> raw = aroService.fetchAnimalCagesByRoomAndShelve(roomIdLong, shelveIdLong);
        if (raw == null || raw.isEmpty() || !isAroListBodySuccess(raw)) {
            throw new IllegalStateException("外部笼位接口无响应");
        }
        List<Map<String, Object>> cages = new ArrayList<>();
        Object dataObj = raw.get("data");
        if (dataObj instanceof List<?> list) {
            for (Object item : list) {
                if (item instanceof Map<?, ?> m) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> cage = (Map<String, Object>) m;
                    cages.add(cage);
                }
            }
        }

        // 状态回填
        Map<String, Object> statusRaw = aroService.fetchAnimalCagesStatusByBook(roomIdLong, shelveIdLong);
        Map<String, Map<String, Object>> statusByPos = buildStatusByPosition(statusRaw);

        // 定位到指定坐标
        Map<String, Object> target = null;
        for (Map<String, Object> cage : cages) {
            Integer cx = toIntObj(firstNonNullOr(cage, "postionX", cage.get("positionX")));
            Integer cy = toIntObj(firstNonNullOr(cage, "postionY", cage.get("positionY")));
            if (cx != null && cx == x && cy != null && cy == y) {
                fillStatusFromFallback(cage, statusByPos.get(y + "-" + x));
                target = cage;
                break;
            }
        }

        if (target == null) {
            throw new IllegalArgumentException("未找到坐标 (" + x + "," + y + ") 对应的笼位");
        }

        // 权限检查
        boolean isAdmin = isAdminUser(user);
        List<String> groupNames = isAdmin ? List.of() : resolveUserGroupNames(user.getId());
        Map<String, Object> cageBoxVo = castMap(target.get("cageBoxVo"));
        String dept = cageBoxVo == null ? "" : trim(cageBoxVo.get("departmentName"));
        String pi = cageBoxVo == null ? "" : trim(cageBoxVo.get("projectPiName"));
        boolean visible = isAdmin || groupNames.stream().anyMatch(g -> g.equals(dept) || g.equals(pi));

        // 构建返回
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("x", x);
        result.put("y", y);
        result.put("position", toPosition(x, y));
        result.put("empty", false);
        result.put("visible", visible);
        result.put("animalCageType", toIntObj(target.get("animalCageType")));
        result.put("stateLabel", resolveStateLabel(toIntObj(target.get("animalCageType")), toIntObj(target.get("rentType"))));

        if (visible) {
            result.put("projectPiName", cageBoxVo == null ? "" : trim(cageBoxVo.get("projectPiName")));
            result.put("departmentName", cageBoxVo == null ? "" : trim(cageBoxVo.get("departmentName")));
            result.put("cageBoxQrCode", cageBoxVo == null ? "" : trim(firstNonNullOr(cageBoxVo, "cageBoxQrCode", cageBoxVo.get("cageBoxCode"))));
            result.put("aupNumber", cageBoxVo == null ? "" : trim(cageBoxVo.get("aupNumber")));
            try {
                result.put("rawDataJson", objectMapper.writeValueAsString(target));
            } catch (Exception e) {
                result.put("rawDataJson", "");
            }
            result.put("specialStatuses", SpecialStatusComputer.compute(cageBoxVo));
        } else {
            result.put("projectPiName", "***");
            result.put("departmentName", "***");
            result.put("cageBoxQrCode", "");
            result.put("aupNumber", "");
            result.put("rawDataJson", null);
            result.put("specialStatuses", List.of());
        }

        return result;
    }

    /**
     * 特殊状态总览（学生端）：复用教职工端数据，仅显示当前课题组的笼位。
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getSpecialStatusOverview(User user) {
        // 暂委托教职工端获取全量数据 —— StudentCageShelfService 注入了 cageShelfService
        // 注意：这里直接走 admin overview 再过滤更简单
        Map<String, Object> adminOverview = cageShelfService.getSpecialStatusOverview();

        boolean isAdmin = isAdminUser(user);
        if (isAdmin) {
            return adminOverview; // 高级角色看全部
        }

        List<String> groupNames = resolveUserGroupNames(user.getId());
        if (groupNames.isEmpty()) {
            // 没有课题组信息 → 返回空
            return Map.of("groups", List.of(), "totalAbnormal", 0, "scannedAt",
                    adminOverview.getOrDefault("scannedAt", ""));
        }

        // 过滤 groups 中的 cages
        List<Map<String, Object>> allGroups = (List<Map<String, Object>>) adminOverview.get("groups");
        List<Map<String, Object>> filteredGroups = new ArrayList<>();
        int totalAbnormal = 0;

        for (Map<String, Object> group : allGroups) {
            List<Map<String, Object>> cages = (List<Map<String, Object>>) group.get("cages");
            List<Map<String, Object>> visible = new ArrayList<>();
            for (Map<String, Object> cage : cages) {
                String dept = String.valueOf(cage.getOrDefault("departmentName", ""));
                String pi = String.valueOf(cage.getOrDefault("projectPiName", ""));
                if (groupNames.stream().anyMatch(g -> g.equals(dept) || g.equals(pi))) {
                    visible.add(cage);
                }
            }
            if (!visible.isEmpty()) {
                Map<String, Object> fg = new LinkedHashMap<>(group);
                fg.put("cages", visible);
                fg.put("count", visible.size());
                filteredGroups.add(fg);
                totalAbnormal += visible.size();
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("groups", filteredGroups);
        out.put("totalAbnormal", totalAbnormal);
        out.put("scannedAt", adminOverview.getOrDefault("scannedAt", ""));
        return out;
    }

    // ---- cell annotations ----

    public Map<String, Object> getAnnotation(User user, String shelveId, int x, int y) {
        return annotationMapper.selectByPosition(shelveId, x, y);
    }

    public void upsertAnnotation(User user, String shelveId, int x, int y, String position,
                                  String richText, String images, String aroRawData) {
        // Permission check: must be admin+ or same project group
        if (!isAdminUser(user)) {
            List<String> groups = resolveUserGroupNames(user.getId());
            if (groups.isEmpty()) {
                throw new IllegalStateException("无权限编辑：未能识别您的课题组");
            }
            // Fetch the snapshot cell to check project ownership
            String batchId = snapshotMapper.selectLatestBatchId(shelveId);
            if (batchId == null) {
                throw new IllegalStateException("无权限编辑：该笼架暂无快照数据");
            }
            List<Map<String, Object>> cells = snapshotMapper.selectGridByShelve(shelveId, batchId);
            boolean authorized = false;
            for (Map<String, Object> cell : cells) {
                int cx = toIntVal(cell.get("positionX"));
                int cy = toIntVal(cell.get("positionY"));
                if (cx == x && cy == y) {
                    if (isCellVisible(cell, groups)) {
                        authorized = true;
                    }
                    break;
                }
            }
            if (!authorized) {
                throw new IllegalStateException("无权限编辑：该笼位不属于您的课题组");
            }
        }
        annotationMapper.upsert(shelveId, x, y, position, richText, images, aroRawData, user.getId());
    }

    // ---- cage shelf pin (favorite) ----

    /**
     * 切换笼架收藏状态。不使用 exists 检查（避免 TOCTOU 竞态），
     * 直接尝试 DELETE → 若影响行数为 0 则 INSERT。DELETE 会清除所有匹配行
     * （包括可能的重复行——在唯一键缺失时的防御措施）。
     */
    @Transactional(rollbackFor = Exception.class)
    public void togglePin(User user, String shelveId) {
        // Always delete all matching rows first (handles any duplicates from broken unique key)
        int deleted = cageShelfPinMapper.delete(user.getId(), shelveId);
        log.error("[DIAG-TOGGLE] userId={} shelveId={} deleted={}", user.getId(), shelveId, deleted);
        if (deleted == 0) {
            int inserted = cageShelfPinMapper.insert(user.getId(), shelveId);
            log.error("[DIAG-TOGGLE] INSERT result={}", inserted);
        }
        int count = cageShelfPinMapper.exists(user.getId(), shelveId);
        log.error("[DIAG-TOGGLE] after toggle, countByUserAndShelve={}", count);
    }

    public boolean isPinned(User user, String shelveId) {
        return cageShelfPinMapper.exists(user.getId(), shelveId) > 0;
    }

    /**
     * 返回用户收藏的所有笼架详情。
     * shelveId 全局唯一 → 从 cage_shelf_index 反向查 roomId，从 grid cache 读笼位数据。
     */
    public List<Map<String, Object>> getPinnedShelves(User user) {
        log.error("[DIAG] getPinnedShelves userId={}", user.getId());
        List<String> shelveIds = cageShelfPinMapper.selectPinnedShelveIds(user.getId());
        log.error("[DIAG] student_cage_shelf_pin returned {} rows: {}", shelveIds.size(), shelveIds);
        List<Map<String, Object>> result = new ArrayList<>();
        for (String sid : shelveIds) {
            if (sid == null || sid.isBlank()) continue;
            try {
                // Verify shelveId still exists; auto-clean stale bookmarks
                CageShelfIndex idx = cageShelfMapper.findByShelveId(sid);
                if (idx == null) {
                    log.warn("[CageShelf-Bookmark] Stale bookmark shelveId={} — auto-removing", sid);
                    cageShelfPinMapper.delete(user.getId(), sid);
                    continue;
                }
                Map<String, Object> detail = getShelfDetail(user, sid);
                // If the grid cache is empty, try to populate it from ARO
                Object gridObj = detail.get("grid");
                if (gridObj instanceof List && ((List<?>) gridObj).isEmpty()) {
                    log.info("[CageShelf-Bookmark] Empty cache for shelveId={}, triggering refresh", sid);
                    try {
                        cageShelfService.refreshShelfDetail(sid);
                        detail = getShelfDetail(user, sid); // re-read after refresh
                    } catch (Exception refreshEx) {
                        log.warn("[CageShelf-Bookmark] Refresh failed for shelveId={}: {}", sid, refreshEx.getMessage());
                    }
                }
                detail.put("isPinned", true);
                detail.put("roomId", String.valueOf(idx.getRoomId()));
                result.add(detail);
            } catch (Exception e) {
                log.warn("Failed to load pinned shelf {} for user {}: {}", sid, user.getId(), e.getMessage());
            }
        }
        log.info("[CageShelf-Pin-Backend] getPinnedShelves DONE userId={} resultCount={}",
                user.getId(), result.size());
        return result;
    }
}
