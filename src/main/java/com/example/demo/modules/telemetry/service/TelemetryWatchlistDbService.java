package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.telemetry.config.WinCcProperties;
import com.example.demo.modules.telemetry.dto.TelemetryWatchlistEnrichment;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryWatchlistBundleDto;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryWatchlistTagDto;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryWatchlistTagPageDto;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryWatchlistTagAlarmOverridePatchDto;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryWatchlistTagWriteDto;
import com.example.demo.modules.telemetry.dto.watchlist.TelemetryWatchlistZoneAdminDto;
import com.example.demo.modules.telemetry.entity.TelemetryWatchlistBundleRow;
import com.example.demo.modules.telemetry.entity.TelemetryWatchlistTagRow;
import com.example.demo.modules.telemetry.mapper.TelemetryWatchlistBundleMapper;
import com.example.demo.modules.telemetry.mapper.TelemetryWatchlistTagMapper;
import com.example.demo.modules.telemetry.util.WinccExportCsvParseUtil;
import com.example.demo.modules.telemetry.util.WinccLimitVariableNaming;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.text.Normalizer;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

/**
 * WinCC 变量清单存 MySQL：导入时用上传文件名生成库内标识与显示名，整表替换后设为当前 WinCC 使用的清单（与 {@code app.wincc.watchlist-source=database} 配合）。
 */
@Service
public class TelemetryWatchlistDbService {

    private static final Logger log = LoggerFactory.getLogger(TelemetryWatchlistDbService.class);

    private static final int INSERT_CHUNK = 200;

