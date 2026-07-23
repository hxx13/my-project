package com.example.demo.modules.cageshelf.service;

import com.alibaba.fastjson2.JSON;
import com.example.demo.modules.cageshelf.entity.CageEventLog;
import com.example.demo.modules.cageshelf.entity.CageSpecialStatusSnapshot;
import com.example.demo.modules.cageshelf.mapper.CageEventLogMapper;
import com.example.demo.modules.cageshelf.mapper.CageSpecialStatusSnapshotMapper;
import com.example.demo.modules.cageshelf.support.SpecialStatusComputer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;

/**
 * 扫描完成后对比新旧快照，生成 cage_event_log 记录所有变更。
 */
@Service
public class CageEventDiffService {

    private static final Logger log = LoggerFactory.getLogger(CageEventDiffService.class);

    private final CageSpecialStatusSnapshotMapper snapshotMapper;
    private final CageEventLogMapper eventLogMapper;

    public CageEventDiffService(CageSpecialStatusSnapshotMapper snapshotMapper,
                                CageEventLogMapper eventLogMapper) {
        this.snapshotMapper = snapshotMapper;
        this.eventLogMapper = eventLogMapper;
    }

    /**
     * 执行 diff 并写入事件日志。
     */
    public int diffAndLog(String oldBatchId, String newBatchId, LocalDateTime changedAt) {
        eventLogMapper.ensureTable();

        // Load all snapshots for both batches
        List<CageSpecialStatusSnapshot> oldAll = snapshotMapper.selectAllByBatchId(oldBatchId);
        List<CageSpecialStatusSnapshot> newAll = snapshotMapper.selectAllByBatchId(newBatchId);

        // Index by cage key: shelveId|posX|posY
        Map<String, List<CageSpecialStatusSnapshot>> oldByCage = groupByCage(oldAll);
        Map<String, List<CageSpecialStatusSnapshot>> newByCage = groupByCage(newAll);

        // Track cages by box QR code for movement detection
        Map<String, String> oldBoxToCage = boxToCageMap(oldByCage);
        Map<String, String> newBoxToCage = boxToCageMap(newByCage);

        List<CageEventLog> events = new ArrayList<>();

        // All cage keys (union)
        Set<String> allKeys = new LinkedHashSet<>();
        allKeys.addAll(oldByCage.keySet());
        allKeys.addAll(newByCage.keySet());

        for (String cageKey : allKeys) {
            List<CageSpecialStatusSnapshot> oldStatuses = oldByCage.getOrDefault(cageKey, List.of());
            List<CageSpecialStatusSnapshot> newStatuses = newByCage.getOrDefault(cageKey, List.of());

            CageSpecialStatusSnapshot oldRef = oldStatuses.isEmpty() ? null : oldStatuses.get(0);
            CageSpecialStatusSnapshot newRef = newStatuses.isEmpty() ? null : newStatuses.get(0);

            String oldBoxQr = oldRef != null ? nullToEmpty(oldRef.getCageBoxQrCode()) : "";
            String newBoxQr = newRef != null ? nullToEmpty(newRef.getCageBoxQrCode()) : "";

            // --- BOX_ARRIVED: no old cage, new cage exists with box ---
            if (oldRef == null && newRef != null && !newBoxQr.isBlank()) {
                events.add(buildEvent(newBatchId, CageEventLog.BOX_ARRIVED,
                        newBoxQr, null, null, newRef, changedAt,
                        "笼盒 " + newBoxQr + " 首次出现在 " + summaryPos(newRef)));
            }
            // --- BOX_DEPARTED: old cage had box, new cage is gone ---
            else if (oldRef != null && newRef == null && !oldBoxQr.isBlank()) {
                events.add(buildEvent(newBatchId, CageEventLog.BOX_DEPARTED,
                        oldBoxQr, oldRef, null, null, changedAt,
                        "笼盒 " + oldBoxQr + " 从 " + summaryPos(oldRef) + " 移出"));
            }
            // --- Both exist: compare ---
            else if (oldRef != null && newRef != null) {
                // BOX_MOVED
                if (!oldBoxQr.isBlank() && !newBoxQr.isBlank() && !oldBoxQr.equals(newBoxQr)) {
                    events.add(buildEvent(newBatchId, CageEventLog.BOX_MOVED,
                            newBoxQr, oldRef, newRef, newRef, changedAt,
                            "笼盒 " + oldBoxQr + " 被替换为 " + newBoxQr + " @ " + summaryPos(newRef)));
                }
                // Same box, different position (cross-shelf or cross-room)
                else if (!oldBoxQr.isBlank() && oldBoxQr.equals(newBoxQr)) {
                    boolean posChanged = !Objects.equals(oldRef.getShelveId(), newRef.getShelveId())
                            || !Objects.equals(oldRef.getPositionLabel(), newRef.getPositionLabel());
                    if (posChanged) {
                        events.add(buildEvent(newBatchId, CageEventLog.BOX_MOVED,
                                newBoxQr, oldRef, newRef, newRef, changedAt,
                                "笼盒 " + newBoxQr + " 从 " + summaryPos(oldRef) + " → " + summaryPos(newRef)));
                    }
                }

                // TYPE_CHANGED
                Integer oldType = oldRef.getAnimalCageType();
                Integer newType = newRef.getAnimalCageType();
                if (!Objects.equals(oldType, newType) && oldType != null && newType != null) {
                    String prevJson = JSON.toJSONString(Map.of("animalCageType", oldType));
                    String currJson = JSON.toJSONString(Map.of("animalCageType", newType));
                    events.add(buildEventDetail(newBatchId, CageEventLog.TYPE_CHANGED,
                            newBoxQr, newRef, prevJson, currJson, changedAt,
                            "类型变更: " + typeLabel(oldType) + " → " + typeLabel(newType) + " @ " + summaryPos(newRef)));
                }

                // PI_CHANGED
                String oldPi = nullToEmpty(oldRef.getProjectPiName());
                String newPi = nullToEmpty(newRef.getProjectPiName());
                if (!oldPi.isBlank() || !newPi.isBlank()) {
                    if (!oldPi.equals(newPi)) {
                        String prevJson = JSON.toJSONString(Map.of("projectPiName", oldPi));
                        String currJson = JSON.toJSONString(Map.of("projectPiName", newPi));
                        events.add(buildEventDetail(newBatchId, CageEventLog.PI_CHANGED,
                                newBoxQr, newRef, prevJson, currJson, changedAt,
                                "PI 变更: " + (oldPi.isBlank() ? "(无)" : oldPi) + " → " + (newPi.isBlank() ? "(无)" : newPi) + " @ " + summaryPos(newRef)));
                    }
                }

                // DEPT_CHANGED
                String oldDept = nullToEmpty(oldRef.getDepartmentName());
                String newDept = nullToEmpty(newRef.getDepartmentName());
                if (!oldDept.isBlank() || !newDept.isBlank()) {
                    if (!oldDept.equals(newDept)) {
                        String prevJson = JSON.toJSONString(Map.of("departmentName", oldDept));
                        String currJson = JSON.toJSONString(Map.of("departmentName", newDept));
                        events.add(buildEventDetail(newBatchId, CageEventLog.DEPT_CHANGED,
                                newBoxQr, newRef, prevJson, currJson, changedAt,
                                "部门变更: " + (oldDept.isBlank() ? "(无)" : oldDept) + " → " + (newDept.isBlank() ? "(无)" : newDept) + " @ " + summaryPos(newRef)));
                    }
                }

                // STATUS changes (skip NORMAL — it's the baseline, not an event)
                Set<String> oldCodes = statusCodeSet(oldStatuses);
                Set<String> newCodes = statusCodeSet(newStatuses);

                for (String code : newCodes) {
                    if (!oldCodes.contains(code) && !SpecialStatusComputer.CODE_NORMAL.equals(code)) {
                        events.add(buildEventDetail(newBatchId, CageEventLog.STATUS_ADDED,
                                newBoxQr, newRef,
                                JSON.toJSONString(Map.of("prevStatuses", oldCodes)),
                                JSON.toJSONString(Map.of("currStatuses", newCodes)),
                                changedAt,
                                "新增 «" + code + "» @ " + summaryPos(newRef)));
                    }
                }
                for (String code : oldCodes) {
                    if (!newCodes.contains(code) && !SpecialStatusComputer.CODE_NORMAL.equals(code)) {
                        events.add(buildEventDetail(newBatchId, CageEventLog.STATUS_REMOVED,
                                newBoxQr, newRef,
                                JSON.toJSONString(Map.of("prevStatuses", oldCodes)),
                                JSON.toJSONString(Map.of("currStatuses", newCodes)),
                                changedAt,
                                "解除 «" + code + "» @ " + summaryPos(newRef)));
                    }
                }
                // STATUS_CHANGED: both have different non-empty status sets
                if (!oldCodes.equals(newCodes) && !oldCodes.isEmpty() && !newCodes.isEmpty()
                        && !oldCodes.equals(newCodes)) {
                    // STATUS_CHANGED is implied by ADDED + REMOVED above;
                    // add explicit CHANGED only when both sets are non-empty and differ
                    // This is already covered by individual ADDED/REMOVED events
                }
            }
        }

        // --- Cross-cage BOX_MOVED detection ---
        for (Map.Entry<String, String> e : oldBoxToCage.entrySet()) {
            String boxQr = e.getKey();
            if (boxQr.isBlank()) continue;
            String newCageKey = newBoxToCage.get(boxQr);
            if (newCageKey != null && !newCageKey.equals(e.getValue())) {
                // Box moved between cages — check if we already caught it
                boolean alreadyLogged = events.stream().anyMatch(ev ->
                        CageEventLog.BOX_MOVED.equals(ev.getEventType())
                                && boxQr.equals(ev.getCageBoxQrCode()));
                if (!alreadyLogged) {
                    CageSpecialStatusSnapshot oldRef = findRef(oldByCage.get(e.getValue()));
                    CageSpecialStatusSnapshot newRef = findRef(newByCage.get(newCageKey));
                    if (oldRef != null && newRef != null) {
                        events.add(buildEvent(newBatchId, CageEventLog.BOX_MOVED,
                                boxQr, oldRef, newRef, newRef, changedAt,
                                "笼盒 " + boxQr + " 从 " + summaryPos(oldRef) + " → " + summaryPos(newRef)));
                    }
                }
            }
        }

        // Batch write
        if (!events.isEmpty()) {
            // Chunk insert to avoid huge batches
            int chunkSize = 200;
            for (int i = 0; i < events.size(); i += chunkSize) {
                int end = Math.min(i + chunkSize, events.size());
                eventLogMapper.batchInsert(events.subList(i, end));
            }
        }

        log.info("[cage-diff] oldBatch={} newBatch={} events={}", oldBatchId, newBatchId, events.size());
        return events.size();
    }

