package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageAlertConfig;
import com.example.demo.modules.cageshelf.entity.CageSpecialStatusSnapshot;
import com.example.demo.modules.cageshelf.mapper.CageAlertConfigMapper;
import com.example.demo.modules.cageshelf.mapper.CageSpecialStatusSnapshotMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * 笼位特殊状态持续告警 — 基于快照对比。
 * 对比两个快照批次：同一笼位同一状态在两次快照中都存在，且时间跨度 >= 阈值 → 告警。
 */
@Service
public class CageAlertService {
    private static final Logger log = LoggerFactory.getLogger(CageAlertService.class);

    private final CageAlertConfigMapper configMapper;
    private final CageSpecialStatusSnapshotMapper snapshotMapper;

    public CageAlertService(CageAlertConfigMapper configMapper,
                            CageSpecialStatusSnapshotMapper snapshotMapper) {
        this.configMapper = configMapper;
        this.snapshotMapper = snapshotMapper;
    }

    @PostConstruct
    public void initSchema() {
        configMapper.ensureTable();
        try { configMapper.migrateSchema(); log.info("[cage-alert] mode column added"); }
        catch (Exception e) { log.debug("[cage-alert] mode column exists: {}", e.getMessage()); }
        try { configMapper.migrateDropOldKey(); log.info("[cage-alert] old unique key dropped"); }
        catch (Exception e) { log.debug("[cage-alert] old key already gone: {}", e.getMessage()); }
        try { configMapper.migrateAddNewKey(); log.info("[cage-alert] new composite key added"); }
        catch (Exception e) { log.debug("[cage-alert] new key exists: {}", e.getMessage()); }
        try { snapshotMapper.addCageBoxJsonColumnIfMissing(); log.info("[cage-alert] cage_box_json column added"); }
        catch (Exception e) { log.debug("[cage-alert] cage_box_json column exists: {}", e.getMessage()); }
    }