    /**
     * WinCC 点名与库内 {@code wincc_variable_name} 对齐用：NFKC + 全角句号等与半角点统一，
     * 避免 REST 返回与入库字符串逐字不一致时报警缓存lookup失败。
     * <p>行首 {@code U+FEFF}（BOM）、零宽空格等会先去掉，否则 POST /Values 可能得到空响应。</p>
     */
    public static String normalizeWinCcVariableKey(String raw) {
        if (!StringUtils.hasText(raw)) {
            return "";
        }
        String s = raw.trim();
        while (!s.isEmpty()) {
            char c0 = s.charAt(0);
            if (c0 == '\uFEFF' || c0 == '\u200B' || c0 == '\u200C' || c0 == '\u200D') {
                s = s.substring(1).trim();
            } else {
                break;
            }
        }
        if (!StringUtils.hasText(s)) {
            return "";
        }
        s = Normalizer.normalize(s, Normalizer.Form.NFKC);
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '\uFF0E' || c == '\u3002') {
                sb.append('.');
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    /** 主测量变量名 → 库内缓存的上下限（低频 WinCC 拉取或管理端手改） */
    public record CachedAlarmLimitsSnapshot(String minValue, String maxValue) {
    }

    private record AlarmCachePreserve(String min, String max, LocalDateTime at) {
        static AlarmCachePreserve fromRow(TelemetryWatchlistTagRow old) {
            if (old == null || !StringUtils.hasText(old.getWinccVariableName())) {
                return null;
            }
            boolean has = StringUtils.hasText(old.getCachedAlarmMinValue())
                    || StringUtils.hasText(old.getCachedAlarmMaxValue())
                    || old.getCachedAlarmLimitsAt() != null;
            if (!has) {
                return null;
            }
            return new AlarmCachePreserve(
                    trimOrNull(old.getCachedAlarmMinValue()),
                    trimOrNull(old.getCachedAlarmMaxValue()),
                    old.getCachedAlarmLimitsAt());
        }
    }

    private record AlarmOverridePreserve(String min, String max) {
        static AlarmOverridePreserve fromRow(TelemetryWatchlistTagRow old) {
            if (old == null || !StringUtils.hasText(old.getWinccVariableName())) {
                return null;
            }
            boolean has = StringUtils.hasText(old.getAlarmOverrideMin()) || StringUtils.hasText(old.getAlarmOverrideMax());
            if (!has) {
                return null;
            }
            return new AlarmOverridePreserve(trimOrNull(old.getAlarmOverrideMin()), trimOrNull(old.getAlarmOverrideMax()));
        }
    }

    private final WinCcProperties winCcProperties;
    private final TelemetryWatchlistBundleMapper bundleMapper;
    private final TelemetryWatchlistTagMapper tagMapper;

    public TelemetryWatchlistDbService(WinCcProperties winCcProperties,
                                       TelemetryWatchlistBundleMapper bundleMapper,
                                       TelemetryWatchlistTagMapper tagMapper) {
        this.winCcProperties = winCcProperties;
        this.bundleMapper = bundleMapper;
        this.tagMapper = tagMapper;
    }

    public boolean useDatabaseSource() {
        return "database".equalsIgnoreCase(trim(winCcProperties.getWatchlistSource()));
    }

    /**
     * 合并<strong>所有分区</strong>（各文件名对应清单）下已启用的变量名，去重后有序，用于 POST WinCC；同名变量只请求一次（先出现的分区优先）。
     */
    public List<String> loadMergedWinccVariableNamesFromDb() {
        if (!useDatabaseSource()) {
            return List.of();
        }
        try {
            List<TelemetryWatchlistTagRow> rows = tagMapper.selectAllEnabledTagsJoinedBundlesOrdered();
            if (rows == null || rows.isEmpty()) {
                return List.of();
            }
            LinkedHashSet<String> ordered = new LinkedHashSet<>();
            for (TelemetryWatchlistTagRow r : rows) {
                if (r == null || !StringUtils.hasText(r.getWinccVariableName())) {
                    continue;
                }
                String canon = normalizeWinCcVariableKey(r.getWinccVariableName());
                if (StringUtils.hasText(canon)) {
                    ordered.add(canon);
                }
            }
            appendDerivedLimitWinccNames(rows, ordered);
            return new ArrayList<>(ordered);
        } catch (Exception e) {
            log.warn("[WinCC遥测] 读取数据库变量清单失败（表是否已执行 telemetry-watchlist-schema.sql？）: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * 高频测量值拉取：排除限值后缀行、LIMIT_MIN/LIMIT_MAX 角色及推导限值点名（由低频任务单独拉取）。
     */
    public List<String> loadMeasurementWinccVariableNamesFromDb() {
        if (!useDatabaseSource()) {
            return List.of();
        }
        try {
            List<TelemetryWatchlistTagRow> rows = tagMapper.selectAllEnabledTagsJoinedBundlesOrdered();
            if (rows == null || rows.isEmpty()) {
                return List.of();
            }
            LinkedHashSet<String> ordered = new LinkedHashSet<>();
            for (TelemetryWatchlistTagRow r : rows) {
                if (r == null || !StringUtils.hasText(r.getWinccVariableName())) {
                    continue;
                }
                String vn = r.getWinccVariableName().trim();
                String role = normalizeMetricKindRole(r.getMetricKindRole());
                if ("LIMIT_MIN".equals(role) || "LIMIT_MAX".equals(role)) {
                    continue;
                }
                if (WinccLimitVariableNaming.parseLimitSuffix(vn) != null) {
                    continue;
                }
                String canon = normalizeWinCcVariableKey(vn);
                if (StringUtils.hasText(canon)) {
                    ordered.add(canon);
                }
            }
            return new ArrayList<>(ordered);
        } catch (Exception e) {
            log.warn("[WinCC遥测] 读取测量值点名失败: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * 低频限值拉取：配对映射中的 min/max 变量名 + 库内显式限值行（有序去重）。
     */
    public List<String> loadLimitWinccVariableNamesFromDb() {
        if (!useDatabaseSource()) {
            return List.of();
        }
        try {
            TelemetryWatchlistEnrichment en = loadActiveWatchlistEnrichment();
            LinkedHashSet<String> ordered = new LinkedHashSet<>();
            if (!en.isEmpty()) {
                for (String v : en.getAlarmMinVariableByParentVariable().values()) {
                    if (StringUtils.hasText(v)) {
                        String c = normalizeWinCcVariableKey(v);
                        if (StringUtils.hasText(c)) {
                            ordered.add(c);
                        }
                    }
                }
                for (String v : en.getAlarmMaxVariableByParentVariable().values()) {
                    if (StringUtils.hasText(v)) {
                        String c = normalizeWinCcVariableKey(v);
                        if (StringUtils.hasText(c)) {
                            ordered.add(c);
                        }
                    }
                }
            }
            List<TelemetryWatchlistTagRow> rows = tagMapper.selectAllEnabledTagsJoinedBundlesOrdered();
            if (rows != null) {
                for (TelemetryWatchlistTagRow r : rows) {
                    if (r == null || !StringUtils.hasText(r.getWinccVariableName())) {
                        continue;
                    }
                    String vn = r.getWinccVariableName().trim();
                    String role = normalizeMetricKindRole(r.getMetricKindRole());
                    if ("LIMIT_MIN".equals(role) || "LIMIT_MAX".equals(role)) {
                        String c = normalizeWinCcVariableKey(vn);
                        if (StringUtils.hasText(c)) {
                            ordered.add(c);
                        }
                        continue;
                    }
                    if (WinccLimitVariableNaming.parseLimitSuffix(vn) != null) {
                        String c = normalizeWinCcVariableKey(vn);
                        if (StringUtils.hasText(c)) {
                            ordered.add(c);
                        }
                    }
                }
            }
            return new ArrayList<>(ordered);
        } catch (Exception e) {
            log.warn("[WinCC遥测] 读取限值点名失败: {}", e.getMessage());
            return List.of();
        }
    }

    public Map<String, CachedAlarmLimitsSnapshot> loadCachedAlarmLimitsByParentVariable() {
        if (!useDatabaseSource()) {
            return Map.of();
        }
        try {
            List<TelemetryWatchlistTagRow> rows = tagMapper.selectCachedAlarmLimitsForSnapshotMerge();
            Map<String, CachedAlarmLimitsSnapshot> out = new LinkedHashMap<>();
            if (rows != null) {
                for (TelemetryWatchlistTagRow r : rows) {
                    if (r == null || !StringUtils.hasText(r.getWinccVariableName())) {
                        continue;
                    }
                    String key = r.getWinccVariableName().trim();
                    out.putIfAbsent(key, new CachedAlarmLimitsSnapshot(
                            trimOrNull(r.getCachedAlarmMinValue()),
                            trimOrNull(r.getCachedAlarmMaxValue())));
                }
            }
            return out;
        } catch (Exception e) {
            log.warn("[WinCC遥测] 读取限值缓存映射失败: {}", e.getMessage());
            return Map.of();
        }
    }

    /**
     * 低频 WinCC 读到的限值写入主测量行缓存列；若某侧返回值经 {@link #sanitizeLimitValueForMerge} 非空，
     * 则<strong>覆盖</strong>库内该侧已有值（含管理端手改），与「以 WinCC 有效读数更新入库表」一致。
     */
    @Transactional
    public int persistCachedAlarmLimitsFromWinCcRead(Map<String, String> valueByVariableName,
                                                       TelemetryWatchlistEnrichment en) {
        if (!useDatabaseSource() || en == null || en.isEmpty()) {
            return 0;
        }
        Map<String, String> minByParent = en.getAlarmMinVariableByParentVariable();
        Map<String, String> maxByParent = en.getAlarmMaxVariableByParentVariable();
        LinkedHashSet<String> parents = new LinkedHashSet<>();
        parents.addAll(minByParent.keySet());
        parents.addAll(maxByParent.keySet());
        LocalDateTime at = LocalDateTime.now();
        int n = 0;
        for (String parent : parents) {
            if (!StringUtils.hasText(parent)) {
                continue;
            }
            String p = parent.trim();
            String minVn = minByParent.get(p);
            String maxVn = maxByParent.get(p);
            String minVal = sanitizeLimitValueForMerge(resolvePulledValue(valueByVariableName, minVn));
            String maxVal = sanitizeLimitValueForMerge(resolvePulledValue(valueByVariableName, maxVn));
            if (minVal == null && maxVal == null) {
                continue;
            }
            n += tagMapper.mergeCachedAlarmLimitsByVariableName(p, minVal, maxVal, at);
        }
        return n;
    }

    private static String resolvePulledValue(Map<String, String> m, String vn) {
        if (m == null || !StringUtils.hasText(vn)) {
            return null;
        }
        String v = m.get(vn.trim());
        return StringUtils.hasText(v) ? v.trim() : null;
    }

    /**
     * 限值缓存合并：空串或<strong>数值为 0</strong>时不写入（传 {@code null}），避免 WinCC 占位/断连时的 0 覆盖库内已有上下限。
     * 非数字字符串原样保留（现场极少见）。
     */
    static String sanitizeLimitValueForMerge(String pulled) {
        if (!StringUtils.hasText(pulled)) {
            return null;
        }
        String t = pulled.trim().replace(',', '.');
        try {
            double d = Double.parseDouble(t);
            if (Math.abs(d) < 1e-12d) {
                return null;
            }
        } catch (NumberFormatException ignored) {
            // keep raw
        }
        return pulled.trim();
    }

    private static String trimOrNull(String s) {
        return StringUtils.hasText(s) ? s.trim() : null;
    }

    /**
     * 合并「参与 WinCC 拉数」分区下已启用变量：展示名、分区 code、分区标题；同名变量以先出现的分区为准。
     */
    public TelemetryWatchlistEnrichment loadActiveWatchlistEnrichment() {
        if (!useDatabaseSource()) {
            return TelemetryWatchlistEnrichment.empty();
        }
        try {
            List<TelemetryWatchlistTagRow> rows = tagMapper.selectAllEnabledTagsJoinedBundlesOrdered();
            Map<String, String> labels = new LinkedHashMap<>();
            Map<String, String> bundleCodes = new LinkedHashMap<>();
            Map<String, String> bundleTitles = new LinkedHashMap<>();
            Map<String, String> floors = new LinkedHashMap<>();
            Map<String, String> roomCanon = new LinkedHashMap<>();
            Map<String, String> kindCodes = new LinkedHashMap<>();
            Map<String, String> kindLabels = new LinkedHashMap<>();
            Map<String, String> kindRoles = new LinkedHashMap<>();
            Map<String, Long> tagIds = new LinkedHashMap<>();
            Map<String, String> ovMin = new LinkedHashMap<>();
            Map<String, String> ovMax = new LinkedHashMap<>();
            if (rows != null) {
                for (TelemetryWatchlistTagRow r : rows) {
                    if (r.getWinccVariableName() == null) {
                        continue;
                    }
                    String key = normalizeWinCcVariableKey(r.getWinccVariableName());
                    if (!StringUtils.hasText(key)) {
                        continue;
                    }
                    if (StringUtils.hasText(r.getDisplayLabel())) {
                        labels.putIfAbsent(key, r.getDisplayLabel().trim());
                    }
                    if (StringUtils.hasText(r.getBundleCode())) {
                        bundleCodes.putIfAbsent(key, r.getBundleCode().trim());
                    }
                    if (StringUtils.hasText(r.getBundleDisplayName())) {
                        bundleTitles.putIfAbsent(key, r.getBundleDisplayName().trim());
                    }
                    if (StringUtils.hasText(r.getFloorCode())) {
                        floors.putIfAbsent(key, r.getFloorCode().trim());
                    }
                    if (StringUtils.hasText(r.getRoomCanonical())) {
                        roomCanon.putIfAbsent(key, r.getRoomCanonical().trim());
                    }
                    if (StringUtils.hasText(r.getMetricKindCode())) {
                        kindCodes.putIfAbsent(key, r.getMetricKindCode().trim());
                    }
                    if (StringUtils.hasText(r.getMetricKindLabel())) {
                        kindLabels.putIfAbsent(key, r.getMetricKindLabel().trim());
                    }
                    kindRoles.putIfAbsent(key, normalizeMetricKindRole(r.getMetricKindRole()));
                    if (r.getId() != null) {
                        tagIds.putIfAbsent(key, r.getId());
                    }
                    if (StringUtils.hasText(r.getAlarmOverrideMin())) {
                        ovMin.putIfAbsent(key, r.getAlarmOverrideMin().trim());
                    }
                    if (StringUtils.hasText(r.getAlarmOverrideMax())) {
                        ovMax.putIfAbsent(key, r.getAlarmOverrideMax().trim());
                    }
                }
            }
            AlarmLimitMaps alarm = buildAlarmLimitMaps(rows);
            return new TelemetryWatchlistEnrichment(labels, bundleCodes, bundleTitles, floors, roomCanon,
                    kindCodes, kindLabels, kindRoles, alarm.minByParent(), alarm.maxByParent(),
                    tagIds, ovMin, ovMax);
        } catch (Exception e) {
            log.warn("[WinCC遥测] 加载 watchlist 映射与分区信息失败: {}", e.getMessage());
            return TelemetryWatchlistEnrichment.empty();
        }
    }

    /**
     * variableName → 展示名：合并所有分区已启用行；同名变量以<strong>先出现</strong>的分区为准（与拉取 WinCC 时的去重顺序一致）。
     */
    public Map<String, String> getActiveDisplayLabelMap() {
        return loadActiveWatchlistEnrichment().getDisplayLabelByVariable();
    }

    /**
     * 合并映射后的 kind_role（含 SWITCH / SETPOINT）；无映射时视为 METRIC。
     */
    public String resolveNormalizedKindRoleForVariable(String variableName) {
        if (!StringUtils.hasText(variableName)) {
            return "METRIC";
        }
        TelemetryWatchlistEnrichment en = loadActiveWatchlistEnrichment();
        if (en.isEmpty()) {
            return "METRIC";
        }
        Map<String, String> map = en.getMetricKindRoleByVariable();
        String t = variableName.trim();
        String hit = map.get(t);
        if (StringUtils.hasText(hit)) {
            return normalizeMetricKindRole(hit);
        }
        String want = normalizeWinCcVariableKey(t);
        for (Map.Entry<String, String> e : map.entrySet()) {
            if (e.getKey() == null || !StringUtils.hasText(e.getValue())) {
                continue;
            }
            if (normalizeWinCcVariableKey(e.getKey()).equals(want)) {
                return normalizeMetricKindRole(e.getValue());
            }
        }
        return "METRIC";
    }

    /**
     * 变量是否在当前统一快照 POST /Values 点名集合中（排除报警上下限类点名）。
     */
    public boolean isVariableInUnifiedSnapshotPollList(String variableName) {
        if (!StringUtils.hasText(variableName) || !useDatabaseSource()) {
            return false;
        }
        List<String> list = loadMeasurementWinccVariableNamesFromDb();
        String t = variableName.trim();
        if (list.contains(t)) {
            return true;
        }
        String want = normalizeWinCcVariableKey(t);
        for (String n : list) {
            if (StringUtils.hasText(n) && normalizeWinCcVariableKey(n.trim()).equals(want)) {
                return true;
            }
        }
        return false;
    }

    /** 预留：多分区合并后不再做内存缓存，调用方可继续 invoke 以保持兼容 */
    public void invalidateDisplayCache() {
        // no-op
    }

    public List<TelemetryWatchlistBundleDto> listBundles() {
        try {
            List<TelemetryWatchlistBundleRow> rows = bundleMapper.selectAllOrderByUpdated();
            List<TelemetryWatchlistBundleDto> out = new ArrayList<>();
            if (rows == null) {
                return out;
            }
            for (TelemetryWatchlistBundleRow r : rows) {
                out.add(toBundleDto(r));
            }
            return out;
        } catch (Exception e) {
            log.warn("[WinCC遥测] 列出测点套失败（表是否已创建？）: {}", e.getMessage());
            return List.of();
        }
    }

    @Transactional
    public TelemetryWatchlistBundleDto createBundle(String code, String displayName) {
        String c = normalizeCode(code);
        if (bundleMapper.selectByCode(c) != null) {
            throw new IllegalArgumentException("code 已存在: " + c);
        }
        TelemetryWatchlistBundleRow row = new TelemetryWatchlistBundleRow();
        row.setCode(c);
        row.setDisplayName(displayName == null ? c : displayName.trim());
        row.setSourceFilename(null);
        row.setIsActive(0);
        row.setIncludeInWinccPoll(1);
        bundleMapper.insert(row);
        return toBundleDto(bundleMapper.selectByCode(c));
    }

    @Transactional
    public void deleteBundle(String code) {
        TelemetryWatchlistBundleRow r = requireBundle(code);
        bundleMapper.deleteById(r.getId());
        invalidateDisplayCache();
    }

    @Transactional
    public void activateBundle(String code) {
        requireBundle(code);
        bundleMapper.clearAllActive();
        bundleMapper.setActiveByCode(normalizeCode(code));
        invalidateDisplayCache();
    }

    @Transactional
    public void setBundleIncludeInWinccPoll(String code, boolean includeInWinccPoll) {
        requireBundle(code);
        bundleMapper.updatePollEnabledByCode(normalizeCode(code), includeInWinccPoll ? 1 : 0);
        invalidateDisplayCache();
    }

    public List<TelemetryWatchlistTagDto> listAllTagsForAdmin(String code) {
        TelemetryWatchlistBundleRow b = requireBundle(code);
        try {
            List<TelemetryWatchlistTagRow> rows = tagMapper.selectAllByBundleId(b.getId());
            List<TelemetryWatchlistTagDto> out = new ArrayList<>();
            if (rows != null) {
                for (TelemetryWatchlistTagRow r : rows) {
                    out.add(toTagDto(r));
                }
            }
            return out;
        } catch (Exception e) {
            log.warn("[WinCC遥测] 加载测点行失败: {}", e.getMessage());
            return List.of();
        }
    }

    /** 管理端：每个文件名分区一张表，带全量变量行 */
    public List<TelemetryWatchlistZoneAdminDto> listZonesWithTagsForAdmin() {
        List<TelemetryWatchlistBundleDto> bundles = listBundles();
        List<TelemetryWatchlistZoneAdminDto> out = new ArrayList<>();
        for (TelemetryWatchlistBundleDto b : bundles) {
            List<TelemetryWatchlistTagDto> tags = listAllTagsForAdmin(b.getCode());
            out.add(TelemetryWatchlistZoneAdminDto.builder().bundle(b).tags(tags).build());
        }
        return out;
    }

    public TelemetryWatchlistTagPageDto pageTags(String code, int page, int size, String q) {
        TelemetryWatchlistBundleRow b = requireBundle(code);
        int p = Math.max(1, page);
        int s = Math.min(200, Math.max(1, size));
        int offset = (p - 1) * s;
        int total = tagMapper.countByBundleId(b.getId());
        List<TelemetryWatchlistTagRow> rows = tagMapper.selectPageByBundle(b.getId(), offset, s, trimToNull(q));
        List<TelemetryWatchlistTagDto> items = new ArrayList<>();
        if (rows != null) {
            for (TelemetryWatchlistTagRow r : rows) {
                items.add(toTagDto(r));
            }
        }
        return TelemetryWatchlistTagPageDto.builder()
                .total(total)
                .page(p)
                .size(s)
                .items(items)
                .build();
    }

    @Transactional
    public int replaceAllTags(String code, List<TelemetryWatchlistTagWriteDto> writes, String sourceFilename) {
        TelemetryWatchlistBundleRow b = requireBundle(code);
        Map<String, AlarmCachePreserve> preserve = new LinkedHashMap<>();
        Map<String, AlarmOverridePreserve> preserveOv = new LinkedHashMap<>();
        for (TelemetryWatchlistTagRow old : tagMapper.selectAllByBundleId(b.getId())) {
            AlarmCachePreserve snap = AlarmCachePreserve.fromRow(old);
            if (snap != null && StringUtils.hasText(old.getWinccVariableName())) {
                preserve.put(normalizeWinCcVariableKey(old.getWinccVariableName()), snap);
            }
            AlarmOverridePreserve ov = AlarmOverridePreserve.fromRow(old);
            if (ov != null && StringUtils.hasText(old.getWinccVariableName())) {
                preserveOv.put(normalizeWinCcVariableKey(old.getWinccVariableName()), ov);
            }
        }
        tagMapper.deleteByBundleId(b.getId());
        if (writes == null || writes.isEmpty()) {
            bundleMapper.updateMetaById(b.getId(), b.getDisplayName(), sourceFilename);
            invalidateDisplayCache();
            return 0;
        }
        final boolean payloadIncludesCacheColumns = writes.stream().anyMatch(w ->
                w != null && (w.getCachedAlarmMinValue() != null || w.getCachedAlarmMaxValue() != null));
        final boolean payloadIncludesOverrideColumns = writes.stream().anyMatch(w ->
                w != null && (w.getAlarmOverrideMin() != null || w.getAlarmOverrideMax() != null));
        List<TelemetryWatchlistTagRow> batch = new ArrayList<>();
        java.util.HashSet<String> seen = new java.util.HashSet<>();
        int n = 0;
        int order = 0;
        for (TelemetryWatchlistTagWriteDto w : writes) {
            if (w == null || !StringUtils.hasText(w.getWinccVariableName())) {
                continue;
            }
            String name = normalizeWinCcVariableKey(w.getWinccVariableName());
            if (!StringUtils.hasText(name) || isHeaderLikeToken(name)) {
                continue;
            }
            if (!seen.add(name)) {
                continue;
            }
            TelemetryWatchlistTagRow row = new TelemetryWatchlistTagRow();
            row.setBundleId(b.getId());
            row.setWinccVariableName(name);
            row.setStructureType(trimToNull(w.getStructureType()));
            row.setDataType(trimToNull(w.getDataType()));
            row.setDisplayLabel(trimToNull(w.getDisplayLabel()));
            row.setFloorCode(trimToNull(w.getFloorCode()));
            row.setRoomBase(null);
            row.setRoomCanonical(trimToNull(w.getRoomCanonical()));
            row.setSuiteSuffix(null);
            row.setMetricKindCode(trimToNull(w.getMetricKindCode()));
            AlarmCachePreserve snap = preserve.get(name);
            if (payloadIncludesCacheColumns) {
                row.setCachedAlarmMinValue(trimToNull(w.getCachedAlarmMinValue()));
                row.setCachedAlarmMaxValue(trimToNull(w.getCachedAlarmMaxValue()));
                if (StringUtils.hasText(row.getCachedAlarmMinValue()) || StringUtils.hasText(row.getCachedAlarmMaxValue())) {
                    row.setCachedAlarmLimitsAt(LocalDateTime.now());
                } else {
                    row.setCachedAlarmLimitsAt(null);
                }
            } else if (snap != null) {
                row.setCachedAlarmMinValue(snap.min());
                row.setCachedAlarmMaxValue(snap.max());
                row.setCachedAlarmLimitsAt(snap.at());
            }
            AlarmOverridePreserve ovSnap = preserveOv.get(name);
            if (payloadIncludesOverrideColumns) {
                row.setAlarmOverrideMin(trimToNull(w.getAlarmOverrideMin()));
                row.setAlarmOverrideMax(trimToNull(w.getAlarmOverrideMax()));
            } else if (ovSnap != null) {
                row.setAlarmOverrideMin(ovSnap.min());
                row.setAlarmOverrideMax(ovSnap.max());
            }
            if (WinccLimitVariableNaming.parseLimitSuffix(name) != null) {
                row.setCachedAlarmMinValue(null);
                row.setCachedAlarmMaxValue(null);
                row.setCachedAlarmLimitsAt(null);
                row.setAlarmOverrideMin(null);
                row.setAlarmOverrideMax(null);
            }
            row.setEnabled(effectiveEnabledForStore(w) ? 1 : 0);
            row.setSortOrder(w.getSortOrder() != null ? w.getSortOrder() : order);
            batch.add(row);
            order++;
            n++;
            if (batch.size() >= INSERT_CHUNK) {
                tagMapper.insertBatch(batch);
                batch.clear();
            }
        }
        if (!batch.isEmpty()) {
            tagMapper.insertBatch(batch);
        }
        bundleMapper.updateMetaById(b.getId(), b.getDisplayName(), sourceFilename);
        invalidateDisplayCache();
        return n;
    }

    /**
     * 从 WinCC 导出 CSV 导入：按表头读取「名称、结构类型、数据类型」，注释列写入默认展示映射。
     */
    @Transactional
    public int importCsvText(String code, String sourceFilename, String csvText) {
        List<TelemetryWatchlistTagWriteDto> writes = WinccExportCsvParseUtil.parse(csvText);
        return replaceAllTags(code, writes, sourceFilename);
    }

    /**
     * 前端上传 CSV：按<strong>文件名</strong>对应一个分区（如 1F / 2F）；该分区内<strong>合并</strong>变量（同名更新、新名插入），
     * <strong>不会</strong>删掉该分区内本次 CSV 未出现的行。WinCC 会合并<strong>所有分区</strong>里已启用的变量去拉数。
     */
    @Transactional
    public Map<String, Object> importCsvFromUploadedFile(String originalFilename, String csvText) {
        String displayLabel = displayNameFromUpload(originalFilename);
        String code = codeSlugFromUploadFilename(originalFilename);
        TelemetryWatchlistBundleRow existing = bundleMapper.selectByCode(code);
        if (existing == null) {
            createBundle(code, displayLabel);
        } else {
            bundleMapper.updateMetaByCode(code, displayLabel, basenameOnly(originalFilename));
        }
        int imported = mergeCsvIntoBundle(code, basenameOnly(originalFilename), csvText);
        Map<String, Object> out = new HashMap<>();
        out.put("imported", imported);
        out.put("bundleCode", code);
        out.put("displayName", displayLabel);
        out.put("merged", Boolean.TRUE);
        return out;
    }

    /**
     * 将 CSV 合并进指定分区：同名变量更新，新变量插入；<strong>不删除</strong>本分区中本次 CSV 未出现的行。
     */
    @Transactional
    public int mergeCsvIntoBundle(String code, String sourceFilename, String csvText) {
        TelemetryWatchlistBundleRow b = requireBundle(normalizeCode(code));
        List<TelemetryWatchlistTagWriteDto> writes = WinccExportCsvParseUtil.parse(csvText);
        if (writes == null || writes.isEmpty()) {
            bundleMapper.updateMetaById(b.getId(), b.getDisplayName(), sourceFilename);
            invalidateDisplayCache();
            return 0;
        }
        java.util.HashSet<String> seenInCsv = new java.util.HashSet<>();
        int n = 0;
        int order = 0;
        for (TelemetryWatchlistTagWriteDto w : writes) {
            if (w == null || !StringUtils.hasText(w.getWinccVariableName())) {
                continue;
            }
            String name = normalizeWinCcVariableKey(w.getWinccVariableName());
            if (!StringUtils.hasText(name) || isHeaderLikeToken(name)) {
                continue;
            }
            if (!seenInCsv.add(name)) {
                continue;
            }
            TelemetryWatchlistTagRow prev = tagMapper.selectByBundleIdAndVariableName(b.getId(), name);
            TelemetryWatchlistTagRow row = new TelemetryWatchlistTagRow();
            row.setBundleId(b.getId());
            row.setWinccVariableName(name);
            row.setStructureType(trimToNull(w.getStructureType()));
            row.setDataType(trimToNull(w.getDataType()));
            row.setDisplayLabel(firstNonBlank(trimToNull(w.getDisplayLabel()), prev != null ? prev.getDisplayLabel() : null));
            row.setFloorCode(firstNonBlank(trimToNull(w.getFloorCode()), prev != null ? prev.getFloorCode() : null));
            row.setRoomBase(null);
            row.setRoomCanonical(firstNonBlank(trimToNull(w.getRoomCanonical()), prev != null ? prev.getRoomCanonical() : null));
            row.setSuiteSuffix(null);
            row.setMetricKindCode(firstNonBlank(trimToNull(w.getMetricKindCode()), prev != null ? prev.getMetricKindCode() : null));
            if (prev != null) {
                if (WinccLimitVariableNaming.parseLimitSuffix(name) == null) {
                    row.setCachedAlarmMinValue(prev.getCachedAlarmMinValue());
                    row.setCachedAlarmMaxValue(prev.getCachedAlarmMaxValue());
                    row.setCachedAlarmLimitsAt(prev.getCachedAlarmLimitsAt());
                    row.setAlarmOverrideMin(prev.getAlarmOverrideMin());
                    row.setAlarmOverrideMax(prev.getAlarmOverrideMax());
                } else {
                    row.setCachedAlarmMinValue(null);
                    row.setCachedAlarmMaxValue(null);
                    row.setCachedAlarmLimitsAt(null);
                    row.setAlarmOverrideMin(null);
                    row.setAlarmOverrideMax(null);
                }
            }
            TelemetryWatchlistTagWriteDto merged = mergeWriteForEnable(w, prev);
            row.setEnabled(effectiveEnabledForStore(merged) ? 1 : 0);
            row.setSortOrder(w.getSortOrder() != null ? w.getSortOrder() : order);
            tagMapper.upsertOne(row);
            order++;
            n++;
        }
        TelemetryWatchlistBundleRow refreshed = bundleMapper.selectByCode(normalizeCode(code));
        if (refreshed != null) {
            bundleMapper.updateMetaById(refreshed.getId(), refreshed.getDisplayName(), sourceFilename);
        }
        invalidateDisplayCache();
        return n;
    }

    /** 列表上展示用：完整文件名（仅最后一段路径），无则占位。 */
    public static String displayNameFromUpload(String originalFilename) {
        String base = basenameOnly(originalFilename);
        return StringUtils.hasText(base) ? base : "import.csv";
    }

    public static String basenameOnly(String filename) {
        if (!StringUtils.hasText(filename)) {
            return "";
        }
        String s = filename.trim();
        int slash = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
        if (slash >= 0 && slash + 1 < s.length()) {
            s = s.substring(slash + 1);
        }
        return s.trim();
    }

    /**
     * 由上传文件名得到库内 code（小写、数字、连字符），供库表唯一键与接口路径使用。
     */
    public static String codeSlugFromUploadFilename(String originalFilename) {
        String base = basenameOnly(originalFilename);
        if (!StringUtils.hasText(base)) {
            return fallbackImportCode(originalFilename);
        }
        String lower = base.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".csv")) {
            base = base.substring(0, base.length() - 4);
        }
        base = base.trim().toLowerCase(Locale.ROOT);
        String slug = base.replaceAll("[^a-z0-9]+", "-").replaceAll("-+", "-");
        slug = slug.replaceAll("^-+", "").replaceAll("-+$", "");
        if (!StringUtils.hasText(slug)) {
            return fallbackImportCode(originalFilename);
        }
        if (slug.length() > 64) {
            slug = slug.substring(0, 64).replaceAll("-+$", "");
        }
        if (!StringUtils.hasText(slug)) {
            return fallbackImportCode(originalFilename);
        }
        char first = slug.charAt(0);
        char last = slug.charAt(slug.length() - 1);
        if (!(Character.isLetterOrDigit(first) && Character.isLetterOrDigit(last))) {
            return fallbackImportCode(originalFilename);
        }
        try {
            return normalizeCode(slug);
        } catch (IllegalArgumentException ex) {
            return fallbackImportCode(originalFilename);
        }
    }

    private static String fallbackImportCode(String originalFilename) {
        int h = Objects.hashCode(originalFilename == null ? "" : originalFilename);
        String hex = Integer.toHexString(Math.floorMod(h, 0x1000_0000));
        return normalizeCode("import-" + hex);
    }

    private static boolean isHeaderLikeToken(String cell) {
        if (!StringUtils.hasText(cell)) {
            return false;
        }
        String lower = cell.trim().toLowerCase(Locale.ROOT);
        return "名称".equals(cell.trim())
                || lower.equals("tagname")
                || lower.equals("wincc_tag")
                || lower.equals("variable");
    }

    private TelemetryWatchlistBundleRow requireBundle(String code) {
        TelemetryWatchlistBundleRow r = bundleMapper.selectByCode(normalizeCode(code));
        if (r == null) {
            throw new IllegalArgumentException("未找到测点清单: " + code);
        }
        return r;
    }

    public static String normalizeCode(String code) {
        if (!StringUtils.hasText(code)) {
            throw new IllegalArgumentException("code 不能为空");
        }
        String c = code.trim().toLowerCase(Locale.ROOT);
        if (c.length() > 64) {
            throw new IllegalArgumentException("code 最长 64 字符");
        }
        if (!(c.matches("[a-z0-9]") || c.matches("[a-z0-9][a-z0-9-]*[a-z0-9]"))) {
            throw new IllegalArgumentException("code 仅允许小写字母、数字、连字符，且首尾须为字母或数字");
        }
        return c;
    }

    private static TelemetryWatchlistBundleDto toBundleDto(TelemetryWatchlistBundleRow r) {
        return TelemetryWatchlistBundleDto.builder()
                .id(r.getId())
                .code(r.getCode())
                .displayName(r.getDisplayName())
                .sourceFilename(r.getSourceFilename())
                .active(r.getIsActive() != null && r.getIsActive() == 1)
                .includeInWinccPoll(r.getIncludeInWinccPoll() == null || r.getIncludeInWinccPoll() != 0)
                .build();
    }

    private static TelemetryWatchlistTagDto toTagDto(TelemetryWatchlistTagRow r) {
        return TelemetryWatchlistTagDto.builder()
                .id(r.getId())
                .winccVariableName(r.getWinccVariableName())
                .structureType(r.getStructureType())
                .dataType(r.getDataType())
                .displayLabel(r.getDisplayLabel())
                .floorCode(r.getFloorCode())
                .roomCanonical(r.getRoomCanonical())
                .metricKindCode(r.getMetricKindCode())
                .cachedAlarmMinValue(r.getCachedAlarmMinValue())
                .cachedAlarmMaxValue(r.getCachedAlarmMaxValue())
                .cachedAlarmLimitsAt(r.getCachedAlarmLimitsAt())
                .alarmOverrideMin(r.getAlarmOverrideMin())
                .alarmOverrideMax(r.getAlarmOverrideMax())
                .enabled(r.getEnabled() == null || r.getEnabled() != 0)
                .sortOrder(r.getSortOrder() == null ? 0 : r.getSortOrder())
                .build();
    }

    @Transactional
    public TelemetryWatchlistTagDto updateTagAlarmOverrides(String bundleCode, long tagId,
                                                            TelemetryWatchlistTagAlarmOverridePatchDto body) {
        if (body == null) {
            throw new IllegalArgumentException("body 不能为空");
        }
        TelemetryWatchlistBundleRow b = requireBundle(bundleCode);
        TelemetryWatchlistTagRow row = tagMapper.selectById(tagId);
        if (row == null || row.getBundleId() == null || !row.getBundleId().equals(b.getId())) {
            throw new IllegalArgumentException("测点行不存在或不属于该分区");
        }
        String min = trimToNull(body.getAlarmOverrideMin());
        String max = trimToNull(body.getAlarmOverrideMax());
        int n = tagMapper.updateAlarmOverridesById(tagId, b.getId(), min, max);
        if (n <= 0) {
            throw new IllegalStateException("更新报警覆盖失败");
        }
        invalidateDisplayCache();
        TelemetryWatchlistTagRow refreshed = tagMapper.selectById(tagId);
        return toTagDto(refreshed);
    }

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }

    private static String trimToNull(String s) {
        if (!StringUtils.hasText(s)) {
            return null;
        }
        return s.trim();
    }

    /** 展示映射非空且非字面量「无」时，才允许 enabled 落库为 true（与前端不变式一致）。 */
    private static boolean hasValidDisplayMapping(String displayLabel) {
        if (!StringUtils.hasText(displayLabel)) {
            return false;
        }
        String t = displayLabel.trim();
        return !"无".equals(t);
    }

    private static TelemetryWatchlistTagWriteDto mergeWriteForEnable(TelemetryWatchlistTagWriteDto w, TelemetryWatchlistTagRow prev) {
        TelemetryWatchlistTagWriteDto m = new TelemetryWatchlistTagWriteDto();
        m.setEnabled(w.getEnabled());
        m.setDisplayLabel(firstNonBlank(trimToNull(w.getDisplayLabel()), prev != null ? prev.getDisplayLabel() : null));
        m.setFloorCode(firstNonBlank(trimToNull(w.getFloorCode()), prev != null ? prev.getFloorCode() : null));
        m.setRoomCanonical(firstNonBlank(trimToNull(w.getRoomCanonical()), prev != null ? prev.getRoomCanonical() : null));
        m.setMetricKindCode(firstNonBlank(trimToNull(w.getMetricKindCode()), prev != null ? prev.getMetricKindCode() : null));
        return m;
    }

    private static String firstNonBlank(String a, String b) {
        if (StringUtils.hasText(a)) {
            return a;
        }
        if (StringUtils.hasText(b)) {
            return b.trim();
        }
        return null;
    }

    /**
     * 落库 enabled：默认要求展示映射有效；限值后缀变量可在<strong>无展示映射</strong>时启用，
     * 但须具备楼层/房间/类别（与 WinCC 合并拉数 SQL 一致）。
     */
    private static boolean effectiveEnabledForStore(TelemetryWatchlistTagWriteDto w) {
        if (!Boolean.TRUE.equals(w.getEnabled())) {
            return false;
        }
        if (hasValidDisplayMapping(w.getDisplayLabel())) {
            return true;
        }
        return WinccLimitVariableNaming.isLimitSuffixVariable(w.getWinccVariableName())
                && hasStructuredFieldsForPoll(w);
    }

    private static boolean hasStructuredFieldsForPoll(TelemetryWatchlistTagWriteDto w) {
        return StringUtils.hasText(trimToNull(w.getFloorCode()))
                && StringUtils.hasText(trimToNull(w.getRoomCanonical()))
                && StringUtils.hasText(trimToNull(w.getMetricKindCode()));
    }

    private record AlarmLimitMaps(Map<String, String> minByParent, Map<String, String> maxByParent) {
    }

    private static String normalizeMetricKindRole(String raw) {
        if (!StringUtils.hasText(raw)) {
            return "METRIC";
        }
        String u = raw.trim().toUpperCase(Locale.ROOT);
        return switch (u) {
            case "LIMIT_MIN", "LIMIT_MAX", "SWITCH", "SETPOINT", "METRIC" -> u;
            default -> "METRIC";
        };
    }

    private static boolean isStrictMetricParentRole(String role) {
        return "METRIC".equals(normalizeMetricKindRole(role));
    }

    /** 湿度：字典多为 {@code HUM}，限值后缀解析也为 {@code HUM}；现场类别偶填 {@code RH}，须视为同类以便配对主变量。 */
    private static boolean metricKindMatchesForLimitPairing(String rowMk, String limitParsedMk) {
        if (!StringUtils.hasText(rowMk) || !StringUtils.hasText(limitParsedMk)) {
            return false;
        }
        String a = rowMk.trim().toUpperCase(Locale.ROOT);
        String b = limitParsedMk.trim().toUpperCase(Locale.ROOT);
        if (a.equals(b)) {
            return true;
        }
        return (a.equals("HUM") || a.equals("RH")) && (b.equals("HUM") || b.equals("RH"));
    }

    private static String findParentMetricVariable(String baseNorm, String metricKindCode, List<TelemetryWatchlistTagRow> rows) {
        String base = baseNorm.trim();
        List<String> candidates = new ArrayList<>();
        for (TelemetryWatchlistTagRow r : rows) {
            if (r == null || !StringUtils.hasText(r.getWinccVariableName())) {
                continue;
            }
            if (!isStrictMetricParentRole(r.getMetricKindRole())) {
                continue;
            }
            String mk = trimToNull(r.getMetricKindCode());
            if (!StringUtils.hasText(mk) || !metricKindMatchesForLimitPairing(mk, metricKindCode)) {
                continue;
            }
            String vn = r.getWinccVariableName().trim();
            if (WinccLimitVariableNaming.parseLimitSuffix(vn) != null) {
                continue;
            }
            candidates.add(vn);
        }
        for (String vn : candidates) {
            if (vn.equals(base)) {
                return vn;
            }
        }
        for (String vn : candidates) {
            if (vn.equalsIgnoreCase(base)) {
                return vn;
            }
        }
        List<String> prefixed = candidates.stream()
                .filter(vn -> vn.length() >= base.length() && vn.startsWith(base)
                        && (vn.length() == base.length()
                        || vn.charAt(base.length()) == '_' || vn.charAt(base.length()) == '.'))
                .sorted(Comparator.comparingInt(String::length))
                .toList();
        if (!prefixed.isEmpty()) {
            return prefixed.get(0);
        }
        log.warn("[WinCC遥测] 未找到限值配对主变量 base={} metricKind={}（请核对变量名后缀 _PT_Floor/_PT_Top 等与主测量名）",
                base, metricKindCode);
        return null;
    }

    private static final class LimitVarSlots {
        String minVar;
        String maxVar;
    }

    private static AlarmLimitMaps buildAlarmLimitMaps(List<TelemetryWatchlistTagRow> rows) {
        Map<String, LimitVarSlots> grouped = new LinkedHashMap<>();
        List<TelemetryWatchlistTagRow> list = rows == null ? List.of() : rows;
        for (TelemetryWatchlistTagRow r : list) {
            if (r == null || !StringUtils.hasText(r.getWinccVariableName())) {
                continue;
            }
            String vn = r.getWinccVariableName().trim();
            WinccLimitVariableNaming.Parsed pl = WinccLimitVariableNaming.parseLimitSuffix(vn);
            if (pl == null) {
                continue;
            }
            String gk = pl.base() + ":::" + pl.metricKindCode().toUpperCase(Locale.ROOT);
            LimitVarSlots slot = grouped.computeIfAbsent(gk, k -> new LimitVarSlots());
            if (pl.minSlot()) {
                slot.minVar = vn;
            } else {
                slot.maxVar = vn;
            }
        }
        Map<String, String> minByParent = new LinkedHashMap<>();
        Map<String, String> maxByParent = new LinkedHashMap<>();
        for (Map.Entry<String, LimitVarSlots> e : grouped.entrySet()) {
            String[] parts = e.getKey().split(":::", 2);
            if (parts.length != 2) {
                continue;
            }
            String base = parts[0];
            String mk = parts[1];
            LimitVarSlots slot = e.getValue();
            String parent = findParentMetricVariable(base, mk, list);
            if (parent == null) {
                continue;
            }
            if (StringUtils.hasText(slot.minVar)) {
                minByParent.put(parent, slot.minVar);
            }
            if (StringUtils.hasText(slot.maxVar)) {
                maxByParent.put(parent, slot.maxVar);
            }
        }
        applyDerivedAlarmLimitAliases(list, minByParent, maxByParent);
        return new AlarmLimitMaps(minByParent, maxByParent);
    }

    /**
     * 按命名约定为主测量自动追加 WinCC 点名：{@code base_PT_Floor/base_PT_Top}、{@code _TT_*}、{@code _RH_*}，
     * 无需在库中为每个限值单独建行即可参与 POST（库内显式限值行仍优先）。
     */
    private static void appendDerivedLimitWinccNames(List<TelemetryWatchlistTagRow> rows, LinkedHashSet<String> ordered) {
        if (rows == null || rows.isEmpty() || ordered == null) {
            return;
        }
        for (TelemetryWatchlistTagRow r : rows) {
            if (r == null || !StringUtils.hasText(r.getWinccVariableName())) {
                continue;
            }
            if (!isStrictMetricParentRole(r.getMetricKindRole())) {
                continue;
            }
            String mk = trimToNull(r.getMetricKindCode());
            if (!isTempHumPressureKind(mk)) {
                continue;
            }
            String parent = normalizeWinCcVariableKey(r.getWinccVariableName());
            if (!StringUtils.hasText(parent) || WinccLimitVariableNaming.parseLimitSuffix(parent) != null) {
                continue;
            }
            for (String derived : deriveFloorTopLimitVariableNames(parent, mk)) {
                ordered.add(derived);
            }
        }
    }

    private static boolean isTempHumPressureKind(String metricKindCode) {
        if (!StringUtils.hasText(metricKindCode)) {
            return false;
        }
        String u = metricKindCode.trim().toUpperCase(Locale.ROOT);
        return "TEMP".equals(u) || "HUM".equals(u) || "PRESSURE".equals(u);
    }

    /** 与 {@link WinccLimitVariableNaming} 中后缀一致（大小写敏感拼接，匹配时用忽略大小写）。 */
    private static List<String> deriveFloorTopLimitVariableNames(String parentWinccName, String metricKindCode) {
        String u = metricKindCode.trim().toUpperCase(Locale.ROOT);
        return switch (u) {
            case "PRESSURE" -> List.of(parentWinccName + "_PT_Floor", parentWinccName + "_PT_Top");
            case "TEMP" -> List.of(parentWinccName + "_TT_Floor", parentWinccName + "_TT_Top");
            case "HUM" -> List.of(parentWinccName + "_RH_Floor", parentWinccName + "_RH_Top");
            default -> List.of();
        };
    }

    /**
     * 对每条 METRIC 主测量推导上下限变量名并写入映射（仅当该 parent 尚无条目时），与 {@link #appendDerivedLimitWinccNames} 配套。
     */
    private static void applyDerivedAlarmLimitAliases(List<TelemetryWatchlistTagRow> rows,
                                                      Map<String, String> minByParent,
                                                      Map<String, String> maxByParent) {
        if (rows == null || rows.isEmpty()) {
            return;
        }
        for (TelemetryWatchlistTagRow r : rows) {
            if (r == null || !StringUtils.hasText(r.getWinccVariableName())) {
                continue;
            }
            if (!isStrictMetricParentRole(r.getMetricKindRole())) {
                continue;
            }
            String mk = trimToNull(r.getMetricKindCode());
            if (!isTempHumPressureKind(mk)) {
                continue;
            }
            String parent = normalizeWinCcVariableKey(r.getWinccVariableName());
            if (!StringUtils.hasText(parent) || WinccLimitVariableNaming.parseLimitSuffix(parent) != null) {
                continue;
            }
            List<String> pair = deriveFloorTopLimitVariableNames(parent, mk);
            if (pair.size() < 2) {
                continue;
            }
            minByParent.putIfAbsent(parent, pair.get(0));
            maxByParent.putIfAbsent(parent, pair.get(1));
        }
    }
}
