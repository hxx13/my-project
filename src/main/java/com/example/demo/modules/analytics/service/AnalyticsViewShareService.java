package com.example.demo.modules.analytics.service;

import com.example.demo.modules.analytics.dto.AnalyticsUserViewDto;
import com.example.demo.modules.analytics.entity.AnalyticsAuditLog;
import com.example.demo.modules.analytics.entity.AnalyticsLlmInsight;
import com.example.demo.modules.analytics.entity.AnalyticsUserView;
import com.example.demo.modules.analytics.entity.AnalyticsViewShare;
import com.example.demo.modules.analytics.mapper.AnalyticsAuditLogMapper;
import com.example.demo.modules.analytics.mapper.AnalyticsLlmInsightMapper;
import com.example.demo.modules.analytics.mapper.AnalyticsUserViewMapper;
import com.example.demo.modules.analytics.mapper.AnalyticsViewShareMapper;
import com.example.demo.modules.invite.InviteCodeHasher;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AnalyticsViewShareService {

    private static final int SNAPSHOT_VERSION_V1 = 1;
    private static final int SNAPSHOT_VERSION_V2 = 2;
    private static final long BUNDLE_SOURCE_VIEW_ID = 0L;
    private static final int MAX_VIEWS_PER_SHARE = 50;
    private static final int MAX_AUDIT_LOGS_PER_SHARE = 500;
    private static final int MAX_PAYLOAD_CHARS = 4_000_000;
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final AnalyticsViewShareMapper shareMapper;
    private final AnalyticsUserViewMapper viewMapper;
    private final AnalyticsAuditLogMapper auditLogMapper;
    private final AnalyticsLlmInsightMapper insightMapper;
    private final AnalyticsUserViewService userViewService;
    private final ObjectMapper objectMapper;
    private final String pepper;

    public AnalyticsViewShareService(
            AnalyticsViewShareMapper shareMapper,
            AnalyticsUserViewMapper viewMapper,
            AnalyticsAuditLogMapper auditLogMapper,
            AnalyticsLlmInsightMapper insightMapper,
            AnalyticsUserViewService userViewService,
            ObjectMapper objectMapper,
            @Value("${app.invite-code-pepper:change-me-in-production}") String pepper) {
        this.shareMapper = shareMapper;
        this.viewMapper = viewMapper;
        this.auditLogMapper = auditLogMapper;
        this.insightMapper = insightMapper;
        this.userViewService = userViewService;
        this.objectMapper = objectMapper;
        this.pepper = pepper;
    }

    /** 兼容旧接口：按 viewId 查所属报表的全局分享码 */
    public Map<String, Object> getActiveShareForView(String ownerUserId, long viewId) {
        AnalyticsUserView view = viewMapper.selectByIdAndUser(viewId, ownerUserId);
        if (view == null) {
            throw new IllegalArgumentException("配置不存在或无权查看");
        }
        return getActiveShareForReport(ownerUserId, view.getReportKey());
    }

    public Map<String, Object> getActiveShareForReport(String ownerUserId, String reportKey) {
        String rk = normalizeReportKey(reportKey);
        List<AnalyticsUserView> views = viewMapper.selectByUserAndReport(ownerUserId, rk);
        AnalyticsViewShare share = shareMapper.selectActiveByReport(ownerUserId, rk);
        if (share == null) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("active", false);
            empty.put("reportKey", rk);
            empty.put("viewCount", views.size());
            return empty;
        }
        Map<String, Object> out = shareToOwnerMap(share);
        out.put("active", true);
        out.put("reportKey", rk);
        out.put("viewCount", countViewsInPayload(share));
        out.put("viewNames", listViewNamesInPayload(share));
        return out;
    }

    /** 兼容旧接口：封箱该配置所属报表下的全部配置 */
    @Transactional
    public Map<String, Object> createShare(
            String ownerUserId, long viewId, String ownerDisplayName, Integer expiresDays, Integer maxImports) {
        AnalyticsUserView view = viewMapper.selectByIdAndUser(viewId, ownerUserId);
        if (view == null) {
            throw new IllegalArgumentException("配置不存在或无权分享");
        }
        return createShareForReport(ownerUserId, view.getReportKey(), ownerDisplayName, expiresDays, maxImports);
    }

    @Transactional
    public Map<String, Object> createShareForReport(
            String ownerUserId, String reportKey, String ownerDisplayName, Integer expiresDays, Integer maxImports) {
        String rk = normalizeReportKey(reportKey);
        List<AnalyticsUserView> views = viewMapper.selectByUserAndReport(ownerUserId, rk);
        if (views.isEmpty()) {
            throw new IllegalArgumentException("暂无统计配置可分享，请先保存至少一条配置");
        }
        if (views.size() > MAX_VIEWS_PER_SHARE) {
            throw new IllegalArgumentException("配置数量过多（超过 " + MAX_VIEWS_PER_SHARE + " 条），请精简后再分享");
        }

        shareMapper.revokeActiveByReport(ownerUserId, rk);

        int logBudget = MAX_AUDIT_LOGS_PER_SHARE;
        List<Map<String, Object>> viewBundles = new ArrayList<>();
        int totalLogs = 0;
        int totalInsights = 0;

        for (AnalyticsUserView view : views) {
            if (logBudget <= 0) {
                throw new IllegalArgumentException(
                        "清算记录合计超过 " + MAX_AUDIT_LOGS_PER_SHARE + " 条，请减少期次或配置数量后再分享");
            }
            Map<String, Object> bundle = buildViewBundle(ownerUserId, view, logBudget);
            int logCount = ((List<?>) bundle.get("auditLogs")).size();
            int insCount = ((List<?>) bundle.get("insights")).size();
            logBudget -= logCount;
            totalLogs += logCount;
            totalInsights += insCount;
            viewBundles.add(bundle);
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("v", SNAPSHOT_VERSION_V2);
        payload.put("reportKey", rk);
        payload.put("views", viewBundles);

        String payloadJson = serializePayload(payload);
        int days = expiresDays != null ? Math.min(Math.max(expiresDays, 1), 365) : 30;
        int maxImp = maxImports != null ? Math.min(Math.max(maxImports, 1), 100) : 10;
        LocalDateTime expiresAt = LocalDateTime.now().plusDays(days);
        String display = StringUtils.hasText(ownerDisplayName) ? ownerDisplayName.trim() : ownerUserId;

        return insertShareRow(
                ownerUserId,
                BUNDLE_SOURCE_VIEW_ID,
                rk,
                SNAPSHOT_VERSION_V2,
                payloadJson,
                totalLogs,
                totalInsights,
                display,
                expiresAt,
                maxImp,
                views);
    }

    public Map<String, Object> previewShare(String code) {
        AnalyticsViewShare share = resolveActiveShare(code);
        Map<String, Object> payload = readPayload(share.getPayloadJson());
        int version = payloadVersion(payload);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("reportKey", payload.get("reportKey"));
        out.put("ownerDisplayName", share.getOwnerDisplayName());
        out.put("auditLogCount", share.getAuditLogCount());
        out.put("insightCount", share.getInsightCount());
        out.put("expiresAt", share.getExpiresAt() != null ? share.getExpiresAt().toString() : null);
        out.put("importsRemaining", Math.max(0, share.getMaxImports() - share.getImportCount()));
        if (version == SNAPSHOT_VERSION_V2) {
            List<String> names = listViewNamesFromPayload(payload);
            out.put("viewCount", names.size());
            out.put("viewNames", names);
            out.put("viewName", names.isEmpty() ? "全部配置" : names.get(0) + (names.size() > 1 ? " 等" + names.size() + " 条" : ""));
            out.put(
                    "snapshotNote",
                    "导入后将复制全部 " + names.size() + " 条配置及其清算快照、AI 解读；之后双方数据独立，不会同步");
        } else {
            Map<String, Object> viewSnap = castMap(payload.get("view"));
            out.put("viewCount", 1);
            out.put("viewName", viewSnap.get("name"));
            out.put("viewNames", List.of(String.valueOf(viewSnap.get("name"))));
            out.put("snapshotNote", "导入后将复制配置、清算快照与 AI 解读；之后双方数据独立，不会同步");
        }
        return out;
    }

    @Transactional
    public Map<String, Object> importShare(String importerUserId, String code, String nameSuffix) {
        AnalyticsViewShare share = resolveActiveShare(code);
        if (share.getImportCount() >= share.getMaxImports()) {
            throw new IllegalArgumentException("该分享码已达最大导入次数");
        }
        if (importerUserId.equals(share.getOwnerUserId())) {
            throw new IllegalArgumentException("不能导入自己的分享码，请使用原配置");
        }

        Map<String, Object> payload = readPayload(share.getPayloadJson());
        int version = payloadVersion(payload);
        String ownerLabel = share.getOwnerDisplayName();
        String suffix = StringUtils.hasText(nameSuffix)
                ? nameSuffix.trim()
                : " (来自 " + ownerLabel + ")";

        List<AnalyticsUserViewDto> importedViews = new ArrayList<>();
        int importedLogs = 0;
        int importedInsights = 0;

        if (version == SNAPSHOT_VERSION_V2) {
            String reportKey = String.valueOf(payload.get("reportKey"));
            List<Map<String, Object>> bundles = castViewBundles(payload.get("views"));
            if (bundles.isEmpty()) {
                throw new IllegalArgumentException("分享包内无配置");
            }
            for (Map<String, Object> bundle : bundles) {
                ImportOneResult one = importOneViewBundle(importerUserId, reportKey, bundle, suffix);
                importedViews.add(one.viewDto());
                importedLogs += one.logs();
                importedInsights += one.insights();
            }
        } else if (version == SNAPSHOT_VERSION_V1) {
            String reportKey = String.valueOf(payload.get("reportKey"));
            Map<String, Object> legacy = new LinkedHashMap<>();
            legacy.put("view", payload.get("view"));
            legacy.put("auditLogs", payload.get("auditLogs"));
            legacy.put("insights", payload.get("insights"));
            ImportOneResult one = importOneViewBundle(importerUserId, reportKey, legacy, suffix);
            importedViews.add(one.viewDto());
            importedLogs = one.logs();
            importedInsights = one.insights();
        } else {
            throw new IllegalArgumentException("不支持的分享包版本");
        }

        shareMapper.incrementImportCount(share.getId());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("views", importedViews);
        out.put("view", importedViews.isEmpty() ? null : importedViews.get(0));
        out.put("viewCount", importedViews.size());
        out.put("importedAuditLogs", importedLogs);
        out.put("importedInsights", importedInsights);
        out.put(
                "message",
                "已导入 " + importedViews.size() + " 条独立配置，后续清算与解读仅在您账号下延续，不与分享者同步");
        return out;
    }

    private record ImportOneResult(AnalyticsUserViewDto viewDto, int logs, int insights) {}

    private ImportOneResult importOneViewBundle(
            String importerUserId, String reportKey, Map<String, Object> bundle, String nameSuffix) {
        Map<String, Object> viewSnap = castMap(bundle.get("view"));
        String baseName = String.valueOf(viewSnap.get("name"));
        String importName = truncateName(baseName + nameSuffix);

        AnalyticsUserView newView = new AnalyticsUserView();
        newView.setUserId(importerUserId);
        newView.setReportKey(reportKey);
        newView.setName(importName);
        newView.setFilterJson(String.valueOf(viewSnap.get("filterJson")));
        newView.setIsDefault(0);
        newView.setIsSubscribed(0);
        Object sort = viewSnap.get("sortOrder");
        newView.setSortOrder(sort instanceof Number n ? n.intValue() : 0);
        viewMapper.insert(newView);
        long newViewId = newView.getId();

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> auditLogs = (List<Map<String, Object>>) bundle.get("auditLogs");
        if (auditLogs == null) {
            auditLogs = List.of();
        }
        Map<String, Long> newAuditIdByPeriod = new LinkedHashMap<>();
        int importedLogs = 0;
        for (Map<String, Object> snap : auditLogs) {
            String periodType = str(snap.get("periodType"));
            String periodLabel = str(snap.get("periodLabel"));
            if (auditLogMapper.countByViewPeriodLabel(newViewId, periodType, periodLabel) > 0) {
                continue;
            }
            AnalyticsAuditLog row = mapToAuditLog(snap, importerUserId, newViewId, reportKey, importName);
            auditLogMapper.insert(row);
            newAuditIdByPeriod.put(periodKey(periodType, periodLabel), row.getId());
            importedLogs++;
        }

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> insights = (List<Map<String, Object>>) bundle.get("insights");
        int importedInsights = 0;
        if (insights != null) {
            for (Map<String, Object> ins : insights) {
                String pk = periodKey(str(ins.get("periodType")), str(ins.get("periodLabel")));
                Long auditId = newAuditIdByPeriod.get(pk);
                if (auditId == null) {
                    continue;
                }
                if (insightMapper.selectByAuditLogId(auditId) != null) {
                    continue;
                }
                AnalyticsLlmInsight row = new AnalyticsLlmInsight();
                row.setAuditLogId(auditId);
                row.setUserId(importerUserId);
                row.setModel(str(ins.get("model")));
                row.setPromptTokens(intOrNull(ins.get("promptTokens")));
                row.setCompletionTokens(intOrNull(ins.get("completionTokens")));
                row.setInsightJson(str(ins.get("insightJson")));
                if (!StringUtils.hasText(row.getInsightJson())) {
                    continue;
                }
                insightMapper.insert(row);
                importedInsights++;
            }
        }

        return new ImportOneResult(userViewService.getForUser(importerUserId, newViewId), importedLogs, importedInsights);
    }

    private Map<String, Object> buildViewBundle(String ownerUserId, AnalyticsUserView view, int logBudget) {
        long viewId = view.getId();
        List<AnalyticsAuditLog> logs = auditLogMapper.selectAllByView(ownerUserId, viewId, logBudget);
        List<AnalyticsLlmInsight> insights = insightMapper.selectByViewId(ownerUserId, viewId);
        Map<Long, String> periodKeyByAuditId = new HashMap<>();
        for (AnalyticsAuditLog log : logs) {
            periodKeyByAuditId.put(log.getId(), periodKey(log.getPeriodType(), log.getPeriodLabel()));
        }

        Map<String, Object> viewSnap = new LinkedHashMap<>();
        viewSnap.put("name", view.getName());
        viewSnap.put("filterJson", view.getFilterJson());
        viewSnap.put("sortOrder", view.getSortOrder() != null ? view.getSortOrder() : 0);

        List<Map<String, Object>> insightSnaps = new ArrayList<>();
        for (AnalyticsLlmInsight ins : insights) {
            String pk = periodKeyByAuditId.get(ins.getAuditLogId());
            if (pk == null) {
                continue;
            }
            Map<String, Object> m = new LinkedHashMap<>();
            String[] parts = pk.split("\\|", 2);
            m.put("periodType", parts[0]);
            m.put("periodLabel", parts.length > 1 ? parts[1] : "");
            m.put("model", ins.getModel() != null ? ins.getModel() : "");
            m.put("promptTokens", ins.getPromptTokens());
            m.put("completionTokens", ins.getCompletionTokens());
            m.put("insightJson", ins.getInsightJson());
            insightSnaps.add(m);
        }

        Map<String, Object> bundle = new LinkedHashMap<>();
        bundle.put("view", viewSnap);
        bundle.put("auditLogs", logs.stream().map(this::auditLogToMap).toList());
        bundle.put("insights", insightSnaps);
        return bundle;
    }

    private Map<String, Object> insertShareRow(
            String ownerUserId,
            long sourceViewId,
            String reportKey,
            int snapshotVersion,
            String payloadJson,
            int auditLogCount,
            int insightCount,
            String ownerDisplayName,
            LocalDateTime expiresAt,
            int maxImports,
            List<AnalyticsUserView> sourceViews) {
        for (int attempt = 0; attempt < 12; attempt++) {
            String plain = generatePlainCode(10);
            String hash = InviteCodeHasher.sha256Hex(pepper, InviteCodeHasher.normalize(plain));
            AnalyticsViewShare row = new AnalyticsViewShare();
            row.setShareCodeHash(hash);
            row.setShareCodePlain(plain);
            row.setOwnerUserId(ownerUserId);
            row.setSourceViewId(sourceViewId);
            row.setReportKey(reportKey);
            row.setSnapshotVersion(snapshotVersion);
            row.setPayloadJson(payloadJson);
            row.setAuditLogCount(auditLogCount);
            row.setInsightCount(insightCount);
            row.setOwnerDisplayName(ownerDisplayName);
            row.setExpiresAt(expiresAt);
            row.setMaxImports(maxImports);
            try {
                shareMapper.insert(row);
                Map<String, Object> out = shareToOwnerMap(row);
                out.put("active", true);
                out.put("plainCode", plain);
                out.put("reportKey", reportKey);
                out.put("viewCount", sourceViews.size());
                out.put("viewNames", sourceViews.stream().map(AnalyticsUserView::getName).toList());
                out.put("regenerated", true);
                return out;
            } catch (DuplicateKeyException ex) {
                // retry code collision
            }
        }
        throw new IllegalStateException("生成分享码失败，请重试");
    }

    private String serializePayload(Map<String, Object> payload) {
        try {
            String json = objectMapper.writeValueAsString(payload);
            if (json.length() > MAX_PAYLOAD_CHARS) {
                throw new IllegalArgumentException("分享内容过大，请减少清算期次或配置数量后再试");
            }
            return json;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("封箱序列化失败: " + e.getMessage());
        }
    }

    private String normalizeReportKey(String reportKey) {
        if (!StringUtils.hasText(reportKey)) {
            throw new IllegalArgumentException("reportKey 不能为空");
        }
        return reportKey.trim();
    }

    private static String truncateName(String name) {
        return name.length() > 128 ? name.substring(0, 128) : name;
    }

    private int payloadVersion(Map<String, Object> payload) {
        return payload.get("v") instanceof Number n ? n.intValue() : 0;
    }

    private int countViewsInPayload(AnalyticsViewShare share) {
        if (share.getSnapshotVersion() != null && share.getSnapshotVersion() == SNAPSHOT_VERSION_V2) {
            return listViewNamesFromPayload(readPayload(share.getPayloadJson())).size();
        }
        return 1;
    }

    private List<String> listViewNamesInPayload(AnalyticsViewShare share) {
        return listViewNamesFromPayload(readPayload(share.getPayloadJson()));
    }

    private List<String> listViewNamesFromPayload(Map<String, Object> payload) {
        if (payloadVersion(payload) == SNAPSHOT_VERSION_V2) {
            List<String> names = new ArrayList<>();
            for (Map<String, Object> bundle : castViewBundles(payload.get("views"))) {
                names.add(String.valueOf(castMap(bundle.get("view")).get("name")));
            }
            return names;
        }
        return List.of(String.valueOf(castMap(payload.get("view")).get("name")));
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> castViewBundles(Object viewsObj) {
        if (viewsObj instanceof List<?> list) {
            List<Map<String, Object>> out = new ArrayList<>();
            for (Object item : list) {
                if (item instanceof Map<?, ?> m) {
                    out.add((Map<String, Object>) m);
                }
            }
            return out;
        }
        return List.of();
    }

    @Transactional
    public void revokeShare(String ownerUserId, long shareId) {
        int n = shareMapper.revokeByIdAndOwner(shareId, ownerUserId);
        if (n == 0) {
            throw new IllegalArgumentException("分享记录不存在");
        }
    }

    private Map<String, Object> shareToOwnerMap(AnalyticsViewShare share) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("shareId", share.getId());
        out.put("plainCode", share.getShareCodePlain());
        out.put("expiresAt", share.getExpiresAt() != null ? share.getExpiresAt().toString() : null);
        out.put("auditLogCount", share.getAuditLogCount() != null ? share.getAuditLogCount() : 0);
        out.put("insightCount", share.getInsightCount() != null ? share.getInsightCount() : 0);
        int max = share.getMaxImports() != null ? share.getMaxImports() : 0;
        int used = share.getImportCount() != null ? share.getImportCount() : 0;
        out.put("maxImports", max);
        out.put("importsRemaining", Math.max(0, max - used));
        out.put("importCount", used);
        return out;
    }

    private AnalyticsViewShare resolveActiveShare(String code) {
        if (!StringUtils.hasText(code)) {
            throw new IllegalArgumentException("请输入分享码");
        }
        String hash = InviteCodeHasher.sha256Hex(pepper, InviteCodeHasher.normalize(code));
        AnalyticsViewShare share = shareMapper.selectByCodeHash(hash);
        if (share == null) {
            throw new IllegalArgumentException("分享码无效");
        }
        if (share.getRevoked() != null && share.getRevoked() == 1) {
            throw new IllegalArgumentException("分享码已撤销");
        }
        if (share.getExpiresAt() != null && share.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new IllegalArgumentException("分享码已过期");
        }
        return share;
    }

    private Map<String, Object> readPayload(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            throw new IllegalStateException("分享包损坏: " + e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> castMap(Object o) {
        if (o instanceof Map<?, ?> m) {
            return (Map<String, Object>) m;
        }
        return Map.of();
    }

    private Map<String, Object> auditLogToMap(AnalyticsAuditLog log) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("periodType", log.getPeriodType());
        m.put("periodLabel", log.getPeriodLabel());
        m.put("viewName", log.getViewName());
        m.put("currentStart", log.getCurrentStart() != null ? log.getCurrentStart().toString() : null);
        m.put("currentEnd", log.getCurrentEnd() != null ? log.getCurrentEnd().toString() : null);
        m.put("previousStart", log.getPreviousStart() != null ? log.getPreviousStart().toString() : null);
        m.put("previousEnd", log.getPreviousEnd() != null ? log.getPreviousEnd().toString() : null);
        m.put("currentRounds", log.getCurrentRounds());
        m.put("previousRounds", log.getPreviousRounds());
        m.put("currentUsers", log.getCurrentUsers());
        m.put("previousUsers", log.getPreviousUsers());
        m.put("currentGroups", log.getCurrentGroups());
        m.put("previousGroups", log.getPreviousGroups());
        m.put("deltaRounds", log.getDeltaRounds());
        m.put("deltaPct", log.getDeltaPct());
        m.put("topGroupsJson", log.getTopGroupsJson());
        return m;
    }

    private AnalyticsAuditLog mapToAuditLog(
            Map<String, Object> snap,
            String userId,
            long viewId,
            String reportKey,
            String viewName) {
        AnalyticsAuditLog row = new AnalyticsAuditLog();
        row.setUserId(userId);
        row.setViewId(viewId);
        row.setReportKey(reportKey);
        row.setViewName(viewName);
        row.setPeriodType(str(snap.get("periodType")));
        row.setPeriodLabel(str(snap.get("periodLabel")));
        row.setCurrentStart(parseDateTime(str(snap.get("currentStart"))));
        row.setCurrentEnd(parseDateTime(str(snap.get("currentEnd"))));
        row.setPreviousStart(parseDateTime(str(snap.get("previousStart"))));
        row.setPreviousEnd(parseDateTime(str(snap.get("previousEnd"))));
        row.setCurrentRounds(longVal(snap.get("currentRounds")));
        row.setPreviousRounds(longVal(snap.get("previousRounds")));
        row.setCurrentUsers(intVal(snap.get("currentUsers")));
        row.setPreviousUsers(intVal(snap.get("previousUsers")));
        row.setCurrentGroups(intVal(snap.get("currentGroups")));
        row.setPreviousGroups(intVal(snap.get("previousGroups")));
        row.setDeltaRounds(longVal(snap.get("deltaRounds")));
        Object dp = snap.get("deltaPct");
        if (dp != null && StringUtils.hasText(String.valueOf(dp)) && !"null".equals(String.valueOf(dp))) {
            row.setDeltaPct(new java.math.BigDecimal(String.valueOf(dp)));
        }
        row.setTopGroupsJson(str(snap.get("topGroupsJson")));
        return row;
    }

    private static String periodKey(String periodType, String periodLabel) {
        return periodType + "|" + periodLabel;
    }

    private static String generatePlainCode(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return sb.toString();
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    private static long longVal(Object o) {
        if (o instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(str(o));
        } catch (Exception e) {
            return 0L;
        }
    }

    private static int intVal(Object o) {
        if (o instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(str(o));
        } catch (Exception e) {
            return 0;
        }
    }

    private static Integer intOrNull(Object o) {
        if (o == null) {
            return null;
        }
        if (o instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(str(o));
        } catch (Exception e) {
            return null;
        }
    }

    private static LocalDateTime parseDateTime(String s) {
        if (!StringUtils.hasText(s) || "null".equals(s)) {
            return LocalDateTime.now();
        }
        try {
            return LocalDateTime.parse(s.replace(' ', 'T').substring(0, Math.min(19, s.length())));
        } catch (Exception e) {
            try {
                return LocalDateTime.parse(s, java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            } catch (Exception e2) {
                return LocalDateTime.now();
            }
        }
    }
}