    /**
     * 基于快照对比的持续告警。
     * @param currentBatchId 当前快照批次（null=自动取最新）
     * @param baselineBatchId 对比基准快照批次（null=用最新自身，跨度0天）
     * @param configMode "auto" | "manual"
     */
    public Map<String, Object> getPersistedAlerts(String currentBatchId, String baselineBatchId, String configMode) {
        snapshotMapper.ensureTable();
        String mode = configMode != null ? configMode : "auto";
        seedDefaultsIfEmpty(mode);

        List<CageAlertConfig> configs = configMapper.selectAllEnabled(mode);
        if (configs.isEmpty()) {
            return Map.of("alerts", List.of(), "generatedAt", "", "spanDays", 0);
        }

        // 当前快照：优先使用传入的 currentBatchId，否则取最新
        LocalDateTime currentTime;
        if (currentBatchId != null && !currentBatchId.isBlank()) {
            List<CageSpecialStatusSnapshot> cs = snapshotMapper.selectAllByBatchId(currentBatchId);
            if (cs.isEmpty()) {
                log.warn("[cage-alert] currentBatchId={} not found, fallback to latest", currentBatchId);
                Map<String, Object> latestInfo = snapshotMapper.selectLatestBatchInfo();
                if (latestInfo == null || latestInfo.isEmpty()) {
                    return Map.of("alerts", List.of(), "generatedAt", "", "spanDays", 0);
                }
                currentBatchId = String.valueOf(latestInfo.getOrDefault("scanBatchId", ""));
                currentTime = parseDateTime(String.valueOf(latestInfo.getOrDefault("scannedAt", "")));
            } else {
                currentTime = parseDateTime(cs.get(0).getScannedAt());
            }
        } else {
            Map<String, Object> latestInfo = snapshotMapper.selectLatestBatchInfo();
            if (latestInfo == null || latestInfo.isEmpty()) {
                return Map.of("alerts", List.of(), "generatedAt", "", "spanDays", 0);
            }
            currentBatchId = String.valueOf(latestInfo.getOrDefault("scanBatchId", ""));
            currentTime = parseDateTime(String.valueOf(latestInfo.getOrDefault("scannedAt", "")));
        }

        // 对比基准
        String baselineId = (baselineBatchId != null && !baselineBatchId.isBlank())
                ? baselineBatchId : currentBatchId;
        LocalDateTime baselineTime = currentTime;
        if (!baselineId.equals(currentBatchId)) {
            List<CageSpecialStatusSnapshot> bs = snapshotMapper.selectAllByBatchId(baselineId);
            if (!bs.isEmpty()) baselineTime = parseDateTime(bs.get(0).getScannedAt());
            else log.warn("[cage-alert] baselineBatchId={} not found, spanDays will be 0", baselineId);
        }
        long spanDays = 0;
        if (baselineTime != null && currentTime != null) {
            spanDays = Math.max(0, java.time.temporal.ChronoUnit.DAYS.between(
                    baselineTime.toLocalDate(), currentTime.toLocalDate()));
        }

        log.info("[cage-alert] baseline={} baselineTime={} current={} currentTime={} span={}d mode={}", baselineId, baselineTime, currentBatchId, currentTime, spanDays, mode);

        // 加载快照
        List<CageSpecialStatusSnapshot> currentSnaps = snapshotMapper.selectAllByBatchId(currentBatchId);
        List<CageSpecialStatusSnapshot> baselineSnaps = baselineId.equals(currentBatchId)
                ? currentSnaps : snapshotMapper.selectAllByBatchId(baselineId);

        // baseline 索引: shelveId|position → statusCode
        Map<String, String> baselineMap = new LinkedHashMap<>();
        for (CageSpecialStatusSnapshot s : baselineSnaps) {
            if (s.getStatusCode() != null && !"NORMAL".equals(s.getStatusCode())) {
                baselineMap.put(s.getShelveId() + "|" + s.getPositionLabel(), s.getStatusCode());
            }
        }

        // 监控配置
        Set<String> watched = new LinkedHashSet<>();
        Map<String, Integer> thresholds = new LinkedHashMap<>();
        for (CageAlertConfig c : configs) {
            watched.add(c.getStatusCode());
            thresholds.put(c.getStatusCode(), c.getThresholdDays());
        }

        Map<String, Map<String, Object>> dedup = new LinkedHashMap<>();
        for (CageSpecialStatusSnapshot snap : currentSnaps) {
            String code = snap.getStatusCode();
            if (code == null || !watched.contains(code) || "NORMAL".equals(code)) continue;

            int thresholdDays = thresholds.getOrDefault(code, 7);
            String shelveId = String.valueOf(snap.getShelveId());
            String position = snap.getPositionLabel();
            String key = shelveId + "|" + position;
            boolean persisted = code.equals(baselineMap.get(key));

            // 已存在天数 < 不超过天数 → 不告警
            if (spanDays < thresholdDays) continue;
            long persistedDays = spanDays;

            Map<String, Object> existing = dedup.get(key);
            if (existing != null && ((Number) existing.get("persistedDays")).longValue() >= persistedDays) continue;

            Map<String, Object> a = new LinkedHashMap<>();
            a.put("statusCode", code);
            a.put("statusLabel", snap.getStatusLabel() != null ? snap.getStatusLabel() : code);
            a.put("shelveId", shelveId);
            a.put("positionX", snap.getPositionX());
            a.put("positionY", snap.getPositionY());
            a.put("position", position != null ? position : "");
            a.put("campusName", snap.getCampusName() != null ? snap.getCampusName() : "");
            a.put("roomName", snap.getRoomName() != null ? snap.getRoomName() : "");
            a.put("cageBoxQrCode", snap.getCageBoxQrCode() != null ? snap.getCageBoxQrCode() : "");
            a.put("projectPiName", snap.getProjectPiName() != null ? snap.getProjectPiName() : "");
            a.put("thresholdDays", thresholdDays);
            a.put("persistedDays", persistedDays);
            a.put("spanDays", spanDays);
            a.put("persisted", persisted);
            dedup.put(key, a);
        }

        List<Map<String, Object>> alerts = new ArrayList<>(dedup.values());
        alerts.sort((a, b) -> Long.compare(
                ((Number) b.get("persistedDays")).longValue(),
                ((Number) a.get("persistedDays")).longValue()));

        log.info("[cage-alert] {} configs span={}d → {} alerts", configs.size(), spanDays, alerts.size());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("alerts", alerts);
        result.put("generatedAt", LocalDateTime.now().toString());
        result.put("baselineBatchId", baselineId);
        result.put("currentBatchId", currentBatchId);
        result.put("spanDays", spanDays);
        return result;
    }