    // ---- helpers ----

    private Map<String, List<CageSpecialStatusSnapshot>> groupByCage(List<CageSpecialStatusSnapshot> list) {
        Map<String, List<CageSpecialStatusSnapshot>> map = new LinkedHashMap<>();
        for (CageSpecialStatusSnapshot s : list) {
            String key = cageKey(s);
            map.computeIfAbsent(key, k -> new ArrayList<>()).add(s);
        }
        return map;
    }

    private String cageKey(CageSpecialStatusSnapshot s) {
        return s.getShelveId() + "|" + s.getPositionX() + "|" + s.getPositionY();
    }

    private Map<String, String> boxToCageMap(Map<String, List<CageSpecialStatusSnapshot>> byCage) {
        Map<String, String> map = new LinkedHashMap<>();
        for (Map.Entry<String, List<CageSpecialStatusSnapshot>> e : byCage.entrySet()) {
            for (CageSpecialStatusSnapshot s : e.getValue()) {
                String qr = nullToEmpty(s.getCageBoxQrCode());
                if (!qr.isBlank()) map.put(qr, e.getKey());
            }
        }
        return map;
    }

    private Set<String> statusCodeSet(List<CageSpecialStatusSnapshot> statuses) {
        Set<String> set = new LinkedHashSet<>();
        for (CageSpecialStatusSnapshot s : statuses) {
            if (s.getStatusCode() != null && !s.getStatusCode().isBlank()) {
                set.add(s.getStatusCode());
            }
        }
        return set;
    }

