package com.example.demo.modules.cageshelf.service;

import com.alibaba.fastjson2.JSON;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.entity.CageCellIndex;
import com.example.demo.modules.cageshelf.entity.CageClaim;
import com.example.demo.modules.cageshelf.entity.CageShelfIndex;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellIndexMapper;
import com.example.demo.modules.cageshelf.mapper.CageClaimMapper;
import com.example.demo.modules.cageshelf.mapper.CageShelfMapper;
import com.example.demo.modules.cageshelf.support.CageFieldMappingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class CageCellIndexService {

    private static final Logger log = LoggerFactory.getLogger(CageCellIndexService.class);
    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final String MAPPING_VERSION = "5";

    private final CageCellIndexMapper cellIndexMapper;
    private final CageCellDetailMapper detailMapper;
    private final CageShelfMapper shelfMapper;
    private final CageClaimMapper claimMapper;
    private final AroService aroService;
    private final CageFieldMappingService mappingService;
    private final UserDisplayNameService userDisplayNameService;
    private final CageInfoValueService infoValueService;

    public CageCellIndexService(CageCellIndexMapper cellIndexMapper,
                                CageCellDetailMapper detailMapper,
                                CageShelfMapper shelfMapper,
                                CageClaimMapper claimMapper,
                                AroService aroService,
                                CageFieldMappingService mappingService,
                                UserDisplayNameService userDisplayNameService,
                                CageInfoValueService infoValueService) {
        this.cellIndexMapper = cellIndexMapper;
        this.detailMapper = detailMapper;
        this.shelfMapper = shelfMapper;
        this.claimMapper = claimMapper;
        this.aroService = aroService;
        this.mappingService = mappingService;
        this.userDisplayNameService = userDisplayNameService;
        this.infoValueService = infoValueService;
    }

    /**
     * 全量同步：遍历所有架子，调 ARO /back 拿笼位ID，写入 cage_cell_index。
     * @param roomId 可选，限定只同步某个房间
     * @return 同步统计
     */
    public Map<String, Object> syncAllCells(Long roomId) {
        LocalDateTime startedAt = LocalDateTime.now();
        // 从本地索引表取所有架子
        List<Map<String, Object>> shelfList;
        if (roomId != null) {
            shelfList = shelfMapper.listShelves(null, null, null, null, null,
                    String.valueOf(roomId), null);
        } else {
            shelfList = shelfMapper.listAllShelfSummaries();
        }

        if (shelfList == null || shelfList.isEmpty()) {
            return Map.of("ok", false, "error", "本地架子索引为空，请先导入架子数据");
        }

        int totalShelves = shelfList.size();
        int successShelves = 0;
        int failShelves = 0;
        int totalCells = 0;
        List<Map<String, Object>> failures = new ArrayList<>();

        log.info("[cell-sync] 开始全量笼位ID同步，共 {} 个架子", totalShelves);

        for (Map<String, Object> shelf : shelfList) {
            Long sRoomId = toLongSafe(shelf.get("roomId"));
            Long shelveId = toLongSafe(shelf.get("shelveId"));
            Long shelfIdxId = toLongSafe(shelf.get("id"));
            String location = shelf.get("campusName") + "/" + shelf.get("roomName")
                    + "/" + shelf.get("shelveName");

            if (sRoomId == null || shelveId == null) {
                failShelves++;
                failures.add(Map.of("shelveId", String.valueOf(shelveId),
                        "error", "roomId或shelveId缺失"));
                continue;
            }

            if (shelfIdxId == null) {
                failShelves++;
                log.warn("[cell-sync] shelveId={} 本地架子索引无 id 字段，跳过", shelveId);
                failures.add(Map.of("shelveId", String.valueOf(shelveId),
                        "error", "本地架子索引无id字段"));
                continue;
            }

            try {
                // 先拉 /back，成功后才清旧索引：ARO 挂掉/返回空时保留本地旧数据，避免一键同步把索引清空
                Map<String, Object> aroResp = aroService.fetchAnimalCagesByRoomAndShelve(sRoomId, shelveId);
                Object dataObj = aroResp.get("data");
                if (!(dataObj instanceof List<?> list)) {
                    failShelves++;
                    failures.add(Map.of("shelveId", String.valueOf(shelveId),
                            "error", "ARO 返回无 data/list"));
                    continue;
                }

                // 拉取成功，再清掉该架子的旧索引
                int deleted = cellIndexMapper.deleteByShelveId(shelveId);
                log.info("[cell-sync] {} | shelveId={} idx={} 清理:{}条",
                        location, shelveId, shelfIdxId, deleted);

                // 解析每个笼位 —— 本步只写 cage_cell_index（ID/坐标/笼盒），
                // 详情/状态由后续 /list（补全详情）与 /book（状态）负责，避免此步空字段冲掉已补全内容
                List<CageCellIndex> batch = new ArrayList<>();
                String now = DT_FMT.format(LocalDateTime.now());

                for (Object item : list) {
                    if (!(item instanceof Map<?, ?> cage)) continue;
                    Map<String, Object> cageMap = (Map<String, Object>) cage;

                    // 跳过笼盒条目 — /back 返回 mix 了笼位和笼盒，笼盒 id 是 cageBoxId 不是 animalCageId
                    if (isTruthy(cageMap.get("isCageBox"))) continue;

                    Integer x = toInt(firstNonNull(cageMap.get("postionX"), cageMap.get("positionX")));
                    Integer y = toInt(firstNonNull(cageMap.get("postionY"), cageMap.get("positionY")));
                    if (x == null || y == null || x < 1 || x > 8 || y < 1 || y > 10) continue;

                    Long animalCageId = toLongSafe(cageMap.get("id"));
                    Map<String, Object> cageBoxVo = castMap(cageMap.get("cageBoxVo"));
                    boolean hasCageBox = cageBoxVo != null && cageBoxVo.get("cageBoxCode") != null
                            && !String.valueOf(cageBoxVo.get("cageBoxCode")).isBlank();
                    String cageBoxCode = hasCageBox ? String.valueOf(cageBoxVo.get("cageBoxCode")).trim() : null;

                    CageCellIndex cell = new CageCellIndex();
                    cell.setShelfIndexId(shelfIdxId);
                    cell.setShelveId(shelveId);
                    cell.setPositionX(x);
                    cell.setPositionY(y);
                    cell.setAnimalCageId(animalCageId);
                    cell.setHasCageBox(hasCageBox);
                    cell.setCageBoxCode(cageBoxCode);
                    cell.setLastSyncStatus(animalCageId != null ? "OK" : "EMPTY");
                    cell.setSyncedAt(now);
                    batch.add(cell);
                }

                // 批量写入 cage_cell_index
                if (!batch.isEmpty()) {
                    cellIndexMapper.batchUpsert(batch);
                    totalCells += batch.size();
                }

                successShelves++;
                log.info("[cell-sync] {} | shelveId={} → {} cells",
                        location, shelveId, batch.size());

            } catch (Exception e) {
                failShelves++;
                log.warn("[cell-sync] shelveId={} 同步失败: {}", shelveId, e.getMessage());
                failures.add(Map.of("shelveId", String.valueOf(shelveId),
                        "error", e.getMessage()));
            }
        }

        String finishedAt = DT_FMT.format(LocalDateTime.now());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("totalShelves", totalShelves);
        result.put("successShelves", successShelves);
        result.put("failShelves", failShelves);
        result.put("totalCellsWritten", totalCells);
        result.put("startedAt", DT_FMT.format(startedAt));
        result.put("finishedAt", finishedAt);
        if (!failures.isEmpty()) {
            result.put("failures", failures);
        }
        log.info("[cell-sync] 完成: {}成功 {}失败, 写入{}个笼位",
                successShelves, failShelves, totalCells);
        return result;
    }

    /** 按架子查询笼位 */
    public List<CageCellIndex> getCellsByShelfIndexId(Long shelfIndexId) {
        return cellIndexMapper.selectByShelfIndexId(shelfIndexId);
    }

    /** 通过 shelveId 从本地DB加载（先尝试 PK，再尝试 shelve_id 列） */
    public Map<String, Object> getLocalShelfGridByShelveId(Long id) {
        // 先按主键查
        CageShelfIndex idx = shelfMapper.findById(id);
        if (idx != null) return getLocalShelfGrid(id);
        // 再按 shelve_id 列查
        idx = shelfMapper.findByShelveId(String.valueOf(id));
        if (idx == null) return Map.of("error", "架子不存在: " + id);
        return getLocalShelfGrid(idx.getId());
    }

    /** 从本地DB加载笼架网格数据（格式对齐 ARO CageShelfDetail） */
    public Map<String, Object> getLocalShelfGrid(Long shelfIndexId) {
        // 查位置索引
        CageShelfIndex shelfIndex = shelfMapper.findById(shelfIndexId);
        if (shelfIndex == null) return Map.of("error", "架子不存在: " + shelfIndexId);

        // 查笼位索引 + 详情
        List<CageCellIndex> cells = cellIndexMapper.selectByShelfIndexId(shelfIndexId);
        List<CageCellDetail> details = detailMapper.selectByShelfIndexId(shelfIndexId);
        Map<Long, CageCellDetail> detailMap = new LinkedHashMap<>();
        for (CageCellDetail d : details) detailMap.put(d.getAnimalCageId(), d);

        // JOIN 漏载兜底：索引有 animalCageId 但详情未进 JOIN 结果时，按主键补查
        List<Long> missingIds = new ArrayList<>();
        for (CageCellIndex cell : cells) {
            Long id = cell.getAnimalCageId();
            if (id != null && !detailMap.containsKey(id)) missingIds.add(id);
        }
        if (!missingIds.isEmpty()) {
            for (CageCellDetail d : detailMapper.selectByAnimalCageIds(missingIds)) {
                detailMap.put(d.getAnimalCageId(), d);
            }
        }

        // 状态标记以表单(cage_info_value)为真相源：覆盖 detail 的 5 个状态布尔，
        // 后续 specialStatuses / 前端读侧（详情 chips、编辑模式反向使能）都以此为准。
        Map<Long, Map<String, Boolean>> statusFlags = infoValueService.statusFlagsByCage(
                new ArrayList<>(detailMap.keySet()));
        for (Map.Entry<Long, CageCellDetail> e : detailMap.entrySet()) {
            Map<String, Boolean> flags = statusFlags.get(e.getKey());
            if (flags == null) continue;
            CageCellDetail d = e.getValue();
            if (flags.containsKey("needs_division")) d.setNeedsDivision(flags.get("needs_division"));
            if (flags.containsKey("needs_special_feeding")) d.setNeedsSpecialFeeding(flags.get("needs_special_feeding"));
            if (flags.containsKey("needs_transfer")) d.setNeedsTransfer(flags.get("needs_transfer"));
            if (flags.containsKey("has_health_abnormality")) d.setHasHealthAbnormality(flags.get("has_health_abnormality"));
            if (flags.containsKey("needs_cohabitation")) d.setNeedsCohabitation(flags.get("needs_cohabitation"));
        }

        // 批量解析占用者(所属人)姓名:复用 UserDisplayNameService,不裸返回 staff_id / aro_user_id
        Map<Long, CageClaim> activeClaimByCage = new LinkedHashMap<>();
        Set<String> claimantIds = new LinkedHashSet<>();
        for (CageCellIndex cell : cells) {
            Long cageId = cell.getAnimalCageId();
            if (cageId == null) continue;
            CageClaim ac = claimMapper.selectActiveByAnimalCageId(cageId);
            if (ac == null) continue;
            activeClaimByCage.put(cageId, ac);
            if (ac.getClaimantId() != null && !ac.getClaimantId().isBlank()) {
                claimantIds.add(ac.getClaimantId().trim());
            }
        }
        Map<String, String> occupantNames = userDisplayNameService.resolveDisplayNames(claimantIds);

        // 构建 grid
        List<Map<String, Object>> grid = new ArrayList<>();
        for (CageCellIndex cell : cells) {
            Map<String, Object> gc = new LinkedHashMap<>();
            gc.put("x", cell.getPositionX());
            gc.put("y", cell.getPositionY());
            gc.put("position", cell.getPositionX() + "-" + cell.getPositionY());
            // 雪花 ID 必须以字符串下发，避免前端 JSON Number 精度丢失
            String animalCageIdStr = cell.getAnimalCageId() == null ? null : String.valueOf(cell.getAnimalCageId());
            gc.put("id", animalCageIdStr);
            gc.put("animalCageId", animalCageIdStr);
            // 活跃认领 id — 供详情面板绑定认领信息表单（无活跃认领时为 null）
            CageClaim activeClaim = activeClaimByCage.get(cell.getAnimalCageId());
            Long activeClaimId = activeClaim == null ? null : activeClaim.getId();
            gc.put("activeClaimId", activeClaimId);
            // 所属人姓名（统一人员解析，不回退裸 id/ARO 空名）
            String claimantId = activeClaim == null ? null : activeClaim.getClaimantId();
            gc.put("occupantName", (claimantId != null && !claimantId.isBlank())
                    ? occupantNames.get(claimantId.trim()) : null);
            gc.put("hasCageBox", cell.getHasCageBox());
            gc.put("cageBoxCode", cell.getCageBoxCode());
            boolean empty = cell.getAnimalCageId() == null;
            gc.put("empty", empty);
            gc.put("visible", !empty); // 本地数据源不做课题组过滤，有笼位即可见

            CageCellDetail detail = detailMap.get(cell.getAnimalCageId());
            if (detail != null) {
                gc.put("cageTypeCode", detail.getCageTypeCode());
                gc.put("animalCageType", detail.getCageTypeCode()); // 前端网格图例渲染
                gc.put("rentType", detail.getRentType());
                gc.put("stateLabel", detail.getStateLabel());
                // 对齐 ARO simplifyCell：projectGroup=项目名；PI 优先课题PI
                gc.put("projectGroup", trimStr(detail.getProjectName()));
                gc.put("piName", trimStr(detail.getPiName()));
                gc.put("projectPiName", trimStr(detail.getProjectPiName()));
                gc.put("departmentName", trimStr(detail.getDepartmentName()));
                gc.put("aupNumber", trimStr(detail.getAupNumber()));
                // 与 ARO cageBoxInfo 对齐，供编辑侧栏 / 前端兜底读 ProjectPiName
                String displayPi = trimStr(detail.getProjectPiName());
                if (displayPi == null) displayPi = trimStr(detail.getPiName());
                Map<String, Object> cageBoxInfo = new LinkedHashMap<>();
                cageBoxInfo.put("ProjectPiName", displayPi);
                cageBoxInfo.put("DepartmentName", trimStr(detail.getDepartmentName()));
                cageBoxInfo.put("AupNumber", trimStr(detail.getAupNumber()));
                cageBoxInfo.put("cageBoxCode", trimStr(detail.getCageBoxCode()));
                cageBoxInfo.put("CageBoxQrCode", trimStr(detail.getCageBoxCode()));
                cageBoxInfo.put("StateName", trimStr(detail.getStateLabel()));
                cageBoxInfo.put("AnimalCageType", detail.getCageTypeCode());
                gc.put("cageBoxInfo", cageBoxInfo);
                gc.put("needsDivision", detail.getNeedsDivision());
                gc.put("needsSpecialFeeding", detail.getNeedsSpecialFeeding());
                gc.put("hasHealthAbnormality", detail.getHasHealthAbnormality());

                // 构建 specialStatuses（与 ARO 格式对齐，供前端 CageCellOverlays 渲染）
                List<Map<String, String>> statuses = new ArrayList<>();
                if (Boolean.TRUE.equals(detail.getNeedsDivision()))
                    statuses.add(Map.of("code","NEED_DIVIDE","label","需分笼","iconKey","divide"));
                if (Boolean.TRUE.equals(detail.getNeedsSpecialFeeding()))
                    statuses.add(Map.of("code","SPECIAL_FEEDING","label","需特殊饲养","iconKey","feeding"));
                if (Boolean.TRUE.equals(detail.getNeedsTransfer()))
                    statuses.add(Map.of("code","ANIMAL_TRANSFER","label","动物转移","iconKey","transfer"));
                if (Boolean.TRUE.equals(detail.getHasHealthAbnormality()))
                    statuses.add(Map.of("code","HEALTH_ABNORMAL","label","健康异常","iconKey","health"));
                if (Boolean.TRUE.equals(detail.getNeedsCohabitation()))
                    statuses.add(Map.of("code","COHABITATION","label","需合笼","iconKey","cohabitation"));
                gc.put("specialStatuses", statuses);

                gc.put("detail", detail); // 完整详情
            }
            grid.add(gc);
        }

        // 构建 shelfMeta
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("campusName", shelfIndex.getCampusName());
        meta.put("areaName", shelfIndex.getAreaName());
        meta.put("floorName", shelfIndex.getFloorName());
        meta.put("roomName", shelfIndex.getRoomName());
        meta.put("shelveId", String.valueOf(shelfIndex.getShelveId()));
        meta.put("shelveName", shelfIndex.getShelveName());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("shelfMeta", meta);
        result.put("grid", grid);
        result.put("totalCells", cells.size());
        result.put("fromLocal", true);
        return result;
    }

    /** 按 shelveId 查询笼位 */
    public List<CageCellIndex> getCellsByShelveId(Long shelveId) {
        return cellIndexMapper.selectByShelveId(shelveId);
    }

    /** 前端编辑：更新单个笼位的 animalCageId */
    public boolean updateCell(Long shelfIndexId, int x, int y, Long animalCageId) {
        return cellIndexMapper.updateAnimalCageId(shelfIndexId, x, y, animalCageId) > 0;
    }

    /**
     * 补全详情字段 — 按架子调 /admin/animalCage/list 批量获取完整 cageBoxVo，
     * 填充 PI/课题组/AUP 以及 animalStrain/Sex/Experimenter 等 /back 常不完整的字段。
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> syncDetailFields(Long roomId) {
        LocalDateTime startedAt = LocalDateTime.now();
        List<Map<String, Object>> shelfList;
        if (roomId != null) {
            shelfList = shelfMapper.listShelves(null, null, null, null, null,
                    String.valueOf(roomId), null);
        } else {
            shelfList = shelfMapper.listAllShelfSummaries();
        }

        int totalShelves = shelfList != null ? shelfList.size() : 0;
        int successShelves = 0, failShelves = 0, totalUpdated = 0, totalSkipped = 0;
        List<Map<String, Object>> failures = new ArrayList<>();
        log.info("[detail-sync] 开始补全详情字段，共 {} 个架子", totalShelves);

        int count = 0;
        for (Map<String, Object> shelf : shelfList) {
            Long shelveId = toLongSafe(shelf.get("shelveId"));
            Long shelfIdxId = toLongSafe(shelf.get("id"));
            String location = shelf.get("campusName") + "/" + shelf.get("roomName")
                    + "/" + shelf.get("shelveName");
            if (shelveId == null || shelfIdxId == null) { failShelves++; continue; }

            try {
                // 调 /list 批量获取该架子所有笼位（含完整 cageBoxVo）
                List<Map<String, Object>> cages = aroService.fetchAllAnimalCagesByShelveId(shelveId);
                if (cages.isEmpty()) { failShelves++; continue; }

                // DEBUG：打印前几个笼位的原始 ARO /list 返回，用于排查动物字段
                if (count == 0) {
                    int debugN = Math.min(3, cages.size());
                    log.info("[detail-sync-debug] shelveId={} 总共{}条, 打印前{}条原始数据:", shelveId, cages.size(), debugN);
                    for (int di = 0; di < debugN; di++) {
                        Object item = cages.get(di);
                        if (item instanceof Map<?, ?> cage) {
                            Map<String, Object> c = (Map<String, Object>) item;
                            // 只打印 cageBoxVo 内的动物关键字段
                            Map<String, Object> cbv = castMap(c.get("cageBoxVo"));
                            log.info("[detail-sync-debug] cage[{}] animalCageId={} cageBoxVo.animalStrainName={} animalSex={} animalWeekAge={} animalMaleNumber={} animalFemaleNumber={} animalComeFrom={} experimenterName={} labAssistantName={}",
                                    di, c.get("id"),
                                    cbv != null ? cbv.get("animalStrainName") : "cageBoxVo=null",
                                    cbv != null ? cbv.get("animalSex") : "-",
                                    cbv != null ? cbv.get("animalWeekAge") : "-",
                                    cbv != null ? cbv.get("animalMaleNumber") : "-",
                                    cbv != null ? cbv.get("animalFemaleNumber") : "-",
                                    cbv != null ? cbv.get("animalComeFrom") : "-",
                                    cbv != null ? cbv.get("experimenterName") : "-",
                                    cbv != null ? cbv.get("labAssistantName") : "-");
                        }
                    }
                }

                // 加载本地已有 detail 做匹配
                List<CageCellDetail> existing = detailMapper.selectByShelfIndexId(shelfIdxId);
                Map<Long, CageCellDetail> detailMap = new LinkedHashMap<>();
                for (CageCellDetail d : existing) detailMap.put(d.getAnimalCageId(), d);

                List<CageCellDetail> batch = new ArrayList<>();
                for (Object item : cages) {
                    if (!(item instanceof Map<?, ?> cage)) continue;
                    Map<String, Object> c = (Map<String, Object>) item;

                    // 映射表翻译（含 isCageBox 过滤 + animal_cage_id 提取）
                    Map<String, Object> mapped = mappingService.applyPull("list", c);
                    if (mapped == null) continue;

                    Long animalCageId = (Long) mapped.get("animal_cage_id");
                    if (animalCageId == null) continue;
                    // 双写：同步直连 cage_info_value（与固定表 cage_cell_detail 双写）
                    infoValueService.syncFromMapped(animalCageId, mapped);
                    boolean isNew = false;
                    CageCellDetail d = detailMap.get(animalCageId);
                    if (d == null) {
                        // JOIN 可能漏载：先按主键查，避免新建空对象 upsert 冲掉实验备注/照片
                        d = detailMapper.selectByAnimalCageId(animalCageId);
                        if (d == null) {
                            d = new CageCellDetail();
                            d.setAnimalCageId(animalCageId);
                            isNew = true;
                        }
                    }

                    // DEBUG：打印第一条映射后的动物/PI字段
                    if (totalUpdated == 0) {
                        log.info("[detail-sync-debug-mapped] animalCageId={} mapped fields: pi={} projectPi={} strain={} sex={} weekAge={} male={} female={} comeFrom={} exprName={} labName={}",
                                animalCageId,
                                mapped.get("pi_name"),
                                mapped.get("project_pi_name"),
                                mapped.get("animal_strain_name"),
                                mapped.get("animal_sex"),
                                mapped.get("animal_week_age"),
                                mapped.get("animal_male_number"),
                                mapped.get("animal_female_number"),
                                mapped.get("animal_come_from"),
                                mapped.get("experimenter_name"),
                                mapped.get("lab_assistant_name"));
                    }

                    // 仅当 mapping 命中该 canonical（路径存在）才覆盖：空串→null 清空；路径不存在→不动
                    // 避免 /list 某条缺 cageBoxVo.projectPiName 时用 get()==null 误清空已有 PI
                    boolean changed = isNew;
                    if (mapped.containsKey("pi_name") && !Objects.equals(mapped.get("pi_name"), d.getPiName())) {
                        d.setPiName((String) mapped.get("pi_name")); changed = true;
                    }
                    if (mapped.containsKey("project_pi_name") && !Objects.equals(mapped.get("project_pi_name"), d.getProjectPiName())) {
                        d.setProjectPiName((String) mapped.get("project_pi_name")); changed = true;
                    }
                    if (mapped.containsKey("project_name") && !Objects.equals(mapped.get("project_name"), d.getProjectName())) {
                        d.setProjectName((String) mapped.get("project_name")); changed = true;
                    }
                    if (mapped.containsKey("department_name") && !Objects.equals(mapped.get("department_name"), d.getDepartmentName())) {
                        d.setDepartmentName((String) mapped.get("department_name")); changed = true;
                    }
                    if (mapped.containsKey("aup_number") && !Objects.equals(mapped.get("aup_number"), d.getAupNumber())) {
                        d.setAupNumber((String) mapped.get("aup_number")); changed = true;
                    }
                    if (mapped.containsKey("cage_box_code") && !Objects.equals(mapped.get("cage_box_code"), d.getCageBoxCode())) {
                        String cbc = (String) mapped.get("cage_box_code");
                        d.setCageBoxCode(cbc);
                        d.setHasCageBox(cbc != null && !cbc.isBlank());
                        changed = true;
                    }
                    if (mapped.containsKey("animal_strain_name") && !Objects.equals(mapped.get("animal_strain_name"), d.getAnimalStrainName())) {
                        d.setAnimalStrainName((String) mapped.get("animal_strain_name")); changed = true;
                    }
                    if (mapped.containsKey("animal_sex") && !Objects.equals(mapped.get("animal_sex"), d.getAnimalSex())) {
                        d.setAnimalSex((String) mapped.get("animal_sex")); changed = true;
                    }
                    if (mapped.containsKey("animal_week_age") && !Objects.equals(mapped.get("animal_week_age"), d.getAnimalWeekAge())) {
                        d.setAnimalWeekAge((String) mapped.get("animal_week_age")); changed = true;
                    }
                    if (mapped.containsKey("animal_male_number") && !Objects.equals(mapped.get("animal_male_number"), d.getAnimalMaleNumber())) {
                        d.setAnimalMaleNumber((Integer) mapped.get("animal_male_number")); changed = true;
                    }
                    if (mapped.containsKey("animal_female_number") && !Objects.equals(mapped.get("animal_female_number"), d.getAnimalFemaleNumber())) {
                        d.setAnimalFemaleNumber((Integer) mapped.get("animal_female_number")); changed = true;
                    }
                    if (mapped.containsKey("animal_come_from") && !Objects.equals(mapped.get("animal_come_from"), d.getAnimalComeFrom())) {
                        d.setAnimalComeFrom((String) mapped.get("animal_come_from")); changed = true;
                    }
                    if (mapped.containsKey("experimenter_name") && !Objects.equals(mapped.get("experimenter_name"), d.getExperimenterName())) {
                        d.setExperimenterName((String) mapped.get("experimenter_name")); changed = true;
                    }
                    if (mapped.containsKey("lab_assistant_name") && !Objects.equals(mapped.get("lab_assistant_name"), d.getLabAssistantName())) {
                        d.setLabAssistantName((String) mapped.get("lab_assistant_name")); changed = true;
                    }
                    if (mapped.containsKey("cage_box_name") && !Objects.equals(mapped.get("cage_box_name"), d.getCageBoxName())) {
                        d.setCageBoxName((String) mapped.get("cage_box_name")); changed = true;
                    }

                    if (changed) {
                        // 合并详情到 raw_data
                        Map<String, Object> merged = new LinkedHashMap<>();
                        if (d.getAroRawData() != null) {
                            try { merged = JSON.parseObject(d.getAroRawData(), Map.class); } catch (Exception ignored) {}
                        }
                        merged.put("_detail", c);
                        d.setAroRawData(JSON.toJSONString(merged));
                        d.setMappingVersion(MAPPING_VERSION);
                        batch.add(d);
                        detailMap.put(animalCageId, d);
                    }
                }

                if (!batch.isEmpty()) {
                    detailMapper.batchUpsert(batch);
                    totalUpdated += batch.size();
                }
                successShelves++;
                count++;
                if (count % 20 == 0) log.info("[detail-sync] 进度: {}/{} 架子, 已更新:{}", count, totalShelves, totalUpdated);
                Thread.sleep(200);

            } catch (Exception e) {
                failShelves++;
                failures.add(Map.of("shelveId", String.valueOf(shelveId), "error", e.getMessage()));
            }
        }

        String finishedAt = DT_FMT.format(LocalDateTime.now());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("totalShelves", totalShelves);
        result.put("successShelves", successShelves);
        result.put("failShelves", failShelves);
        result.put("totalUpdated", totalUpdated);
        result.put("totalSkipped", totalSkipped);
        result.put("startedAt", DT_FMT.format(startedAt));
        result.put("finishedAt", finishedAt);
        if (!failures.isEmpty()) result.put("failures", failures);
        log.info("[detail-sync] 完成: {}架成功 {}失败, 更新{}个笼位", successShelves, failShelves, totalUpdated);
        return result;
    }

    /**
     * 独立 /book 状态同步 — 只更新 cage_type_code/state/rent_type，
     * 不删 ID 索引，不重建数据。
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> syncStatusFromBook(Long roomId) {
        LocalDateTime startedAt = LocalDateTime.now();
        List<Map<String, Object>> shelfList;
        if (roomId != null) {
            shelfList = shelfMapper.listShelves(null, null, null, null, null,
                    String.valueOf(roomId), null);
        } else {
            shelfList = shelfMapper.listAllShelfSummaries();
        }

        int totalShelves = shelfList != null ? shelfList.size() : 0;
        int successShelves = 0, failShelves = 0, totalUpdated = 0;
        log.info("[book-sync] 开始独立状态同步，共 {} 个架子", totalShelves);

        int count = 0;
        for (Map<String, Object> shelf : shelfList) {
            Long sRoomId = toLongSafe(shelf.get("roomId"));
            Long shelveId = toLongSafe(shelf.get("shelveId"));
            Long shelfIdxId = toLongSafe(shelf.get("id"));
            String location = shelf.get("campusName") + "/" + shelf.get("roomName") + "/" + shelf.get("shelveName");
            if (sRoomId == null || shelveId == null || shelfIdxId == null) { failShelves++; continue; }

            try {
                Map<String, Object> bookResp = aroService.fetchAnimalCagesStatusByBook(sRoomId, shelveId);
                Object bookData = bookResp.get("data");
                if (!(bookData instanceof List<?> bl)) {
                    log.warn("[book-sync] {} shelveId={} /book 返回非列表: {}", location, shelveId, bookData);
                    failShelves++; continue;
                }

                // 从 cage_cell_index 取已有位置→ID 映射（/back和/book可能返回不同ID）
                List<CageCellIndex> indexCells = cellIndexMapper.selectByShelfIndexId(shelfIdxId);
                Map<String, Long> posToAnimalCageId = new LinkedHashMap<>();
                for (CageCellIndex ic : indexCells) {
                    posToAnimalCageId.put(ic.getPositionX() + "-" + ic.getPositionY(), ic.getAnimalCageId());
                }


                // 按索引 animalCageId 直接查详情（JOIN 可能漏载；状态同步勿整行 upsert）
                List<Long> indexIds = new ArrayList<>();
                for (Long id : posToAnimalCageId.values()) {
                    if (id != null) indexIds.add(id);
                }
                Map<Long, CageCellDetail> detailById = new LinkedHashMap<>();
                if (!indexIds.isEmpty()) {
                    for (CageCellDetail d : detailMapper.selectByAnimalCageIds(indexIds)) {
                        detailById.put(d.getAnimalCageId(), d);
                    }
                }

                List<CageCellDetail> batch = new ArrayList<>();
                for (Object bi : bl) {
                    if (!(bi instanceof Map<?, ?> bm)) continue;
                    Map<String, Object> bc = (Map<String, Object>) bm;
                    // 映射表翻译（一次调用取所有字段）
                    Map<String, Object> mapped = mappingService.applyPull("book", bc);
                    if (mapped == null) continue;
                    Integer x = (Integer) mapped.get("position_x");
                    Integer y = (Integer) mapped.get("position_y");
                    if (x == null || y == null) continue;

                    // 按位置取正确的 animalCageId
                    Long animalCageId = posToAnimalCageId.get(x + "-" + y);
                    if (animalCageId == null) continue;
                    // 双写：同步直连 cage_info_value（与固定表 cage_cell_detail 双写）
                    infoValueService.syncFromMapped(animalCageId, mapped);

                    boolean isNew = false;
                    CageCellDetail d = detailById.get(animalCageId);
                    if (d == null) {
                        d = new CageCellDetail();
                        d.setAnimalCageId(animalCageId);
                        isNew = true; // 新记录只写状态列；PI/课题组由 /back 或 /list 详情补全
                    }

                    Integer type = (Integer) mapped.get("cage_type_code");
                    Integer state = (Integer) mapped.get("state");
                    Integer rent = (Integer) mapped.get("rent_type");
                    String label = (String) mapped.get("state_label");

                    // /book 映射仅含状态列：空也写空；不整行 upsert，避免无关列被缺省 null 冲掉
                    boolean changed = isNew;
                    if (!Objects.equals(type, d.getCageTypeCode())) { d.setCageTypeCode(type); changed = true; }
                    if (!Objects.equals(state, d.getState())) { d.setState(state); changed = true; }
                    if (!Objects.equals(rent, d.getRentType())) { d.setRentType(rent); changed = true; }
                    if (!Objects.equals(label, d.getStateLabel())) { d.setStateLabel(label); changed = true; }

                    if (changed) {
                        d.setSyncedAt(DT_FMT.format(LocalDateTime.now()));
                        batch.add(d);
                        detailById.put(animalCageId, d);
                    }
                }

                if (!batch.isEmpty()) {
                    // /book 无 PI/课题组映射，只更新状态列（非「保护本地 PI 免被空值覆盖」）
                    detailMapper.batchUpdateStatus(batch);
                    totalUpdated += batch.size();
                }
                successShelves++;
                count++;
                if (count % 50 == 0) log.info("[book-sync] 进度: {}/{} 架子, 更新:{}", count, totalShelves, totalUpdated);

            } catch (Exception e) {
                failShelves++;
                log.warn("[book-sync] shelveId={} 状态同步失败: {}", shelveId, e.getMessage());
            }
        }

        String finishedAt = DT_FMT.format(LocalDateTime.now());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("totalShelves", totalShelves);
        result.put("successShelves", successShelves);
        result.put("failShelves", failShelves);
        result.put("totalUpdated", totalUpdated);
        result.put("startedAt", DT_FMT.format(startedAt));
        result.put("finishedAt", finishedAt);
        log.info("[book-sync] 完成: {}架成功 {}失败, 更新{}个笼位状态",
                successShelves, failShelves, totalUpdated);
        return result;
    }

    /**
     * 一键本地笼位同步（固定顺序，避免手动乱序冲空 PI）：
     * 1) /back 全量建索引+详情骨架 → 2) /list 补全 PI 等详情 → 3) /book 只更新状态列。
     * 任一步硬失败（异常或 ok=false）即停止，返回 failedStep。
     */
    public Map<String, Object> syncLocalPipeline(Long roomId) {
        LocalDateTime startedAt = LocalDateTime.now();
        Map<String, Object> result = new LinkedHashMap<>();
        Map<String, Object> steps = new LinkedHashMap<>();
        List<String> completedSteps = new ArrayList<>();
        result.put("ok", false);
        result.put("steps", steps);
        result.put("completedSteps", completedSteps);
        result.put("startedAt", DT_FMT.format(startedAt));
        log.info("[local-pipeline] 开始一键同步 roomId={}", roomId);

        // ① /list 补全详情（含 PI/动物/状态标记）
        try {
            Map<String, Object> step1 = syncDetailFields(roomId);
            steps.put("syncDetailFields", step1);
            completedSteps.add("syncDetailFields");
        } catch (Exception e) {
            log.error("[local-pipeline] syncDetailFields 异常: {}", e.getMessage(), e);
            result.put("failedStep", "syncDetailFields");
            result.put("failedMessage", e.getMessage() != null ? e.getMessage() : "详情补全异常");
            result.put("finishedAt", DT_FMT.format(LocalDateTime.now()));
            return result;
        }

        // ② /book 仅状态列（cageType/state/rentType）
        try {
            Map<String, Object> step2 = syncStatusFromBook(roomId);
            steps.put("syncStatusFromBook", step2);
            completedSteps.add("syncStatusFromBook");
        } catch (Exception e) {
            log.error("[local-pipeline] syncStatusFromBook 异常: {}", e.getMessage(), e);
            result.put("failedStep", "syncStatusFromBook");
            result.put("failedMessage", e.getMessage() != null ? e.getMessage() : "状态同步异常");
            result.put("finishedAt", DT_FMT.format(LocalDateTime.now()));
            return result;
        }

        result.put("ok", true);
        result.put("failedStep", null);
        result.put("failedMessage", null);
        result.put("finishedAt", DT_FMT.format(LocalDateTime.now()));
        log.info("[local-pipeline] 一键同步完成 roomId={} steps={}", roomId, completedSteps);
        return result;
    }

    /** 全局反查：根据 animalCageId 定位笼位 */
    public Map<String, Object> lookupByAnimalCageId(Long animalCageId) {
        if (animalCageId == null) return null;
        return cellIndexMapper.lookupByAnimalCageId(animalCageId);
    }

    /** Map 响应里的 ARO 雪花 ID 转为字符串，避免前端 Number 精度丢失 */
    public static void stringifySnowflakeIds(Map<String, Object> row, String... keys) {
        if (row == null) return;
        for (String key : keys) {
            Object v = row.get(key);
            if (v instanceof Number n) {
                row.put(key, String.valueOf(n.longValue()));
            }
        }
    }

    /** 架子笼位汇总列表（分页） */
    public Map<String, Object> shelfCellSummary(Long roomId, String keyword, int page, int pageSize) {
        int offset = (page - 1) * pageSize;
        List<Map<String, Object>> rows = cellIndexMapper.shelfCellSummary(roomId, keyword, pageSize, offset);
        int total = cellIndexMapper.shelfCellSummaryCount(roomId, keyword);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", rows);
        result.put("total", total);
        result.put("page", page);
        result.put("pageSize", pageSize);
        return result;
    }


    private static String trimStr(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    // ---- helpers ----

    @SuppressWarnings("unchecked")
    private static Map<String, Object> castMap(Object o) {
        if (o instanceof Map<?, ?> m) return (Map<String, Object>) m;
        return null;
    }

    private static Object firstNonNull(Object... vals) {
        for (Object v : vals) if (v != null) return v;
        return null;
    }

    private static Integer toInt(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(v).trim()); }
        catch (NumberFormatException e) { return null; }
    }

    private static Long toLongSafe(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(v).trim()); }
        catch (NumberFormatException e) { return null; }
    }

    /** ARO 返回的 isCageBox 可能是 Boolean/Integer/String，"1"/"true"/1 都算 true */
    private static boolean isTruthy(Object v) {
        if (v == null) return false;
        if (v instanceof Boolean b) return b;
        if (v instanceof Number n) return n.intValue() != 0;
        String s = String.valueOf(v).trim();
        return "1".equals(s) || "true".equalsIgnoreCase(s);
    }
}