    public List<CageAlertConfig> getConfig(String mode) {
        configMapper.ensureTable();
        String m = mode != null ? mode : "auto";
        seedDefaultsIfEmpty(m);
        return configMapper.selectAll(m);
    }

    public void saveConfig(List<CageAlertConfig> configs, String mode) {
        String m = (mode != null && !"off".equals(mode)) ? mode : "auto";
        configMapper.deleteByMode(m);
        if (configs != null && !configs.isEmpty()) {
            for (CageAlertConfig c : configs) c.setMode(m);
            configMapper.batchInsert(configs);
        }
        // 同步新增状态码到另一个 mode，避免切换模式后阈值回退到硬编码默认值 7
        syncNewStatusCodesToOtherMode(configs, m);
        log.info("[cage-alert] saved {} entries mode={}", configs != null ? configs.size() : 0, m);
    }

    /** 将当前 mode 中新增的状态码同步到另一个 mode，保留其已配置的阈值。 */
    private void syncNewStatusCodesToOtherMode(List<CageAlertConfig> savedConfigs, String currentMode) {
        if (savedConfigs == null || savedConfigs.isEmpty()) return;
        String otherMode = "auto".equals(currentMode) ? "manual" : "auto";
        seedDefaultsIfEmpty(otherMode);
        List<CageAlertConfig> otherConfigs = configMapper.selectAll(otherMode);
        Set<String> otherCodes = new LinkedHashSet<>();
        for (CageAlertConfig c : otherConfigs) {
            if (c.getStatusCode() != null) otherCodes.add(c.getStatusCode());
        }
        List<CageAlertConfig> toAdd = new ArrayList<>();
        for (CageAlertConfig c : savedConfigs) {
            if (c.getStatusCode() != null && !c.getStatusCode().isBlank() && !otherCodes.contains(c.getStatusCode())) {
                CageAlertConfig clone = new CageAlertConfig();
                clone.setStatusCode(c.getStatusCode());
                clone.setStatusLabel(c.getStatusLabel());
                clone.setThresholdDays(c.getThresholdDays());
                clone.setEnabled(c.getEnabled());
                clone.setMode(otherMode);
                toAdd.add(clone);
            }
        }
        if (!toAdd.isEmpty()) {
            configMapper.batchInsert(toAdd);
            log.info("[cage-alert] synced {} new status codes to mode={}", toAdd.size(), otherMode);
        }
    }

    private void seedDefaultsIfEmpty(String mode) {
        // 检查该 mode 下是否有数据（兼容旧表无 mode 列时 selectAll 会报错）
        List<CageAlertConfig> existing;
        try { existing = configMapper.selectAll(mode); }
        catch (Exception e) { log.warn("[cage-alert] selectAll failed (schema not ready): {}", e.getMessage()); return; }
        if (existing.isEmpty()) {
            log.info("[cage-alert] seeding defaults mode={}", mode);
            List<CageAlertConfig> defs = new ArrayList<>();
            defs.add(makeCfg("NEED_DIVIDE", "需分笼", 7));
            defs.add(makeCfg("HEALTH_ABNORMAL", "健康异常", 3));
            defs.add(makeCfg("ANIMAL_TRANSFER", "动物转移", 5));
            defs.add(makeCfg("SPECIAL_FEEDING", "需特殊饲养", 7));
            defs.add(makeCfg("COHABITATION", "合笼", 14));
            for (CageAlertConfig c : defs) c.setMode(mode);
            try { configMapper.batchInsert(defs); }
            catch (Exception e) { log.warn("[cage-alert] seed insert failed (may already exist): {}", e.getMessage()); }
        }
    }

    private CageAlertConfig makeCfg(String code, String label, int days) {
        CageAlertConfig c = new CageAlertConfig();
        c.setStatusCode(code); c.setStatusLabel(label);
        c.setThresholdDays(days); c.setEnabled(1);
        return c;
    }

    private static LocalDateTime parseDateTime(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            String n = s.trim().replace("T", " ");
            int dot = n.indexOf('.');
            if (dot > 0) n = n.substring(0, dot);
            return LocalDateTime.parse(n, java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        } catch (Exception e) { return null; }
    }
}