    private CageSpecialStatusSnapshot findRef(List<CageSpecialStatusSnapshot> list) {
        return (list != null && !list.isEmpty()) ? list.get(0) : null;
    }

    private CageEventLog buildEvent(String batchId, String eventType,
                                     String boxQr,
                                     CageSpecialStatusSnapshot oldRef,
                                     CageSpecialStatusSnapshot newRef,
                                     CageSpecialStatusSnapshot metaRef,
                                     LocalDateTime at, String summary) {
        CageEventLog ev = new CageEventLog();
        ev.setScanBatchId(batchId);
        ev.setEventType(eventType);
        ev.setCageBoxQrCode(boxQr.isBlank() ? null : boxQr);
        ev.setChangedAt(at);
        ev.setDetailSummary(summary);

        if (oldRef != null) {
            ev.setPrevShelveId(String.valueOf(oldRef.getShelveId()));
            ev.setPrevPosition(oldRef.getPositionLabel());
            ev.setPrevCampusName(oldRef.getCampusName());
            ev.setPrevRoomName(oldRef.getRoomName());
        }
        if (newRef != null) {
            ev.setCurrShelveId(String.valueOf(newRef.getShelveId()));
            ev.setCurrPosition(newRef.getPositionLabel());
            ev.setCurrCampusName(newRef.getCampusName());
            ev.setCurrRoomName(newRef.getRoomName());
        }
        if (metaRef != null) {
            ev.setPiName(metaRef.getPiName());
            ev.setProjectPiName(metaRef.getProjectPiName());
            ev.setDepartmentName(metaRef.getDepartmentName());
        }

        return ev;
    }

