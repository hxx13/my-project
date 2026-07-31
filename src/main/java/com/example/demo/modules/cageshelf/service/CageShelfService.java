package com.example.demo.modules.cageshelf.service;

import com.alibaba.fastjson2.JSON;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.cageshelf.entity.CageShelfIndex;
import com.example.demo.modules.cageshelf.entity.CageSpecialStatusSnapshot;
import com.example.demo.modules.cageshelf.mapper.CageShelfGridCacheMapper;
import com.example.demo.modules.cageshelf.mapper.CageShelfMapper;
import com.example.demo.modules.cageshelf.mapper.CageSpecialStatusSnapshotMapper;
import com.example.demo.modules.cageshelf.support.SpecialStatusComputer;
import com.example.demo.modules.student.mapper.CageCellAnnotationMapper;
import com.example.demo.modules.cageshelf.mapper.CageShelfCellSnapshotMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.PostConstruct;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class CageShelfService {
    private final CageShelfMapper cageShelfMapper;
    private final CageSpecialStatusSnapshotMapper specialStatusSnapshotMapper;
    private final CageShelfGridCacheMapper gridCacheMapper;
    private final CageCellAnnotationMapper annotationMapper;
    private final CageShelfCellSnapshotMapper cellSnapshotMapper;
    private final AroService aroService;
    private final CageShelfRealtimeCooldown cooldown;

    public CageShelfService(CageShelfMapper cageShelfMapper,
                            CageSpecialStatusSnapshotMapper specialStatusSnapshotMapper,
                            CageShelfGridCacheMapper gridCacheMapper,
                            CageCellAnnotationMapper annotationMapper,
                            CageShelfCellSnapshotMapper cellSnapshotMapper,
                            AroService aroService,
                            CageShelfRealtimeCooldown cooldown) {
        this.cageShelfMapper = cageShelfMapper;
        this.specialStatusSnapshotMapper = specialStatusSnapshotMapper;
        this.gridCacheMapper = gridCacheMapper;
        this.annotationMapper = annotationMapper;
        this.cellSnapshotMapper = cellSnapshotMapper;
        this.aroService = aroService;
        this.cooldown = cooldown;
    }

    @PostConstruct
    public void ensureCacheTable() {
        gridCacheMapper.ensureTable();
        try {
            gridCacheMapper.addTypeCountColumns();
        } catch (Exception ignored) {
            // columns already exist
        }
        try {
            backfillGridCacheTypeCounts();
        } catch (Exception e) {
            // non-critical; will self-heal on next shelf refresh
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> importFromCsv(String userId, MultipartFile file) throws Exception {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("请上传 CSV 文件");
        }
        String name = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase();
        if (!name.endsWith(".csv")) {
            throw new IllegalArgumentException("仅支持 CSV 文件");
        }
        int created = 0;
        int updated = 0;
        int skipped = 0;
        List<String> errors = new ArrayList<>();

        cageShelfMapper.clearAll();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String headerLine = reader.readLine();
            if (headerLine == null || headerLine.isBlank()) {
                throw new IllegalArgumentException("CSV 文件为空");
            }
            List<String> headers = parseCsvLine(headerLine);
            Map<String, Integer> idx = buildHeaderIndex(headers);
            assertRequiredHeaders(idx);

            String line;
            int lineNum = 1;
            while ((line = reader.readLine()) != null) {
                lineNum++;
                if (line.isBlank()) {
                    continue;
                }
                try {
                    List<String> cells = parseCsvLine(line);
                    Long shelveId = toLong(cell(cells, idx, "架子id"));
                    Long areaId = toLong(cell(cells, idx, "区域id"));
                    String areaName = trim(cell(cells, idx, "区域名称"));
                    Long floorId = toLong(cell(cells, idx, "楼层id"));
                    String floorName = trim(cell(cells, idx, "楼层名称"));
                    Long roomId = toLong(cell(cells, idx, "房间id"));
                    String roomName = trim(cell(cells, idx, "房间名称"));
                    String shelveName = trim(cell(cells, idx, "架子名称"));
                    Integer orders = toInt(cell(cells, idx, "排序"));

                    if (shelveId == null || areaId == null || areaName.isBlank() || floorId == null
                            || floorName.isBlank() || roomId == null || roomName.isBlank()) {
                        skipped++;
                        errors.add("第" + lineNum + "行关键字段缺失");
                        continue;
                    }
                    Integer campusId = mapCampusId(areaId, areaName);

                    CageShelfIndex row = new CageShelfIndex();
                    row.setCampusId(campusId);
                    row.setCampusName(campusId == 1 ? "浦西" : "浦东");
                    row.setAreaId(areaId);
                    row.setAreaName(areaName);
                    row.setFloorId(floorId);
                    row.setFloorName(floorName);
                    row.setRoomId(roomId);
                    row.setRoomName(roomName);
                    row.setShelveId(shelveId);
                    row.setShelveName(shelveName.isBlank() ? ("架子-" + shelveId) : shelveName);
                    row.setOrders(orders == null ? 0 : orders);

                    boolean existed = cageShelfMapper.countByShelveId(shelveId) > 0;
                    cageShelfMapper.upsertIndex(row);
                    if (existed) {
                        updated++;
                    } else {
                        created++;
                    }
                } catch (Exception e) {
                    skipped++;
                    errors.add("第" + lineNum + "行解析失败: " + e.getMessage());
                }
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("created", created);
        out.put("updated", updated);
        out.put("skipped", skipped);
        out.put("errors", errors.size() > 20 ? errors.subList(0, 20) : errors);
        out.put("operatorId", userId);
        return out;
    }

    public Map<String, Object> filterOptions(Integer campusId,
                                             String areaId,
                                             String areaName,
                                             String floorId,
                                             String floorName,
                                             String roomId,
                                             String roomName) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("campuses", cageShelfMapper.listCampuses());
        out.put("areas", cageShelfMapper.listAreas(campusId));
        out.put("floors", cageShelfMapper.listFloors(campusId, areaId, trim(areaName)));
        out.put("rooms", cageShelfMapper.listRooms(campusId, areaId, trim(areaName), floorId, trim(floorName)));
        out.put("shelves", cageShelfMapper.listShelves(campusId, areaId, floorId, trim(areaName), trim(floorName), roomId, trim(roomName)));
        return out;
    }

    /**
     * 获取笼架详情：默认 snapshot-first。扫码模式下传 realtime=true 直读 grid cache。
     */
    public Map<String, Object> fetchShelfDetail(String shelveId) {
        return fetchShelfDetail(shelveId, false);
    }

    /** @param realtime true=跳过快照直读缓存（扫码模式用实时数据） */
    public Map<String, Object> fetchShelfDetail(String shelveId, boolean realtime) {
        // 1) 非实时模式：优先从最新扫描快照重建
        if (!realtime) {
            specialStatusSnapshotMapper.ensureTable();
            cellSnapshotMapper.ensureTable();
            Map<String, Object> latestInfo = specialStatusSnapshotMapper.selectLatestBatchInfo();
            if (latestInfo != null && !latestInfo.isEmpty()) {
                String latestBatchId = String.valueOf(latestInfo.getOrDefault("scanBatchId", ""));
                if (!latestBatchId.isBlank()) {
                    return buildShelfDetailFromSnapshot(shelveId, latestBatchId);
                }
            }
        }
        // 2) 快照不存在 → 回退到 grid cache（存量兼容），规范化数据对齐 snapshot 格式
        Map<String, Object> cached = gridCacheMapper.selectByShelveId(shelveId);
        if (cached != null && !cached.isEmpty()) {
            try {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> rawGrid = (List<Map<String, Object>>) (List<?>) JSON.parseArray(
                        String.valueOf(cached.getOrDefault("gridJson", "[]")), Map.class);
                @SuppressWarnings("unchecked")
                Map<String, Object> shelfMeta = (Map<String, Object>) JSON.parseObject(
                        String.valueOf(cached.getOrDefault("shelfMetaJson", "{}")), Map.class);
                // 规范化：grid_cache 中存的已是 simplifyCell 输出（有 stateLabel 字段），
                // 直接复用避免重复 simplify 导致 cageBoxVo 丢失 → 文字/配色全部清空。
                // 仅对旧格式（含 cageBoxVo 的原始 ARO 数据）才走 simplifyCell。
                CageShelfIndex idx = cageShelfMapper.findByShelveId(shelveId);
                List<Map<String, Object>> grid = new ArrayList<>();
                int filled = 0;
                for (Map<String, Object> raw : rawGrid) {
                    int x = toIntObj(raw.get("x")) != null ? toIntObj(raw.get("x")) : 0;
                    int y = toIntObj(raw.get("y")) != null ? toIntObj(raw.get("y")) : 0;
                    // 已简化（有 stateLabel 或 cageBoxInfo 且无 cageBoxVo）→ 直接复用
                    boolean alreadySimplified = raw.containsKey("stateLabel")
                            || (raw.containsKey("cageBoxInfo") && !raw.containsKey("cageBoxVo"));
                    Map<String, Object> cell = alreadySimplified ? raw : simplifyCell(raw, x, y, idx);
                    grid.add(cell);
                    if (!Boolean.TRUE.equals(cell.get("empty"))) filled++;
                }
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("shelfMeta", shelfMeta);
                out.put("grid", grid);
                out.put("totalCells", grid.size());
                out.put("filledCells", filled);
                out.put("fromCache", true);
                out.put("cachedAt", cached.getOrDefault("updatedAt", ""));
                return out;
            } catch (Exception e) {
                // 缓存解析失败 → 返回空 grid
            }
        }
        // 3) 缓存也未命中 → 从索引表获取元信息，返回空 grid
        CageShelfIndex idx = cageShelfMapper.findByShelveId(shelveId);
        Map<String, Object> shelfMeta = new LinkedHashMap<>();
        if (idx != null) {
            shelfMeta.put("campusName", idx.getCampusName() != null ? idx.getCampusName() : "");
            shelfMeta.put("areaName", idx.getAreaName() != null ? idx.getAreaName() : "");
            shelfMeta.put("floorName", idx.getFloorName() != null ? idx.getFloorName() : "");
            shelfMeta.put("roomName", idx.getRoomName() != null ? idx.getRoomName() : "");
            shelfMeta.put("shelveId", idx.getShelveId() != null ? String.valueOf(idx.getShelveId()) : shelveId);
            shelfMeta.put("shelveName", idx.getShelveName() != null ? idx.getShelveName() : shelveId);
        } else {
            shelfMeta.put("shelveId", shelveId);
            shelfMeta.put("shelveName", shelveId);
        }
        Map<String, Object> empty = new LinkedHashMap<>();
        empty.put("shelfMeta", shelfMeta);
        empty.put("grid", List.of());
        empty.put("totalCells", 80);
        empty.put("filledCells", 0);
        empty.put("fromCache", false);
        return empty;
    }

    /**
     * 获取笼架详情。batchId 非空时从快照重建历史 grid，为空时走缓存。
     */
    public Map<String, Object> fetchShelfDetail(String shelveId, String batchId) {
        if (shelveId == null || shelveId.isBlank()) {
            throw new IllegalArgumentException("shelveId 不能为空");
        }
        // 快照模式：指定 batchId 时统一走 snapshot 表（数据已规范化，键名一致）
        if (batchId != null && !batchId.isBlank()) {
            return buildShelfDetailFromSnapshot(shelveId, batchId);
        }
        // 缓存模式（无 batchId 时走 grid_cache）
        Map<String, Object> cached = gridCacheMapper.selectByShelveId(shelveId);
        if (cached != null && !cached.isEmpty()) {
            try {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> grid = (List<Map<String, Object>>) (List<?>) JSON.parseArray(
                        String.valueOf(cached.getOrDefault("gridJson", "[]")), Map.class);
                @SuppressWarnings("unchecked")
                Map<String, Object> shelfMeta = (Map<String, Object>) JSON.parseObject(
                        String.valueOf(cached.getOrDefault("shelfMetaJson", "{}")), Map.class);
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("shelfMeta", shelfMeta);
                out.put("grid", grid);
                out.put("totalCells", cached.getOrDefault("totalCells", 80));
                out.put("filledCells", cached.getOrDefault("filledCells", 0));
                out.put("fromCache", true);
                out.put("cachedAt", cached.getOrDefault("updatedAt", ""));
                return out;
            } catch (Exception e) {
                // 缓存解析失败 → 返回空 grid
            }
        }
        // 缓存未命中 → 从索引表获取元信息，返回空 grid
        CageShelfIndex idx = cageShelfMapper.findByShelveId(shelveId);
        Map<String, Object> shelfMeta = new LinkedHashMap<>();
        if (idx != null) {
            shelfMeta.put("campusName", idx.getCampusName() != null ? idx.getCampusName() : "");
            shelfMeta.put("areaName", idx.getAreaName() != null ? idx.getAreaName() : "");
            shelfMeta.put("floorName", idx.getFloorName() != null ? idx.getFloorName() : "");
            shelfMeta.put("roomName", idx.getRoomName() != null ? idx.getRoomName() : "");
            shelfMeta.put("shelveId", idx.getShelveId() != null ? String.valueOf(idx.getShelveId()) : shelveId);
            shelfMeta.put("shelveName", idx.getShelveName() != null ? idx.getShelveName() : shelveId);
        } else {
            shelfMeta.put("shelveId", shelveId);
            shelfMeta.put("shelveName", shelveId);
        }
        Map<String, Object> empty = new LinkedHashMap<>();
        empty.put("shelfMeta", shelfMeta);
        empty.put("grid", List.of());
        empty.put("totalCells", 80);
        empty.put("filledCells", 0);
        empty.put("fromCache", false);
        return empty;
    }

    /**
     * 从指定批次快照重建笼架 grid（历史数据源视图）。
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> buildShelfDetailFromSnapshot(String shelveId, String batchId) {
        specialStatusSnapshotMapper.ensureTable();
        cellSnapshotMapper.ensureTable();
        Long sid;
        try { sid = Long.parseLong(shelveId); }
        catch (NumberFormatException e) { sid = 0L; }

        List<CageSpecialStatusSnapshot> snaps = specialStatusSnapshotMapper.selectByBatchIdAndShelveId(batchId, sid);

        // 构建 shelfMeta
        CageShelfIndex idx = cageShelfMapper.findByShelveId(shelveId);
        Map<String, Object> shelfMeta = new LinkedHashMap<>();
        if (idx != null) {
            shelfMeta.put("campusName", idx.getCampusName() != null ? idx.getCampusName() : "");
            shelfMeta.put("areaName", idx.getAreaName() != null ? idx.getAreaName() : "");
            shelfMeta.put("floorName", idx.getFloorName() != null ? idx.getFloorName() : "");
            shelfMeta.put("roomName", idx.getRoomName() != null ? idx.getRoomName() : "");
            shelfMeta.put("shelveId", String.valueOf(idx.getShelveId()));
            shelfMeta.put("shelveName", idx.getShelveName() != null ? idx.getShelveName() : shelveId);
        } else if (!snaps.isEmpty()) {
            CageSpecialStatusSnapshot s = snaps.get(0);
            shelfMeta.put("campusName", s.getCampusName() != null ? s.getCampusName() : "");
            shelfMeta.put("roomName", s.getRoomName() != null ? s.getRoomName() : "");
            shelfMeta.put("shelveId", shelveId);
            shelfMeta.put("shelveName", shelveId);
        } else {
            shelfMeta.put("shelveId", shelveId);
            shelfMeta.put("shelveName", shelveId);
        }

        // 构建完整 8×10 grid（空位填充）
        Map<String, Map<String, Object>> posMap = new LinkedHashMap<>();
        for (CageSpecialStatusSnapshot s : snaps) {
            String pKey = s.getPositionX() + ":" + s.getPositionY();
            Map<String, Object> cell = new LinkedHashMap<>();
            cell.put("x", s.getPositionX());
            cell.put("y", s.getPositionY());
            cell.put("position", s.getPositionLabel());
            cell.put("empty", false);
            cell.put("animalCageType", s.getAnimalCageType() != null ? s.getAnimalCageType() : 0);
            cell.put("projectPiName", s.getProjectPiName());
            cell.put("departmentName", s.getDepartmentName());
            cell.put("piName", s.getPiName());

            // 从 snapshot 自身的 cageBoxJson 解析完整数据
            Map<String, Object> cbi = new LinkedHashMap<>();
            String cbj = s.getCageBoxJson();
            if (cbj != null && !cbj.isBlank()) {
                try { cbi = JSON.parseObject(cbj, Map.class); }
                catch (Exception ignored) { /* keep empty */ }
            }
            cell.put("cageBoxInfo", cbi);
            // 对齐 simplifyCell：snapshot cell 也需要 id（animalCageId），
            // 前端绑定/解绑 API 依赖此字段作为 animalCageIdList 参数
            Object animalCageId = cbi.get("id");
            if (animalCageId != null) {
                cell.put("id", String.valueOf(animalCageId));
            }
            // 从 QR URL 提取 cageBoxCode 方便前端扫码匹配
            String qr = s.getCageBoxQrCode();
            if (qr != null && !qr.isBlank()) {
                int ls = qr.lastIndexOf('/');
                int qi = qr.indexOf("_qrcode");
                if (ls >= 0 && qi > ls) cell.put("cageBoxCode", qr.substring(ls + 1, qi));
            }
            // projectGroup 来自 cageBoxVo.projectName
            Object pn = cbi.get("projectName");
            cell.put("projectGroup", pn instanceof String ps && !ps.isBlank() ? ps : "");

            // specialStatuses：用 snapshot 状态码重建（完整状态列表由 SpecialStatusComputer 确保）
            List<Map<String, String>> statuses = new ArrayList<>();
            if (s.getStatusCode() != null && !"NORMAL".equals(s.getStatusCode())) {
                Map<String, String> st = new LinkedHashMap<>();
                st.put("code", s.getStatusCode());
                st.put("label", s.getStatusLabel() != null ? s.getStatusLabel() : s.getStatusCode());
                if (s.getDetailName() != null) st.put("detailName", s.getDetailName());
                if (s.getDetailDescription() != null) st.put("detailDescription", s.getDetailDescription());
                statuses.add(st);
            }
            cell.put("specialStatuses", statuses);

            posMap.put(pKey, cell);
        }

        // 填充空位
        List<Map<String, Object>> grid = new ArrayList<>();
        for (int y = 1; y <= 10; y++) {
            for (int x = 1; x <= 8; x++) {
                String pKey = x + ":" + y;
                Map<String, Object> cell = posMap.get(pKey);
                if (cell == null) {
                    cell = new LinkedHashMap<>();
                    cell.put("x", x);
                    cell.put("y", y);
                    cell.put("position", (char) ('A' + x - 1) + "-" + y);
                    cell.put("empty", true);
                    cell.put("animalCageType", 0);
                    cell.put("specialStatuses", List.of());
                    cell.put("cageBoxInfo", Map.of());
                }
                grid.add(cell);
            }
        }

        int filled = (int) grid.stream().filter(c -> !Boolean.TRUE.equals(c.get("empty"))).count();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("shelfMeta", shelfMeta);
        out.put("grid", grid);
        out.put("totalCells", 80);
        out.put("filledCells", filled);
        out.put("fromCache", false);
        out.put("snapshotBatchId", batchId);
        return out;
    }

    /**
     * 强制从 ARO 实时拉取笼架数据，更新缓存后返回。
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> refreshShelfDetail(String shelveId) {
        if (shelveId == null || shelveId.isBlank()) {
            throw new IllegalArgumentException("shelveId 不能为空");
        }
        CageShelfIndex index = cageShelfMapper.findByShelveId(shelveId);
        if (index == null) {
            throw new IllegalArgumentException("未找到该笼架索引，请先导入 CSV");
        }
        Long externalId = toLong(shelveId);
        if (externalId == null) {
            throw new IllegalArgumentException("shelveId 非法");
        }
        Long roomId = index.getRoomId();
        if (roomId == null) {
            throw new IllegalArgumentException("索引中缺少房间ID，无法查询笼位列表");
        }

        Map<String, Object> raw = aroService.fetchAnimalCagesByRoomAndShelve(roomId, externalId);
        if (raw == null || raw.isEmpty()) {
            throw new IllegalStateException("外部笼位列表无响应（网络异常或未登录 ARO），请稍后重试");
        }
        if (!isAroListBodySuccess(raw)) {
            String tip = trim(raw.get("message"));
            throw new IllegalStateException(
                    tip.isEmpty() ? "官方笼位接口返回失败" : "官方笼位接口: " + tip);
        }
        Object dataObj = raw.get("data");
        if (dataObj != null && !(dataObj instanceof List<?>)) {
            throw new IllegalStateException("官方笼位接口 data 格式异常（期望笼位数组）");
        }
        List<Map<String, Object>> cages = castList(dataObj);

        Map<String, Object> statusRaw = aroService.fetchAnimalCagesStatusByBook(roomId, externalId);
        Map<String, Map<String, Object>> statusByPos = buildStatusByPosition(statusRaw);
        Map<String, Map<String, Object>> byPos = new HashMap<>();
        for (Map<String, Object> cage : cages) {
            Integer x = toIntObj(cage.get("postionX"));
            if (x == null) x = toIntObj(cage.get("positionX"));
            Integer y = toIntObj(cage.get("postionY"));
            if (y == null) y = toIntObj(cage.get("positionY"));
            if (x == null || y == null || x < 1 || x > 8 || y < 1 || y > 10) continue;
            fillStatusFromFallback(cage, statusByPos.get(y + "-" + x));
            byPos.put(y + "-" + x, simplifyCell(cage, x, y, index));
        }

        List<Map<String, Object>> grid = new ArrayList<>();
        for (int y = 1; y <= 10; y++) {
            for (int x = 1; x <= 8; x++) {
                Map<String, Object> cell = byPos.get(y + "-" + x);
                if (cell == null) {
                    cell = new LinkedHashMap<>();
                    cell.put("x", x);
                    cell.put("y", y);
                    cell.put("position", toPosition(x, y));
                    cell.put("empty", true);
                    cell.put("stateLabel", "空位");
                }
                grid.add(cell);
            }
        }

        Map<String, Object> shelfMeta = new LinkedHashMap<>();
        shelfMeta.put("campusId", index.getCampusId());
        shelfMeta.put("campusName", index.getCampusName());
        shelfMeta.put("areaName", index.getAreaName());
        shelfMeta.put("floorName", index.getFloorName());
        shelfMeta.put("roomName", index.getRoomName());
        shelfMeta.put("shelveId", String.valueOf(index.getShelveId()));
        shelfMeta.put("shelveName", index.getShelveName());

        // 写入缓存
        try {
            String gridJson = JSON.toJSONString(grid);
            String shelfMetaJson = JSON.toJSONString(shelfMeta);
            // Count animalCageType for left-sidebar progress bars
            int t1 = 0, t2 = 0, t3 = 0, t4 = 0;
            for (Map<String, Object> cell : grid) {
                Integer at = toIntObj(cell.get("animalCageType"));
                if (at == null) continue;
                switch (at) {
                    case 1 -> t1++;
                    case 2 -> t2++;
                    case 3 -> t3++;
                    case 4 -> t4++;
                }
            }
            gridCacheMapper.upsert(shelveId, gridJson, shelfMetaJson, grid.size(), byPos.size(), t1, t2, t3, t4);
        } catch (Exception e) {
            // 缓存写入失败不影响返回
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("shelfMeta", shelfMeta);
        out.put("grid", grid);
        out.put("totalCells", grid.size());
        out.put("filledCells", byPos.size());
        out.put("fromCache", false);
        return out;
    }

    /**
     * 手动打开笼位详情时，同步调用 /back + /book/ 刷新该单个笼位数据。
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> refreshCell(String shelveId, int x, int y) {
        if (shelveId == null || shelveId.isBlank()) {
            throw new IllegalArgumentException("shelveId 不能为空");
        }
        CageShelfIndex index = cageShelfMapper.findByShelveId(shelveId);
        if (index == null) {
            throw new IllegalArgumentException("未找到该笼架索引");
        }
        Long externalId = toLong(shelveId);
        Long roomId = index.getRoomId();
        if (externalId == null || roomId == null) {
            throw new IllegalArgumentException("shelveId/roomId 非法");
        }

        // 调用 /back 获取笼位数据
        Map<String, Object> raw = aroService.fetchAnimalCagesByRoomAndShelve(roomId, externalId);
        if (raw == null || raw.isEmpty() || !isAroListBodySuccess(raw)) {
            throw new IllegalStateException("外部笼位接口无响应");
        }
        List<Map<String, Object>> cages = castList(raw.get("data"));
        if (cages.isEmpty()) {
            throw new IllegalStateException("该笼架无笼位数据");
        }

        // 状态回填
        Map<String, Object> statusRaw = aroService.fetchAnimalCagesStatusByBook(roomId, externalId);
        Map<String, Map<String, Object>> statusByPos = buildStatusByPosition(statusRaw);

        // 定位到指定坐标的 cage
        Map<String, Object> target = null;
        for (Map<String, Object> cage : cages) {
            Integer cx = toIntObj(cage.get("postionX"));
            if (cx == null) cx = toIntObj(cage.get("positionX"));
            Integer cy = toIntObj(cage.get("postionY"));
            if (cy == null) cy = toIntObj(cage.get("positionY"));
            if (cx != null && cx == x && cy != null && cy == y) {
                fillStatusFromFallback(cage, statusByPos.get(y + "-" + x));
                target = cage;
                break;
            }
        }

        if (target == null) {
            throw new IllegalArgumentException("未找到坐标 (" + x + "," + y + ") 对应的笼位");
        }

        Map<String, Object> cell = simplifyCell(target, x, y, index);

        // 附带学生端标注信息
        try {
            Map<String, Object> annotation = annotationMapper.selectByPosition(shelveId, x, y);
            if (annotation != null && !annotation.isEmpty()) {
                cell.put("annotation", annotation);
            }
        } catch (Exception ignored) {
            // 标注查询失败不影响主流程
        }

        return cell;
    }

    public Map<String, Object> listIndexRows(Integer campusId, String areaId, String floorId, String roomId, int page, int size) {
        int safeSize = Math.max(10, Math.min(size, 200));
        int safePage = Math.max(1, page);
        int offset = (safePage - 1) * safeSize;
        List<Map<String, Object>> rows = cageShelfMapper.listIndexes(campusId, trim(areaId), trim(floorId), trim(roomId), safeSize, offset);
        int total = cageShelfMapper.countIndexes(campusId, trim(areaId), trim(floorId), trim(roomId));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("rows", rows);
        out.put("total", total);
        out.put("page", safePage);
        out.put("size", safeSize);
        return out;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> castMap(Object o) {
        if (o instanceof Map<?, ?> m) {
            return (Map<String, Object>) m;
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> castList(Object o) {
        if (!(o instanceof List<?> list)) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> map) {
                out.add((Map<String, Object>) map);
            }
        }
        return out;
    }

    private Map<String, Object> simplifyCell(Map<String, Object> cage, int x, int y, CageShelfIndex index) {
        Map<String, Object> cell = new LinkedHashMap<>();
        Map<String, Object> cageBoxVo = castMap(cage.get("cageBoxVo"));
        cell.put("x", toIntObj(cage.get("postionX")));
        cell.put("y", toIntObj(cage.get("postionY")));
        cell.put("postionX", toIntObj(cage.get("postionX")));
        cell.put("postionY", toIntObj(cage.get("postionY")));
        cell.put("position", toPosition(x, y));
        cell.put("empty", false);
        cell.put("id", String.valueOf(cage.get("id")));
        cell.put("name", trim(cage.get("name")));
        cell.put("piName", trim(cage.get("piName")));
        cell.put("projectGroup", cageBoxVo == null ? "" : trim(cageBoxVo.get("projectName")));
        cell.put("departmentName", cageBoxVo == null ? "" : decodeDisplayText(cageBoxVo.get("departmentName")));
        cell.put("projectPiName", cageBoxVo == null ? "" : trim(cageBoxVo.get("projectPiName")));
        cell.put("rentType", toIntObj(cage.get("rentType")));
        cell.put("animalCageType", toIntObj(cage.get("animalCageType")));
        cell.put("isCageBox", cage.get("isCageBox"));
        cell.put("stateLabel", resolveStateLabel(toIntObj(cage.get("animalCageType")), toIntObj(cage.get("rentType"))));

        // 特殊状态标记（合笼/繁殖、特殊饲养、请分笼、健康异常、动物转移）
        cell.put("specialStatuses", SpecialStatusComputer.compute(cageBoxVo));

        // UE 蓝图字段白名单二次封装：供前端按统一键名读取笼盒信息
        cell.put("cageBoxInfo", buildCageBoxInfo(cage, cageBoxVo, index, x, y));
        cell.put("detail", buildDetailWhitelist(cage, cageBoxVo));
        return cell;
    }

    /**
     * 对齐 UE 蓝图中 ST_CageData 预设字段，统一二次封装。
     */
    private static Map<String, Object> buildCageBoxInfo(Map<String, Object> cage,
                                                        Map<String, Object> cageBoxVo,
                                                        CageShelfIndex index,
                                                        int x,
                                                        int y) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("AnimalCageType", toIntObj(firstNonNull(cage, "animalCageType")));
        d.put("PositionX", x);
        d.put("PositionY", y);
        d.put("AreaId", toIntObj(firstNonNullOr(cage, "areaId", index == null ? null : index.getAreaId())));
        d.put("DepartmentName", decodeDisplayText(firstNonNull(cageBoxVo, "departmentName")));
        d.put("floorId", String.valueOf(firstNonNullOr(cage, "floorId", index == null ? "" : index.getFloorId())));
        d.put("RoomName", decodeDisplayText(firstNonNullOr(cage, "roomName", index == null ? "" : index.getRoomName())));
        d.put("ShelveName", decodeDisplayText(firstNonNullOr(cage, "shelveName", index == null ? "" : index.getShelveName())));
        d.put("ProjectPiName", decodeDisplayText(firstNonNull(cageBoxVo, "projectPiName")));
        d.put("MobilePhone", decodeDisplayText(firstNonNull(cageBoxVo, "mobilePhone")));
        d.put("AupNumber", decodeDisplayText(firstNonNull(cageBoxVo, "aupNumber")));
        d.put("cageBoxCode", decodeDisplayText(firstNonNull(cageBoxVo, "cageBoxCode")));
        d.put("CageBoxQrCode", decodeDisplayText(firstNonNullOr(cageBoxVo, "cageBoxQrCode", firstNonNull(cageBoxVo, "cageBoxCode"))));
        d.put("createAdmin", decodeDisplayText(firstNonNullOr(cageBoxVo, "createAdmin", firstNonNull(cageBoxVo, "createAdminName"))));
        d.put("CreateTime", decodeDisplayText(firstNonNull(cageBoxVo, cage, "createTime")));
        d.put("UpdateTime", decodeDisplayText(firstNonNull(cageBoxVo, cage, "updateTime")));
        d.put("SpecialBreedingName", decodeDisplayText(firstNonNull(cageBoxVo, "specialBreedingName")));
        d.put("specialBreedingDescription", decodeDisplayText(firstNonNull(cageBoxVo, "specialBreedingDescription")));
        d.put("NeedDivideYn", toIntObj(firstNonNull(cageBoxVo, "needDivideYn")));
        d.put("NeedFeedingYn", toIntObj(firstNonNull(cageBoxVo, "needFeedingYn")));
        d.put("NeedTransferYn", toIntObj(firstNonNull(cageBoxVo, "needTransferYn")));
        d.put("AbnormalHealthYn", toIntObj(firstNonNull(cageBoxVo, "abnormalHealthYn")));
        d.put("ClosingDate", decodeDisplayText(firstNonNull(cageBoxVo, "closingdate")));
        d.put("State", toIntObj(firstNonNullOr(cage, "state", firstNonNull(cage, "animalCageType"))));
        d.put("StateName", decodeDisplayText(firstNonNull(cage, "stateName")));
        d.put("HasPhysicalBox", toBooleanObj(firstNonNullOr(cage, "isCageBox", firstNonNull(cageBoxVo, "isBindAnimalCage"))));
        return d;
    }

    /**
     * 弹窗仅展示白名单字段；字符串经 URL 解码与 HTML 实体反转义（常见编码场景）。
     */
    private static Map<String, Object> buildDetailWhitelist(Map<String, Object> cage, Map<String, Object> cageBoxVo) {
        Map<String, Object> d = new LinkedHashMap<>();
        putDetail(d, "cageBoxCode", firstNonNull(cageBoxVo, "cageBoxCode"));
        putDetail(d, "createAdminName", firstNonNull(cageBoxVo, "createAdminName"));
        putDetail(d, "departmentName", firstNonNull(cageBoxVo, "departmentName"));
        putDetail(d, "isBindAnimalCage", firstNonNull(cageBoxVo, "isBindAnimalCage"));
        putDetail(d, "projectPiName", firstNonNull(cageBoxVo, "projectPiName"));
        putDetail(d, "aupNumber", firstNonNull(cageBoxVo, "aupNumber"));
        putDetail(d, "managerUserName", firstNonNull(cageBoxVo, "managerUserName"));
        putDetail(d, "piName", cage.get("piName"));
        putDetail(d, "createTime", firstNonNull(cageBoxVo, cage, "createTime"));
        putDetail(d, "updateTime", firstNonNull(cageBoxVo, cage, "updateTime"));
        return d;
    }

    private static Object firstNonNull(Map<String, Object> box, String key) {
        if (box == null) {
            return null;
        }
        return box.get(key);
    }

    private static Object firstNonNull(Map<String, Object> box, Map<String, Object> cage, String key) {
        Object a = box == null ? null : box.get(key);
        if (a != null && !isBlankScalar(a)) {
            return a;
        }
        return cage.get(key);
    }

    private static Object firstNonNullOr(Map<String, Object> source, String key, Object fallback) {
        Object v = firstNonNull(source, key);
        return v != null ? v : fallback;
    }

    private static boolean isBlankScalar(Object o) {
        if (o == null) {
            return true;
        }
        if (o instanceof String s) {
            return s.isBlank();
        }
        return false;
    }

    private static void putDetail(Map<String, Object> out, String key, Object raw) {
        out.put(key, normalizeDetailValue(raw));
    }

    private static Object normalizeDetailValue(Object raw) {
        if (raw == null) {
            return "";
        }
        if (raw instanceof Number || raw instanceof Boolean) {
            return raw;
        }
        return decodeDisplayText(raw);
    }

    /**
     * 对展示用字符串做：trim、UTF-8 形式 URL 解码（可重复一次）、常见 HTML 实体反转义。
     */
    private static String decodeDisplayText(Object v) {
        String s = v == null ? "" : String.valueOf(v).trim();
        if (s.isEmpty()) {
            return "";
        }
        s = tryUrlDecodeUtf8(s);
        s = unescapeBasicHtmlEntities(s);
        return s;
    }

    private static String tryUrlDecodeUtf8(String s) {
        if (!s.contains("%")) {
            return s;
        }
        try {
            String once = URLDecoder.decode(s, StandardCharsets.UTF_8);
            if (once.contains("%")) {
                try {
                    return URLDecoder.decode(once, StandardCharsets.UTF_8);
                } catch (IllegalArgumentException e) {
                    return once;
                }
            }
            return once;
        } catch (IllegalArgumentException e) {
            return s;
        }
    }

    private static String unescapeBasicHtmlEntities(String s) {
        return s.replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("&nbsp;", " ");
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
        // 兼容：部分返回仅给 state，不给 animalCageType；前端状态色依赖 animalCageType
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

    /**
     * 特殊状态总览：从最新扫描快照中按状态分组返回。
     */
    public Map<String, Object> getSpecialStatusOverview(String batchId) {
        // 确保表及 campus_name 列存在（存量 DB 可能缺列）
        specialStatusSnapshotMapper.ensureTable();
        try { specialStatusSnapshotMapper.addCampusColumnIfMissing(); } catch (Exception ignored) {}
        try { specialStatusSnapshotMapper.addCageBoxJsonColumnIfMissing(); } catch (Exception ignored) {}

        String scanBatchId;
        String scannedAt;

        if (batchId != null && !batchId.isBlank()) {
            scanBatchId = batchId;
            // 从批次列表中查找对应的扫描时间
            List<Map<String, Object>> batches = specialStatusSnapshotMapper.selectBatchList();
            scannedAt = batches.stream()
                    .filter(b -> scanBatchId.equals(String.valueOf(b.get("scanBatchId"))))
                    .findFirst()
                    .map(b -> String.valueOf(b.getOrDefault("scannedAt", "")))
                    .orElse("");
        } else {
            Map<String, Object> batchInfo = specialStatusSnapshotMapper.selectLatestBatchInfo();
            if (batchInfo == null || batchInfo.isEmpty()) {
                return Map.of("groups", List.of(), "totalAbnormal", 0, "scannedAt", "");
            }
            scanBatchId = String.valueOf(batchInfo.getOrDefault("scanBatchId", ""));
            scannedAt = String.valueOf(batchInfo.getOrDefault("scannedAt", ""));
        }

        List<Map<String, Object>> grouped = specialStatusSnapshotMapper.selectGroupedByStatus(scanBatchId);
        List<Map<String, Object>> groups = new ArrayList<>();
        int totalAbnormal = 0;
        for (Map<String, Object> g : grouped) {
            String statusCode = String.valueOf(g.getOrDefault("statusCode", ""));
            String statusLabel = String.valueOf(g.getOrDefault("statusLabel", ""));
            Object countObj = g.get("count");
            int count = countObj instanceof Number n ? n.intValue() : 0;
            totalAbnormal += count;

            List<CageSpecialStatusSnapshot> cages =
                    specialStatusSnapshotMapper.selectByBatchId(scanBatchId, statusCode, 0, 200);

            List<Map<String, Object>> cageList = new ArrayList<>();
            Map<String, CageShelfIndex> indexCache = new HashMap<>();
            for (var row : cages) {
                Map<String, Object> item = new LinkedHashMap<>();
                String shelveIdStr = String.valueOf(row.getShelveId());
                item.put("shelveId", shelveIdStr);
                CageShelfIndex idx = indexCache.computeIfAbsent(
                        shelveIdStr, id -> cageShelfMapper.findByShelveId(id));
                // campusName 回退：存量数据可能为空，从 shelter index 补充
                String campusName = row.getCampusName();
                if (campusName == null || campusName.isBlank()) {
                    campusName = idx != null ? idx.getCampusName() : "";
                }
                item.put("campusName", campusName != null ? campusName : "");
                String roomName = row.getRoomName();
                if ((roomName == null || roomName.isBlank()) && idx != null) {
                    roomName = idx.getRoomName();
                }
                item.put("roomName", roomName != null ? roomName : "");
                item.put("shelveName", idx != null && idx.getShelveName() != null && !idx.getShelveName().isBlank()
                        ? idx.getShelveName() : shelveIdStr);
                item.put("floorName", idx != null && idx.getFloorName() != null ? idx.getFloorName() : "");
                item.put("position", row.getPositionLabel());
                item.put("positionX", row.getPositionX());
                item.put("positionY", row.getPositionY());
                item.put("piName", row.getPiName());
                item.put("departmentName", row.getDepartmentName());
                item.put("projectPiName", row.getProjectPiName());
                item.put("cageBoxQrCode", row.getCageBoxQrCode());
                item.put("detailName", row.getDetailName());
                item.put("detailDescription", row.getDetailDescription());
                item.put("animalCageType", row.getAnimalCageType());
                cageList.add(item);
            }

            Map<String, Object> group = new LinkedHashMap<>();
            group.put("statusCode", statusCode);
            group.put("statusLabel", statusLabel);
            group.put("count", count);
            group.put("cages", cageList);
            groups.add(group);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("groups", groups);
        out.put("totalAbnormal", totalAbnormal);
        out.put("scannedAt", scannedAt);
        return out;
    }

    private static String toPosition(int x, int y) {
        char col = (char) ('A' + Math.max(0, x - 1));
        return col + "-" + y;
    }

    private static String trim(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    /** ARO 列表类接口：通常为 status=0 表示成功；无 status 时视为成功。 */
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

    private static Integer mapCampusId(Long areaId, String areaName) {
        if (areaId == null) {
            return 1;
        }
        if (areaId == 1L) {
            return 1;
        }
        if (areaId == 2L) {
            return 2;
        }
        String area = trim(areaName);
        if (area.contains("浦东")) {
            return 2;
        }
        return 1;
    }

    private static Long toLong(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(text.trim());
        } catch (Exception ignore) {
            return null;
        }
    }

    private static Integer toInt(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        try {
            return Integer.parseInt(text.trim());
        } catch (Exception ignore) {
            return null;
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

    private static Boolean toBooleanObj(Object v) {
        if (v == null) {
            return false;
        }
        if (v instanceof Boolean b) {
            return b;
        }
        if (v instanceof Number n) {
            return n.intValue() != 0;
        }
        String s = String.valueOf(v).trim();
        if (s.isEmpty()) {
            return false;
        }
        return "true".equalsIgnoreCase(s) || "1".equals(s) || "yes".equalsIgnoreCase(s) || "y".equalsIgnoreCase(s);
    }

    private static String cell(List<String> row, Map<String, Integer> idx, String header) {
        Integer i = idx.get(normalizeHeader(header));
        if (i == null || i < 0 || i >= row.size()) {
            return "";
        }
        return row.get(i);
    }

    private static Map<String, Integer> buildHeaderIndex(List<String> headers) {
        Map<String, Integer> map = new HashMap<>();
        for (int i = 0; i < headers.size(); i++) {
            String normalized = normalizeHeader(headers.get(i));
            if (!normalized.isBlank()) {
                map.put(normalized, i);
            }
        }
        // 常见别名兼容（防止大小写/BOM/命名差异导致误判缺列）
        alias(map, "架子id", "架子ID", "shelveid", "shelfid");
        alias(map, "区域id", "区域ID", "areaid");
        alias(map, "楼层id", "楼层ID", "floorid");
        alias(map, "房间id", "房间ID", "roomid");
        return map;
    }

    private static void assertRequiredHeaders(Map<String, Integer> idx) {
        String[] required = {"架子id", "区域id", "区域名称", "楼层id", "楼层名称", "房间id", "房间名称", "架子名称"};
        for (String key : required) {
            if (!idx.containsKey(normalizeHeader(key))) {
                throw new IllegalArgumentException("CSV 缺少必需表头: " + key);
            }
        }
    }

    private static void alias(Map<String, Integer> idx, String canonical, String... candidates) {
        String c = normalizeHeader(canonical);
        if (idx.containsKey(c)) {
            return;
        }
        for (String raw : candidates) {
            Integer pos = idx.get(normalizeHeader(raw));
            if (pos != null) {
                idx.put(c, pos);
                return;
            }
        }
    }

    private static String normalizeHeader(String text) {
        if (text == null) {
            return "";
        }
        return text
                .replace("\uFEFF", "")
                .replace(" ", "")
                .replace("　", "")
                .trim()
                .toLowerCase();
    }

    private static List<String> parseCsvLine(String line) {
        List<String> out = new ArrayList<>();
        if (line == null) {
            return out;
        }
        StringBuilder sb = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"') {
                if (inQuotes && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    sb.append('"');
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
                continue;
            }
            if (c == ',' && !inQuotes) {
                out.add(sb.toString().trim());
                sb.setLength(0);
                continue;
            }
            sb.append(c);
        }
        out.add(sb.toString().trim());
        return out;
    }

    /** 一次性从 grid_cache 的 grid_json 解析 animalCageType 回填 cell_snapshot */
    public Map<String, Object> seedCellSnapshotFromGridCache() {
        cellSnapshotMapper.ensureTable();
        List<Map<String, Object>> cached = gridCacheMapper.selectAllWithFilledCells();
        int totalShelves = 0, totalCells = 0;
        String batchId = "seed-" + System.currentTimeMillis();
        List<Map<String, Object>> batch = new ArrayList<>();
        for (Map<String, Object> row : cached) {
            String shelveId = String.valueOf(row.get("shelveId"));
            String gridJson = (String) row.get("gridJson");
            if (gridJson == null || gridJson.isBlank()) continue;
            try {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> grid = JSON.parseObject(gridJson, List.class);
                if (grid == null) continue;
                for (Map<String, Object> cell : grid) {
                    Object emptyObj = cell.get("empty");
                    boolean isEmpty = emptyObj instanceof Boolean b ? b : false;
                    Object typeObj = cell.get("animalCageType");
                    Integer animalCageType = null;
                    if (typeObj instanceof Number n) animalCageType = n.intValue();
                    Map<String, Object> snap = new LinkedHashMap<>();
                    snap.put("scanBatchId", batchId);
                    snap.put("shelveId", shelveId);
                    snap.put("positionX", cell.getOrDefault("x", 0));
                    snap.put("positionY", cell.getOrDefault("y", 0));
                    snap.put("positionLabel", cell.getOrDefault("position", ""));
                    snap.put("animalCageType", animalCageType);
                    snap.put("isEmpty", isEmpty);
                    batch.add(snap);
                    totalCells++;
                }
                totalShelves++;
            } catch (Exception e) {
                // skip unparseable
            }
            if (batch.size() >= 500) {
                cellSnapshotMapper.batchInsert(batch);
                batch.clear();
            }
        }
        if (!batch.isEmpty()) cellSnapshotMapper.batchInsert(batch);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("shelves", totalShelves);
        result.put("cells", totalCells);
        result.put("batchId", batchId);
        return result;
    }

    /**
     * Backfill type1~4 counts for existing grid cache rows that lack them.
     * Called once at startup; non-critical (self-heals on next shelf refresh).
     */
    @SuppressWarnings("unchecked")
    private void backfillGridCacheTypeCounts() {
        List<Map<String, Object>> rows = gridCacheMapper.selectAllForBackfill();
        if (rows == null || rows.isEmpty()) return;
        int updated = 0;
        for (Map<String, Object> row : rows) {
            String sid = String.valueOf(row.get("shelveId"));
            String gridJson = (String) row.get("gridJson");
            if (gridJson == null || gridJson.isBlank()) continue;
            try {
                List<Map<String, Object>> grid = (List<Map<String, Object>>) (List<?>)
                        JSON.parseArray(gridJson, Map.class);
                if (grid == null) continue;
                int t1 = 0, t2 = 0, t3 = 0, t4 = 0;
                for (Map<String, Object> cell : grid) {
                    Integer at = toIntObj(cell.get("animalCageType"));
                    if (at == null) continue;
                    switch (at) {
                        case 1 -> t1++;
                        case 2 -> t2++;
                        case 3 -> t3++;
                        case 4 -> t4++;
                    }
                }
                gridCacheMapper.updateTypeCounts(sid, t1, t2, t3, t4);
                updated++;
            } catch (Exception ignored) {
                // skip unparseable rows
            }
        }
        if (updated > 0) {
            // Logger not available in @PostConstruct static context — fine
        }
    }

    // ==========================================================================
    // 🔧 实时数据源 + 分配后强制刷新（2026-07-27 新增）
    // ==========================================================================

    /**
     * 实时刷新房间笼架数据（含 5min 冷却）。
     * 全房间模式：并行拉取所有 shelve → 聚合返回。
     * 单笼架模式：直接调用 refreshShelfDetail。
     *
     * @param roomId   房间 ID
     * @param shelveId 单笼架模式时传入，全房间时为 null
     * @return { shelves, roomMeta, fromRealtime, cachedAt, cooldownRemainingMs }
     */
    public Map<String, Object> refreshRoomRealtime(Long roomId, String shelveId) {
        boolean isRoomMode = (shelveId == null || shelveId.isBlank());
        String cooldownKey = isRoomMode ? (roomId + ":*") : (roomId + ":" + shelveId);

        boolean inCooldown = cooldown.isInCooldown(cooldownKey);
        long remainingMs = cooldown.remainingCooldownMs(cooldownKey);

        List<Map<String, Object>> shelves = new ArrayList<>();
        Map<String, Object> roomMeta = new LinkedHashMap<>();
        roomMeta.put("roomId", String.valueOf(roomId));

        if (isRoomMode) {
            // 全房间模式：查该房间所有 shelveId
            List<String> shelveIdList = cageShelfMapper.listShelveIdsByRoomIds(List.of(String.valueOf(roomId)));
            roomMeta.put("shelfCount", shelveIdList.size());

            if (inCooldown) {
                // 冷却期内：解析 grid_cache 原始行 → CageShelfDetail 形状
                for (String sid : shelveIdList) {
                    Map<String, Object> cached = gridCacheMapper.selectByShelveId(sid);
                    if (cached != null) {
                        Map<String, Object> parsed = new LinkedHashMap<>();
                        String gridJson = (String) cached.get("gridJson");
                        String shelfMetaJson = (String) cached.get("shelfMetaJson");
                        if (gridJson != null) parsed.put("grid", JSON.parseArray(gridJson));
                        else parsed.put("grid", List.of());
                        if (shelfMetaJson != null) parsed.put("shelfMeta", JSON.parseObject(shelfMetaJson));
                        else parsed.put("shelfMeta", Map.of());
                        parsed.put("totalCells", cached.getOrDefault("totalCells", 0));
                        parsed.put("filledCells", cached.getOrDefault("filledCells", 0));
                        parsed.put("fromCache", true);
                        parsed.put("cachedAt", cached.getOrDefault("updatedAt", ""));
                        shelves.add(parsed);
                    }
                }
            } else {
                // 不在冷却 → 并行拉取，按 shelveIdList 原序收集结果
                java.util.concurrent.ConcurrentHashMap<String, Map<String, Object>> resultMap = new java.util.concurrent.ConcurrentHashMap<>();
                java.util.concurrent.CompletableFuture<?>[] futures = shelveIdList.stream()
                    .map(sid -> java.util.concurrent.CompletableFuture.runAsync(() -> {
                        try {
                            Map<String, Object> detail = refreshShelfDetail(sid);
                            if (detail != null && !detail.isEmpty()) {
                                resultMap.put(sid, detail);
                            }
                        } catch (Exception e) {
                            // 单个笼架失败不影响其他
                        }
                    }))
                    .toArray(java.util.concurrent.CompletableFuture[]::new);
                java.util.concurrent.CompletableFuture.allOf(futures).join();
                // 按 shelveIdList 原序收集，保证前端架子按排序字段排列
                for (String sid : shelveIdList) {
                    Map<String, Object> detail = resultMap.get(sid);
                    if (detail != null) {
                        shelves.add(detail);
                    }
                }
            }
        } else {
            // 单笼架模式
            roomMeta.put("shelfCount", 1);
            if (inCooldown) {
                Map<String, Object> cached = gridCacheMapper.selectByShelveId(shelveId);
                if (cached != null) {
                    Map<String, Object> parsed = new LinkedHashMap<>();
                    String gridJson = (String) cached.get("gridJson");
                    String shelfMetaJson = (String) cached.get("shelfMetaJson");
                    parsed.put("grid", gridJson != null ? JSON.parseArray(gridJson) : List.of());
                    parsed.put("shelfMeta", shelfMetaJson != null ? JSON.parseObject(shelfMetaJson) : Map.of());
                    parsed.put("totalCells", cached.getOrDefault("totalCells", 0));
                    parsed.put("filledCells", cached.getOrDefault("filledCells", 0));
                    parsed.put("fromCache", true);
                    parsed.put("cachedAt", cached.getOrDefault("updatedAt", ""));
                    shelves.add(parsed);
                }
            } else {
                try {
                    Map<String, Object> detail = refreshShelfDetail(shelveId);
                    if (detail != null && !detail.isEmpty()) shelves.add(detail);
                } catch (Exception e) {
                    // ignore
                }
            }
        }

        if (!inCooldown) {
            cooldown.markFetched(cooldownKey);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("shelves", shelves);
        out.put("roomMeta", roomMeta);
        out.put("fromRealtime", !inCooldown);
        out.put("cachedAt", java.time.LocalDateTime.now().toString());
        out.put("cooldownRemainingMs", remainingMs);
        return out;
    }

    /**
     * 分配/取消后强制刷新（绕过冷却）。
     */
    public Map<String, Object> forceRefreshAfterMutation(Long roomId) {
        cooldown.forceRefreshRoom(roomId);
        return refreshRoomRealtime(roomId, null);
    }

    /** 获取最新快照扫描时间（供前端列表页展示数据源时间戳）。 */
    public String getLatestSnapshotScannedAt() {
        try {
            specialStatusSnapshotMapper.ensureTable();
            Map<String, Object> info = specialStatusSnapshotMapper.selectLatestBatchInfo();
            if (info != null && !info.isEmpty()) {
                Object at = info.get("scannedAt");
                return at != null ? String.valueOf(at) : "";
            }
        } catch (Exception ignored) { /* 非关键路径 */ }
        return "";
    }
}
