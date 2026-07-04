package com.example.demo.modules.cageshelf.service;

import com.alibaba.fastjson2.JSON;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.cageshelf.entity.CageSpecialStatusSnapshot;
import com.example.demo.modules.cageshelf.mapper.CageShelfCellSnapshotMapper;
import com.example.demo.modules.cageshelf.mapper.CageShelfMapper;
import com.example.demo.modules.cageshelf.mapper.CageSpecialStatusSnapshotMapper;
import com.example.demo.modules.cageshelf.support.SpecialStatusComputer;
import com.example.demo.modules.cageshelf.support.SpecialStatusComputer.SpecialStatusEntry;
import com.example.demo.modules.twin.common.service.TwinAutomationLogService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 全量笼位数据同步服务。
 * 遍历全部笼架，逐架调用 ARO /back 接口拉取最新笼盒详情（含特殊标记），
 * 全部笼位（NORMAL + 特殊状态）批量落库到 cage_special_status_snapshot，
 * 扫描完成后 diff 新旧批次生成 cage_event_log 事件。
 */
@Service
public class CageSpecialStatusScanService {

    private static final Logger log = LoggerFactory.getLogger(CageSpecialStatusScanService.class);
    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    /** 每批处理的笼架数 */
    private static final int SHELF_BATCH_SIZE = 50;
    /** 批次间休眠毫秒 */
    private static final int BATCH_SLEEP_MS = 500;
    /** 快照写入分块大小 */
    private static final int INSERT_CHUNK_SIZE = 500;

    private final AroService aroService;
    private final CageShelfMapper cageShelfMapper;
    private final CageSpecialStatusSnapshotMapper snapshotMapper;
    private final CageScanProgressService progressService;
    private final TwinAutomationLogService automationLogService;
    private final CageEventDiffService diffService;
    private final CageShelfService cageShelfService;
    private final CageShelfCellSnapshotMapper cellSnapshotMapper;

    public CageSpecialStatusScanService(AroService aroService,
                                         CageShelfMapper cageShelfMapper,
                                         CageSpecialStatusSnapshotMapper snapshotMapper,
                                         CageScanProgressService progressService,
                                         TwinAutomationLogService automationLogService,
                                         CageEventDiffService diffService,
                                         CageShelfService cageShelfService,
                                         CageShelfCellSnapshotMapper cellSnapshotMapper) {
        this.aroService = aroService;
        this.cageShelfMapper = cageShelfMapper;
        this.snapshotMapper = snapshotMapper;
        this.progressService = progressService;
        this.automationLogService = automationLogService;
        this.diffService = diffService;
        this.cageShelfService = cageShelfService;
        this.cellSnapshotMapper = cellSnapshotMapper;
    }