    private CageEventLog buildEventDetail(String batchId, String eventType,
                                           String boxQr, CageSpecialStatusSnapshot ref,
                                           String prevJson, String currJson,
                                           LocalDateTime at, String summary) {
        CageEventLog ev = buildEvent(batchId, eventType, boxQr, null, ref, ref, at, summary);
        ev.setPrevValueJson(prevJson);
        ev.setCurrValueJson(currJson);
        return ev;
    }

    private String summaryPos(CageSpecialStatusSnapshot s) {
        return (s.getCampusName() != null ? s.getCampusName() : "") + "-"
                + (s.getRoomName() != null ? s.getRoomName() : "") + "-"
                + (s.getPositionLabel() != null ? s.getPositionLabel() : "");
    }

    private String typeLabel(Integer t) {
        return t == null ? "?" : switch (t) {
            case 1 -> "等待分配";
            case 2 -> "已预约(空笼盒)";
            case 3 -> "已预约(饲养中)";
            case 4 -> "异常";
            default -> "未知(" + t + ")";
        };
    }

    private static String nullToEmpty(String s) { return s == null ? "" : s.trim(); }

    /**
     * 首次同步时写入一条基线事件，让 event-log 页面有可见记录。
     * 后续同步通过 diffAndLog 对比新旧快照生成变更事件。
     */
    public int writeBaselineEvent(String scanBatchId, int cagesScanned, int cagesWithStatus, LocalDateTime at) {
        eventLogMapper.ensureTable();
        CageEventLog ev = new CageEventLog();
        ev.setScanBatchId(scanBatchId);
        ev.setEventType("BASELINE_ESTABLISHED");
        ev.setChangedAt(at);
        ev.setDetailSummary(String.format(
                "基线建立：首次全量同步完成，共 %d 个笼位，其中特殊状态 %d 个。后续同步将自动对比生成变更事件。",
                cagesScanned, cagesWithStatus));
        eventLogMapper.batchInsert(java.util.List.of(ev));
        log.info("[cage-diff] baseline event written for batch={} cages={} special={}", scanBatchId, cagesScanned, cagesWithStatus);
        return 1;
    }
}
