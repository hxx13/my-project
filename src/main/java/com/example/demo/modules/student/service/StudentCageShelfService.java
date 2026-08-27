package com.example.demo.modules.student.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.entity.UserAroBinding;
import com.example.demo.modules.auth.mapper.UserAroBindingMapper;
import com.example.demo.modules.cageshelf.entity.CageShelfIndex;
import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.mapper.CageShelfMapper;
import com.example.demo.modules.cageshelf.service.CageCellIndexService;
import com.example.demo.modules.cageshelf.service.CageShelfLocalAggCache;
import com.example.demo.modules.cageshelf.service.CageShelfService;
import com.example.demo.modules.identity.service.PersonScopeService;
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
import java.util.Comparator;
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
    private final UserAroBindingMapper userAroBindingMapper;
    private final CageShelfMapper cageShelfMapper;
    private final StudentCageShelfSnapshotMapper snapshotMapper;
    private final CageCellAnnotationMapper annotationMapper;
    private final StudentCageShelfPinMapper cageShelfPinMapper;
    private final CageCellIndexService cageCellIndexService;
    private final PersonScopeService personScopeService;
    private final CageShelfLocalAggCache localAggCache;

    public StudentCageShelfService(CageShelfService cageShelfService,
                                   AroService aroService,
                                   AroPersonnelMapper aroPersonnelMapper,
                                   UserAroBindingMapper userAroBindingMapper,
                                   CageShelfMapper cageShelfMapper,
                                   StudentCageShelfSnapshotMapper snapshotMapper,
                                   CageCellAnnotationMapper annotationMapper,
                                   StudentCageShelfPinMapper cageShelfPinMapper,
                                   CageCellIndexService cageCellIndexService,
                                   PersonScopeService personScopeService,
                                   CageShelfLocalAggCache localAggCache) {
        this.cageShelfService = cageShelfService;
        this.aroService = aroService;
        this.aroPersonnelMapper = aroPersonnelMapper;
        this.userAroBindingMapper = userAroBindingMapper;
        this.cageShelfMapper = cageShelfMapper;
        this.snapshotMapper = snapshotMapper;
        this.annotationMapper = annotationMapper;
        this.cageShelfPinMapper = cageShelfPinMapper;
        this.cageCellIndexService = cageCellIndexService;
        this.personScopeService = personScopeService;
        this.localAggCache = localAggCache;
    }

    // ---- filter options ----

    /**
     * 级联筛选选项：管理员及以上看全部；其余角色仅显示本课题组有占用笼位的房间/笼架。
     */
    public Map<String, Object> getFilterOptions(User user, Integer campusId, String areaId, String floorId, String roomId) {
        if (isAdminUser(user)) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("campuses", cageShelfMapper.listCampuses());
            out.put("areas", cageShelfMapper.listAreas(campusId));
            out.put("floors", cageShelfMapper.listFloors(campusId, areaId, null));
            out.put("rooms", cageShelfMapper.listRooms(campusId, areaId, null, floorId, null));
            out.put("shelves", cageShelfMapper.listShelves(campusId, areaId, floorId, null, null, roomId, null));
            return out;
        }
        Set<String> ownGroupShelveIds = resolveOwnGroupShelveIds(user);
        List<CageShelfIndex> scope = ownGroupShelveIds.isEmpty()
                ? List.of()
                : cageShelfMapper.listIndexesByShelveIds(new ArrayList<>(ownGroupShelveIds));
        return buildScopedFilterOptions(scope, ownGroupShelveIds, campusId, areaId, floorId, roomId);
    }

    /** 手机 HTML5 笼架列表：非管理员仅返回本课题组有占用笼位的笼架 */
    public List<Map<String, Object>> listAllShelvesForMobile(User user, boolean html5PrivilegeBypass) {
        List<Map<String, Object>> rows;
        if (isAdminUser(user) || html5PrivilegeBypass) {
            rows = cageShelfMapper.listAllShelfSummaries();
        } else {
            if (resolveUserGroupNames(user.getId()).isEmpty()) {
                throw new IllegalStateException("您还没有课题组，无法选笼认领。课题组绑定 AUP，请先联系管理员绑定课题组");
            }
            Set<String> ownGroupShelveIds = resolveOwnGroupShelveIds(user);
            if (ownGroupShelveIds.isEmpty()) {
                // 有课题组但本地数据暂无本组笼位：返回空列表展示空态，而非 500
                return List.of();
            }
            rows = cageShelfMapper.listAllShelfSummaries();
            if (rows == null || rows.isEmpty()) {
                return List.of();
            }
            List<Map<String, Object>> filtered = new ArrayList<>();
            for (Map<String, Object> row : rows) {
                if (row == null) continue;
                String shelveId = objToStr(row.get("shelveId"));
                if (!ownGroupShelveIds.contains(shelveId)) continue;
                Map<String, Object> shelf = new LinkedHashMap<>(row);
                shelf.put("highlight", true);
                filtered.add(shelf);
            }
            rows = filtered;
        }
        if (rows == null || rows.isEmpty()) return List.of();

        // 本地数据源：从 cage_shelf_index + cage_cell_index + cage_cell_detail 联表统计类型分布
        // （与 admin 本地视图同源，不再走扫描快照）
        Map<String, Map<String, Long>> typeCountsMap = new java.util.LinkedHashMap<>();
        try {
            List<Map<String, Object>> treeRows = localAggCache.typeCounts();
            if (treeRows != null) {
                for (Map<String, Object> row : treeRows) {
                    String sid = objToStr(row.get("shelveId"));
                    if (sid == null || sid.isBlank()) continue;
                    Map<String, Long> tc = typeCountsMap.computeIfAbsent(sid,
                            k -> new java.util.LinkedHashMap<>());
                    tc.put("3", row.get("type3") instanceof Number n ? n.longValue() : 0L);
                    tc.put("1", row.get("type1") instanceof Number n ? n.longValue() : 0L);
                    tc.put("4", row.get("type4") instanceof Number n ? n.longValue() : 0L);
                    tc.put("2", row.get("type2") instanceof Number n ? n.longValue() : 0L);
                }
            }
        } catch (Exception e) {
            log.warn("[student-cage-shelf] 本地类型计数读取失败: {}", e.getMessage());
        }
        // 注入到每个 shelf
        for (Map<String, Object> shelf : rows) {
            String sid = objToStr(shelf.get("shelveId"));
            Map<String, Long> tc = typeCountsMap.getOrDefault(sid, Map.of());
            Map<String, Object> countsOut = new java.util.LinkedHashMap<>();
            // 顺序：饲养中(3) → 待分配(1) → 异常(4) → 空笼盒(2)
            countsOut.put("3", tc.getOrDefault("3", 0L));
            countsOut.put("1", tc.getOrDefault("1", 0L));
            countsOut.put("4", tc.getOrDefault("4", 0L));
            countsOut.put("2", tc.getOrDefault("2", 0L));
            shelf.put("cageTypeCounts", countsOut);
        }
        return rows;
    }

    // ---- shelf detail (grid) ----

    /**
     * 学生端笼架详情：直读本地数据（cage_cell_detail + cage_info_value，与 admin 本地视图同源），叠加课题组可见性过滤。
     */
    public Map<String, Object> getShelfDetail(User user, String shelveId) {
        return getShelfDetail(user, shelveId, false, false);
    }

    public Map<String, Object> getShelfDetail(User user, String shelveId, boolean realtime) {
        return getShelfDetail(user, shelveId, false, realtime);
    }

    /**
     * @param mobileHtml5PrivilegeBypass 手机 H5 特权
     * @param realtime 兼容参数（本地数据源统一直读 grid_cache，不再区分快照/实时）
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getShelfDetail(User user, String shelveId, boolean mobileHtml5PrivilegeBypass, boolean realtime) {
        boolean isAdmin = isAdminUser(user) || mobileHtml5PrivilegeBypass;
        if (!isAdmin && !canAccessShelve(user, shelveId)) {
            if (resolveUserGroupNames(user.getId()).isEmpty()) {
                throw new IllegalStateException("您还没有课题组，无法选笼认领。课题组绑定 AUP，请先联系管理员绑定课题组");
            }
            throw new IllegalStateException("无权限查看该笼架");
        }

        // 本地数据源：直读 cage_cell_detail + cage_info_value（与 admin 本地视图 getLocalShelfGrid 同源），
        // 不再走 grid_cache / 快照。仅 web 教职工视角的 ARO 切换使用快照数据。
        CageShelfIndex idx = cageShelfMapper.findByShelveId(shelveId);
        if (idx == null) {
            throw new IllegalStateException("未找到该笼架索引");
        }
        Map<String, Object> adminDetail = cageCellIndexService.getLocalShelfGrid(idx.getId());

        // 权限控制
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
            boolean visible = isAdmin || isCellVisible(gridCell, groupNames);
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

    /**
     * 对本地 DB 笼架网格按课题组可见性脱敏：admin 全量；其余角色仅本课题组可见，
     * 非本组 cell 置 visible=false 并对 PI/部门脱敏为 ***。供降级后的共享读接口复用。
     */
    public List<Map<String, Object>> maskGridForUser(User user, List<Map<String, Object>> grid) {
        if (grid == null) {
            return List.of();
        }
        boolean isAdmin = isAdminUser(user);
        List<String> groupNames = isAdmin ? List.of() : resolveUserGroupNames(user.getId());
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> cell : grid) {
            Map<String, Object> c = new LinkedHashMap<>(cell);
            Boolean empty = cell.get("empty") instanceof Boolean b ? b : false;
            if (Boolean.TRUE.equals(empty)) {
                c.put("visible", true);
            } else {
                boolean visible = isAdmin || isCellVisible(c, groupNames);
                c.put("visible", visible);
                if (!visible) {
                    c.put("projectPiName", "***");
                    c.put("piName", "***");
                    c.put("departmentName", "***");
                    c.put("aupNumber", "");
                    // specialStatuses（需分笼/健康异常等）是笼位状态，非课题组归属信息，保留不做脱敏，
                    // 否则学生视角下非本组笼位的特殊状态色块会丢失。
                    Map<String, Object> detail = castMap(c.get("detail"));
                    if (detail != null) {
                        detail.put("projectPiName", "***");
                        detail.put("piName", "***");
                        detail.put("departmentName", "***");
                        detail.put("aupNumber", "");
                    }
                }
            }
            out.add(c);
        }
        return out;
    }

    /**
     * 对单个笼位详情按课题组脱敏：admin 全量；其余角色非本组时，PI/部门/AUP/实验员/实验记录置 *** 或空。
     * 供降级后的 detail/{animalCageId}、shelf/{id}/details 接口复用，避免学生读到非本组敏感数据。
     */
    public CageCellDetail maskDetailForUser(User user, CageCellDetail detail) {
        if (detail == null || isAdminUser(user)) {
            return detail;
        }
        List<String> groupNames = resolveUserGroupNames(user.getId());
        String pi = detail.getProjectPiName() != null && !detail.getProjectPiName().isBlank()
                ? detail.getProjectPiName()
                : detail.getPiName();
        boolean visible = PersonnelProjectGroupUtil.cellBelongsToAnyUserGroup(groupNames, pi, detail.getDepartmentName());
        if (visible) {
            return detail;
        }
        detail.setPiName("***");
        detail.setProjectPiName("***");
        detail.setProjectName("***");
        detail.setDepartmentName("***");
        detail.setAupNumber("");
        detail.setExperimenterName("***");
        detail.setLabAssistantName("***");
        detail.setExperimentDesc("");
        detail.setImagesJson("[]");
        return detail;
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
        List<Map<String, Object>> shelves = cageShelfMapper.listIndexes(null, null, null, null, null, 100000, 0);
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

    /** 非管理员是否可访问该笼架（须为本课题组有占用笼位的笼架） */
    public boolean canAccessShelve(User user, String shelveId) {
        if (user == null || shelveId == null || shelveId.isBlank()) {
            return false;
        }
        if (isAdminUser(user)) {
            return true;
        }
        return resolveOwnGroupShelveIds(user).contains(shelveId.trim());
    }

    /**
     * 本课题组有占用笼位的笼架 ID（本地数据源：cage_cell_detail 表单字段
     * project_pi_name/pi_name/department_name 判定课题组归属，与 admin 本地视图
     * getLocalShelfGrid 同源，不再走 grid_cache / 快照）。
     */
    private Set<String> resolveOwnGroupShelveIds(User user) {
        List<String> groupNames = resolveUserGroupNames(user.getId());
        if (groupNames.isEmpty()) {
            return Set.of();
        }
        Set<String> shelveIds = new LinkedHashSet<>();
        try {
            for (Map<String, Object> row : localAggCache.attribution()) {
                String sid = objToStr(row.get("shelveId"));
                if (sid.isBlank()) continue;
                String projectPi = objToStr(row.get("projectPiName"));
                String pi = objToStr(row.get("piName"));
                String dept = objToStr(row.get("departmentName"));
                String cellPi = projectPi.isEmpty() ? pi : projectPi;
                if (PersonnelProjectGroupUtil.cellBelongsToAnyUserGroup(groupNames, cellPi, dept)) {
                    shelveIds.add(sid);
                }
            }
        } catch (Exception e) {
            log.warn("[student-cage-shelf] 本地笼架归属发现失败: {}", e.getMessage());
        }
        return shelveIds;
    }

    private Map<String, Object> buildScopedFilterOptions(List<CageShelfIndex> scope,
                                                         Set<String> ownGroupShelveIds,
                                                         Integer campusId,
                                                         String areaId,
                                                         String floorId,
                                                         String roomId) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (scope == null || scope.isEmpty()) {
            out.put("campuses", List.of());
            out.put("areas", List.of());
            out.put("floors", List.of());
            out.put("rooms", List.of());
            out.put("shelves", List.of());
            return out;
        }

        out.put("campuses", distinctCampuses(scope));
        out.put("areas", distinctAreas(filterByCampus(scope, campusId)));
        out.put("floors", distinctFloors(filterByCampusAndArea(scope, campusId, areaId)));
        out.put("rooms", distinctRooms(filterByCampusAreaFloor(scope, campusId, areaId, floorId), ownGroupShelveIds));
        out.put("shelves", distinctShelves(filterByCampusAreaFloorRoom(scope, campusId, areaId, floorId, roomId), ownGroupShelveIds));
        return out;
    }

    private List<CageShelfIndex> filterByCampus(List<CageShelfIndex> scope, Integer campusId) {
        if (campusId == null) {
            return scope;
        }
        return scope.stream().filter(r -> campusId.equals(r.getCampusId())).toList();
    }

    private List<CageShelfIndex> filterByCampusAndArea(List<CageShelfIndex> scope, Integer campusId, String areaId) {
        List<CageShelfIndex> base = filterByCampus(scope, campusId);
        if (areaId == null || areaId.isBlank()) {
            return base;
        }
        return base.stream().filter(r -> areaId.equals(String.valueOf(r.getAreaId()))).toList();
    }

    private List<CageShelfIndex> filterByCampusAreaFloor(List<CageShelfIndex> scope,
                                                          Integer campusId,
                                                          String areaId,
                                                          String floorId) {
        List<CageShelfIndex> base = filterByCampusAndArea(scope, campusId, areaId);
        if (floorId == null || floorId.isBlank()) {
            return base;
        }
        return base.stream().filter(r -> floorId.equals(String.valueOf(r.getFloorId()))).toList();
    }

    private List<CageShelfIndex> filterByCampusAreaFloorRoom(List<CageShelfIndex> scope,
                                                              Integer campusId,
                                                              String areaId,
                                                              String floorId,
                                                              String roomId) {
        List<CageShelfIndex> base = filterByCampusAreaFloor(scope, campusId, areaId, floorId);
        if (roomId == null || roomId.isBlank()) {
            return base;
        }
        return base.stream().filter(r -> roomId.equals(String.valueOf(r.getRoomId()))).toList();
    }

    private List<Map<String, Object>> distinctCampuses(List<CageShelfIndex> rows) {
        Map<Integer, Map<String, Object>> map = new LinkedHashMap<>();
        for (CageShelfIndex r : rows) {
            if (r.getCampusId() == null) continue;
            map.putIfAbsent(r.getCampusId(), mapOf(
                    "campusId", r.getCampusId(),
                    "campusName", nullToEmpty(r.getCampusName())));
        }
        return map.values().stream()
                .sorted(Comparator.comparing(m -> String.valueOf(m.get("campusId"))))
                .toList();
    }

    private List<Map<String, Object>> distinctAreas(List<CageShelfIndex> rows) {
        Map<String, Map<String, Object>> map = new LinkedHashMap<>();
        for (CageShelfIndex r : rows) {
            if (r.getAreaId() == null) continue;
            String key = String.valueOf(r.getAreaId());
            map.putIfAbsent(key, mapOf("areaId", key, "areaName", nullToEmpty(r.getAreaName())));
        }
        return map.values().stream()
                .sorted(Comparator.comparing(m -> String.valueOf(m.get("areaId"))))
                .toList();
    }

    private List<Map<String, Object>> distinctFloors(List<CageShelfIndex> rows) {
        Map<String, Map<String, Object>> map = new LinkedHashMap<>();
        for (CageShelfIndex r : rows) {
            if (r.getFloorId() == null) continue;
            String key = String.valueOf(r.getFloorId());
            map.putIfAbsent(key, mapOf("floorId", key, "floorName", nullToEmpty(r.getFloorName())));
        }
        return map.values().stream()
                .sorted(Comparator.comparing(m -> String.valueOf(m.get("floorId"))))
                .toList();
    }

    private List<Map<String, Object>> distinctRooms(List<CageShelfIndex> rows, Set<String> ownGroupShelveIds) {
        Map<String, Map<String, Object>> map = new LinkedHashMap<>();
        for (CageShelfIndex r : rows) {
            if (r.getRoomId() == null) continue;
            String key = String.valueOf(r.getRoomId());
            if (!map.containsKey(key)) {
                boolean highlight = ownGroupShelveIds != null && !ownGroupShelveIds.isEmpty()
                        && r.getShelveId() != null
                        && ownGroupShelveIds.contains(String.valueOf(r.getShelveId()));
                Map<String, Object> item = mapOf("roomId", key, "roomName", nullToEmpty(r.getRoomName()));
                item.put("highlight", highlight);
                map.put(key, item);
            } else if (ownGroupShelveIds != null && r.getShelveId() != null
                    && ownGroupShelveIds.contains(String.valueOf(r.getShelveId()))) {
                map.get(key).put("highlight", true);
            }
        }
        return map.values().stream()
                .sorted(Comparator.comparing(m -> String.valueOf(m.get("roomId"))))
                .toList();
    }

    private List<Map<String, Object>> distinctShelves(List<CageShelfIndex> rows, Set<String> ownGroupShelveIds) {
        Map<String, Map<String, Object>> map = new LinkedHashMap<>();
        for (CageShelfIndex r : rows) {
            if (r.getShelveId() == null) continue;
            String key = String.valueOf(r.getShelveId());
            Map<String, Object> item = mapOf("shelveId", key, "shelveName", nullToEmpty(r.getShelveName()));
            item.put("highlight", ownGroupShelveIds != null && ownGroupShelveIds.contains(key));
            map.putIfAbsent(key, item);
        }
        return map.values().stream()
                .sorted(Comparator.comparing(m -> String.valueOf(m.get("shelveId"))))
                .toList();
    }

    private static Map<String, Object> mapOf(String k1, Object v1, String k2, Object v2) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put(k1, v1);
        m.put(k2, v2);
        return m;
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }

    private List<String> resolveUserGroupNames(String userId) {
        try {
            // STAFF_* 账号须经 user_aro_binding 展开到 aro 人员编号，否则 aro_personnel 查不到课题组
            String personnelUserId = userId;
            if (userId != null && userId.startsWith("STAFF_")) {
                UserAroBinding binding = userAroBindingMapper.selectByUserId(userId);
                if (binding != null && binding.getAroUserId() != null && !binding.getAroUserId().isBlank()) {
                    personnelUserId = binding.getAroUserId();
                }
            }
            AroPersonnel personnel = aroPersonnelMapper.findByUserId(personnelUserId);
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

    /**
     * 数据范围判定（第一层）—— 笼架是否对当前用户可见。
     * 优先级：ADMIN 全量 > 负责范围分配（校区/楼层/房间，取并集）> 课题组。
     * - 有负责范围 → 笼架的 roomId/floorId/campusId 命中分配集即可见，忽略课题组；
     * - 无负责范围 → 复用既有课题组过滤。
     * @return true = 可见，false = 应隐藏（脱敏）
     */
    public boolean isShelfVisibleForUser(User user, CageShelfIndex shelf) {
        if (shelf == null) return false;
        return isShelfVisibleForUser(user, String.valueOf(shelf.getShelveId()),
                String.valueOf(shelf.getRoomId()), String.valueOf(shelf.getFloorId()), String.valueOf(shelf.getCampusId()));
    }

    /** 是否有负责范围分配（校区/楼层/房间）。有分配时数据范围以分配为准，忽略课题组。 */
    public boolean hasScopeAssignment(User user) {
        if (user == null || isAdminUser(user)) return false;
        return !personScopeService.listGroupedByType(user.getId()).isEmpty();
    }

    /**
     * 数据范围判定（第一层）—— 仅在「有负责范围分配」时使用。
     * roomId/floorId/campusId 命中分配集即可见（取并集），都不命中则不可见。
     * 无负责范围时不应调用本方法（应走 cell 级课题组过滤 maskGridForUser）。
     */
    public boolean isShelfVisibleForUser(User user, String shelveId, String roomId, String floorId, String campusId) {
        if (isAdminUser(user)) return true;
        Map<String, List<String>> scope = personScopeService.listGroupedByType(user.getId());
        if (scope.isEmpty()) return true; // 无分配 → 交由调用方走课题组过滤
        List<String> rooms = scope.getOrDefault("ROOM", List.of());
        List<String> floors = scope.getOrDefault("FLOOR", List.of());
        List<String> campuses = scope.getOrDefault("CAMPUS", List.of());
        if (roomId != null && rooms.contains(roomId)) return true;
        if (floorId != null && floors.contains(floorId)) return true;
        if (campusId != null && campuses.contains(campusId)) return true;
        return false; // 有分配但都不命中 = 不可见
    }

    /** 教职工（STAFF+）或手机 HTML5 特权用户查看特殊状态总览时不做课题组过滤。 */
    private boolean shouldUseFullSpecialStatusOverview(User user, boolean mobileHtml5PrivilegeBypass) {
        if (mobileHtml5PrivilegeBypass || isAdminUser(user)) {
            return true;
        }
        if (user != null && user.getRole() != null
                && user.getRole().getLevel() >= RoleEnum.STAFF.getLevel()) {
            return true;
        }
        return false;
    }

    private boolean isCellVisible(Map<String, Object> cell, List<String> groupNames) {
        if (groupNames == null || groupNames.isEmpty()) {
            return false;
        }
        String[] piDept = extractCellPiAndDept(cell);
        return PersonnelProjectGroupUtil.cellBelongsToAnyUserGroup(groupNames, piDept[0], piDept[1]);
    }

    private String[] extractCellPiAndDept(Map<String, Object> cell) {
        String pi = objToStr(cell.get("projectPiName"));
        if (pi.isEmpty()) {
            pi = objToStr(cell.get("piName"));
        }
        String dept = objToStr(cell.get("departmentName"));
        Map<String, Object> cageBoxInfo = castMap(cell.get("cageBoxInfo"));
        if (cageBoxInfo != null) {
            if (pi.isEmpty()) {
                pi = trim(firstNonNullOr(cageBoxInfo, "projectPiName", cageBoxInfo.get("ProjectPiName")));
            }
            if (dept.isEmpty()) {
                dept = trim(firstNonNullOr(cageBoxInfo, "departmentName", cageBoxInfo.get("DepartmentName")));
            }
        }
        return new String[]{pi, dept};
    }

    private String[] extractCellPiAndDeptFromCageBox(Map<String, Object> cageBoxVo) {
        if (cageBoxVo == null) {
            return new String[]{"", ""};
        }
        String pi = trim(firstNonNullOr(cageBoxVo, "projectPiName", cageBoxVo.get("ProjectPiName")));
        String dept = trim(firstNonNullOr(cageBoxVo, "departmentName", cageBoxVo.get("DepartmentName")));
        return new String[]{pi, dept};
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
        String[] piDept = extractCellPiAndDeptFromCageBox(cageBoxVo);
        boolean visible = isAdmin || PersonnelProjectGroupUtil.cellBelongsToAnyUserGroup(groupNames, piDept[0], piDept[1]);

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
        return getSpecialStatusOverview(user, false);
    }

    /**
     * @param mobileHtml5PrivilegeBypass 手机 H5 特权（ADMIN+）或小程序教职工视角：跳过课题组过滤
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getSpecialStatusOverview(User user, boolean mobileHtml5PrivilegeBypass) {
        Map<String, Object> adminOverview = cageShelfService.getSpecialStatusOverview(null);

        if (shouldUseFullSpecialStatusOverview(user, mobileHtml5PrivilegeBypass)) {
            return adminOverview;
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
                if (isCellVisible(cage, groupNames)) {
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
        if (deleted == 0) {
            cageShelfPinMapper.insert(user.getId(), shelveId);
        }
    }

    public boolean isPinned(User user, String shelveId) {
        return cageShelfPinMapper.exists(user.getId(), shelveId) > 0;
    }

    /**
     * 返回用户收藏的所有笼架详情。
     * shelveId 全局唯一 → 从 cage_shelf_index 反向查 roomId，从本地 cage_cell_index 读笼位数据。
     * 收藏只是收藏了索引，数据源与「筛选」tab 保持一致走本地库，
     * 这样认领徽标（未到位/待审批/待释放）等本地字段在收藏 tab 同样可见。
     */
    public List<Map<String, Object>> getPinnedShelves(User user) {
        List<String> shelveIds = cageShelfPinMapper.selectPinnedShelveIds(user.getId());
        List<Map<String, Object>> result = new ArrayList<>();
        for (String sid : shelveIds) {
            if (sid == null || sid.isBlank()) continue;
            if (!canAccessShelve(user, sid)) continue;
            try {
                // Verify shelveId still exists; auto-clean stale bookmarks
                CageShelfIndex idx = cageShelfMapper.findByShelveId(sid);
                if (idx == null) {
                    log.warn("[CageShelf-Bookmark] Stale bookmark shelveId={} — auto-removing", sid);
                    cageShelfPinMapper.delete(user.getId(), sid);
                    continue;
                }
                // 本地网格（含 claimStatus / activeClaimId），与 /cage-cell-index/local-grid 同源。
                // 出错时返回不可变 Map.of，故统一拷进可变 Map 再补字段。
                Map<String, Object> detail =
                        new LinkedHashMap<>(cageCellIndexService.getLocalShelfGrid(idx.getId()));
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

    public String getLatestSnapshotScannedAt() {
        return cageShelfService.getLatestSnapshotScannedAt();
    }
}