    /**
     * 执行全量扫描。由定时任务或手动触发调用。
     *
     * @param triggeredBy 触发者标识（"system-scheduler" 或用户 ID）
     * @return 扫描结果摘要
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> executeFullScan(String triggeredBy) {
        String scanBatchId = "scan-" + UUID.randomUUID().toString().substring(0, 8);
        String now = LocalDateTime.now().format(DT_FMT);

        // 确保表及列存在
        snapshotMapper.ensureTable();
        try {
            snapshotMapper.addCampusColumnIfMissing();
        } catch (Exception ignored) {
            // 列已存在时忽略（MySQL 不支持 ADD COLUMN IF NOT EXISTS）
        }

        // 获取全部笼架索引
        List<Map<String, Object>> shelves = cageShelfMapper.listIndexes(null, null, null, null, 100000, 0);
        int totalShelves = shelves.size();
        if (totalShelves == 0) {
            log.warn("[cage-sync] 无笼架索引数据，跳过同步");
            automationLogService.write(
                    TwinAutomationLogService.TYPE_SCHEDULER,
                    "CAGE_SPECIAL_STATUS_SCAN", "TIMER", "SCHEDULE_TICK",
                    null, "CAGE_SPECIAL_STATUS_SCAN", true,
                    "无笼架索引数据，跳过同步", triggeredBy);
            return Map.of("scanned", false, "reason", "无笼架索引数据");
        }

        // 启动进度
        progressService.start(scanBatchId, totalShelves);

        // 暂存旧批次 ID（扫描完成后 diff 再删除）
        String oldBatchId = progressService.getOldBatchId();

        automationLogService.write(
                TwinAutomationLogService.TYPE_SCHEDULER,
                "CAGE_SPECIAL_STATUS_SCAN", "TIMER", "SCHEDULE_TICK",
                null, "CAGE_SPECIAL_STATUS_SCAN", true,
                "开始全量笼位数据同步，共 " + totalShelves + " 个笼架", triggeredBy);

        int shelvesSucceeded = 0;
        int shelvesFailed = 0;
        int cagesScanned = 0;
        int cagesWithStatus = 0;
        List<CageSpecialStatusSnapshot> buffer = new ArrayList<>();

        for (int i = 0; i < shelves.size(); i++) {
            Map<String, Object> shelfRow = shelves.get(i);
            String shelveIdStr = objToStr(shelfRow.get("shelveId"));
            String roomIdStr = objToStr(shelfRow.get("roomId"));
            Long shelveId = toLongSafe(shelveIdStr);
            Long roomId = toLongSafe(roomIdStr);

            if (shelveId == null || roomId == null) {
                shelvesFailed++;
                progressService.onShelfDone(shelvesSucceeded + shelvesFailed, false);
                continue;
            }

            try {
                Map<String, Object> raw = aroService.fetchAnimalCagesByRoomAndShelve(roomId, shelveId);
                if (raw == null || raw.isEmpty() || !isAroSuccess(raw)) {
                    shelvesFailed++;
                    progressService.onShelfDone(shelvesSucceeded + shelvesFailed, false);
                    log.warn("[cage-sync] ARO 返回空 shelveId={}", shelveId);
                    continue;
                }

                Object dataObj = raw.get("data");
                if (!(dataObj instanceof List<?> list)) {
                    shelvesFailed++;
                    progressService.onShelfDone(shelvesSucceeded + shelvesFailed, false);
                    continue;
                }

                // Collect cages for full snapshot
                List<Map<String, Object>> cages = new ArrayList<>();
                for (Object item : list) {
                    if (item instanceof Map<?, ?> m) cages.add((Map<String, Object>) m);
                }

                String roomName = objToStr(shelfRow.get("roomName"));
                for (Object item : list) {
                    if (!(item instanceof Map<?, ?> m)) continue;
                    Map<String, Object> cage = (Map<String, Object>) m;
                    cagesScanned++;

                    // 提取坐标
                    Integer x = toInt(firstNonNull(cage.get("postionX"), cage.get("positionX")));
                    Integer y = toInt(firstNonNull(cage.get("postionY"), cage.get("positionY")));
                    if (x == null || y == null || x < 1 || x > 8 || y < 1 || y > 10) continue;

                    // 提取 cageBoxVo
                    Map<String, Object> cageBoxVo = castMap(cage.get("cageBoxVo"));
                    List<SpecialStatusEntry> statuses = SpecialStatusComputer.compute(cageBoxVo);

                    // 记录所有状态（包括 NORMAL），确保 diff 能检测 NORMAL ↔ SPECIAL 变化和笼盒移动
                    for (SpecialStatusEntry se : statuses) {
                        CageSpecialStatusSnapshot row = new CageSpecialStatusSnapshot();
                        row.setScanBatchId(scanBatchId);
                        row.setShelveId(shelveId);
                        row.setCampusName(objToStr(shelfRow.get("campusName")));
                        row.setRoomId(roomId);
                        row.setRoomName(roomName);
                        row.setPositionX(x);
                        row.setPositionY(y);
                        row.setPositionLabel(toPosition(x, y));
                        row.setStatusCode(se.getCode());
                        row.setStatusLabel(se.getLabel());
                        row.setPiName(objToStr(cage.get("piName")));
                        row.setDepartmentName(cageBoxVo != null ? objToStr(cageBoxVo.get("departmentName")) : "");
                        row.setProjectPiName(cageBoxVo != null ? objToStr(cageBoxVo.get("projectPiName")) : "");
                        row.setDetailName(se.getDetailName());
                        row.setDetailDescription(se.getDetailDescription());
                        row.setCageBoxQrCode(cageBoxVo != null ? objToStr(
                                firstNonNull(cageBoxVo.get("cageBoxQrCode"), cageBoxVo.get("cageBoxCode"))) : "");
                        row.setAnimalCageType(toInt(cage.get("animalCageType")));
                        row.setScannedAt(now);

                        buffer.add(row);
                        // Only count non-NORMAL for the "special status" tally
                        if (!SpecialStatusComputer.CODE_NORMAL.equals(se.getCode())) {
                            cagesWithStatus++;
                        }

                        // 分块写入
                        if (buffer.size() >= INSERT_CHUNK_SIZE) {
                            snapshotMapper.batchInsert(buffer);
                            buffer.clear();
                        }
                    }
                }

                shelvesSucceeded++;
                progressService.onShelfDone(shelvesSucceeded + shelvesFailed, true);
                progressService.setCurrentLocation(roomName, objToStr(shelfRow.get("shelveName")));

                // Populate grid cache so frontend can read instantly
                try {
                    cageShelfService.refreshShelfDetail(shelveIdStr);
                } catch (Exception e) {
                    log.warn("[cage-sync] 网格缓存写入失败 shelveId={} err={}", shelveId, e.getMessage());
                }

                // Save ALL 80 cage positions to cell snapshot table
                saveCellSnapshot(scanBatchId, roomId, shelveId, roomName, cages, now);
            } catch (Exception e) {
                shelvesFailed++;
                progressService.onShelfDone(shelvesSucceeded + shelvesFailed, false);
                log.warn("[cage-sync] 笼架扫描失败 shelveId={} err={}", shelveId, e.getMessage());
            }

            // 批次间休眠（每 SHELF_BATCH_SIZE 个笼架休息一次）
            if ((i + 1) % SHELF_BATCH_SIZE == 0 && i + 1 < shelves.size()) {
                try {
                    log.info("[cage-sync] 批次完成 {}/{}，休眠 {}ms", i + 1, totalShelves, BATCH_SLEEP_MS);
                    Thread.sleep(BATCH_SLEEP_MS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }

        // 写入剩余缓冲区
        if (!buffer.isEmpty()) {
            snapshotMapper.batchInsert(buffer);
        }

        // Diff: 对比新旧快照，生成事件日志
        int eventsGenerated = 0;
        if (oldBatchId != null && !oldBatchId.isBlank()) {
            try {
                eventsGenerated = diffService.diffAndLog(oldBatchId, scanBatchId, LocalDateTime.now());
            } catch (Exception e) {
                log.warn("[cage-sync] diff 失败 oldBatch={} newBatch={} err={}", oldBatchId, scanBatchId, e.getMessage());
            }
            // 删除旧批次（diff 完成后）
            snapshotMapper.deleteByScanBatchId(oldBatchId);
        } else {
            // 首次同步：无旧批次可对比，写入一条基线事件供 event-log 可见
            eventsGenerated = diffService.writeBaselineEvent(scanBatchId, cagesScanned, cagesWithStatus, LocalDateTime.now());
        }

        // 标记完成
        progressService.done(cagesScanned, cagesWithStatus);

        String summary = String.format(
                "同步完成: %d/%d 笼架成功, 共扫描 %d 个笼位, 写入 %d 条快照记录, 其中特殊状态 %d 个",
                shelvesSucceeded, totalShelves, cagesScanned, cagesScanned, cagesWithStatus);
        log.info("[cage-sync] {}", summary);

        automationLogService.write(
                TwinAutomationLogService.TYPE_SCHEDULER,
                "CAGE_SPECIAL_STATUS_SCAN", "TIMER", "SCHEDULE_TICK",
                null, "CAGE_SPECIAL_STATUS_SCAN", true,
                summary, triggeredBy);

        return Map.of(
                "scanBatchId", scanBatchId,
                "shelvesTotal", totalShelves,
                "shelvesSucceeded", shelvesSucceeded,
                "shelvesFailed", shelvesFailed,
                "cagesScanned", cagesScanned,
                "cagesWithStatus", cagesWithStatus,
                "scannedAt", now
        );
    }

    // ---- helpers (ported from CageShelfService) ----

    private static String toPosition(int x, int y) {
        char col = (char) ('A' + Math.max(0, x - 1));
        return col + "-" + y;
    }

    // ---- full cell snapshot save ----

    @SuppressWarnings("unchecked")
    private void saveCellSnapshot(String scanBatchId, Long roomId, Long shelveId,
                                   String roomName, List<Map<String, Object>> cages, String now) {
        java.util.Map<String, Map<String, Object>> byPos = new java.util.HashMap<>();
        for (Map<String, Object> cage : cages) {
            Integer x = toInt(cage.get("postionX"));
            if (x == null) x = toInt(cage.get("positionX"));
            Integer y = toInt(cage.get("postionY"));
            if (y == null) y = toInt(cage.get("positionY"));
            if (x == null || y == null || x < 1 || x > 8 || y < 1 || y > 10) continue;
            byPos.put(y + "-" + x, cage);
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int y = 1; y <= 10; y++) {
            for (int x = 1; x <= 8; x++) {
                Map<String, Object> cage = byPos.get(y + "-" + x);
                Map<String, Object> row = new java.util.LinkedHashMap<>();
                row.put("scanBatchId", scanBatchId);
                row.put("roomId", roomId);
                row.put("shelveId", shelveId);
                row.put("positionX", x);
                row.put("positionY", y);
                row.put("positionLabel", (char)('A' + x - 1) + "-" + y);
                row.put("scannedAt", now);
                if (cage != null) {
                    row.put("animalCageType", toInt(cage.get("animalCageType")));
                    row.put("cageBoxJson", cage.get("cageBoxVo") != null
                            ? toJson(cage.get("cageBoxVo")) : "{}");
                    row.put("specialStatusesJson", toJson(
                            SpecialStatusComputer.compute((Map<String, Object>) cage.get("cageBoxVo"))));
                }
                rows.add(row);
            }
        }
        cellSnapshotMapper.batchInsert(rows);
        log.info("[cage-sync] Saved {} cell snapshot rows for roomId={} shelveId={} batch={}",
                rows.size(), roomId, shelveId, scanBatchId);
    }

    private static String toJson(Object obj) {
        try { return obj == null ? "{}" : JSON.toJSONString(obj); }
        catch (Exception e) { return "{}"; }
    }

    private static String objToStr(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    private static Long toLongSafe(String text) {
        if (text == null || text.isBlank()) return null;
        try { return Long.parseLong(text.trim()); } catch (Exception e) { return null; }
    }

    private static Integer toInt(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(v)); } catch (Exception e) { return null; }
    }

    private static Object firstNonNull(Object a, Object b) {
        return a != null && !isBlankScalar(a) ? a : b;
    }

    private static boolean isBlankScalar(Object o) {
        if (o == null) return true;
        if (o instanceof String s) return s.isBlank();
        return false;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> castMap(Object o) {
        if (o instanceof Map<?, ?> m) return (Map<String, Object>) m;
        return null;
    }

    private static boolean isAroSuccess(Map<String, Object> raw) {
        Object succ = raw.get("success");
        if (succ instanceof Boolean && Boolean.FALSE.equals(succ)) return false;
        Object status = raw.get("status");
        if (status == null) return true;
        if (status instanceof Number n) return n.intValue() == 0;
        return "0".equals(String.valueOf(status).trim());
    }
}
