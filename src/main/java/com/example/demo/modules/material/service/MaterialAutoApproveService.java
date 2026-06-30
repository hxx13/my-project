package com.example.demo.modules.material.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.material.entity.MaterialRequest;
import com.example.demo.modules.material.mapper.MaterialRequestMapper;
import com.example.demo.modules.twin.common.util.AutoApproveScheduleMatcher;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class MaterialAutoApproveService {

    private static final Logger log = LoggerFactory.getLogger(MaterialAutoApproveService.class);

    private final JdbcTemplate jdbcTemplate;
    private final MaterialService materialService;
    private final MaterialRequestMapper requestMapper;
    private final UserMapper userMapper;
    private final UserDisplayNameService userDisplayNameService;
    private final ObjectMapper objectMapper;

    public MaterialAutoApproveService(
            JdbcTemplate jdbcTemplate,
            @Lazy MaterialService materialService,
            MaterialRequestMapper requestMapper,
            UserMapper userMapper,
            UserDisplayNameService userDisplayNameService,
            ObjectMapper objectMapper
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.materialService = materialService;
        this.requestMapper = requestMapper;
        this.userMapper = userMapper;
        this.userDisplayNameService = userDisplayNameService;
        this.objectMapper = objectMapper;
    }

    public List<Map<String, Object>> listTrustRules(String ownerUserId) {
        if (!StringUtils.hasText(ownerUserId)) return List.of();
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                SELECT t.*, i.name AS item_name
                FROM material_auto_trust t
                LEFT JOIN material_item i ON i.id = t.item_id
                WHERE t.owner_user_id = ?
                ORDER BY t.updated_at DESC
                """,
                ownerUserId.trim()
        );
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> item = new LinkedHashMap<>(row);
            item.put("subjectDisplayName", userDisplayNameService.resolveDisplayName(str(row.get("subject_user_id"))));
            out.add(item);
        }
        return out;
    }

    public Map<String, Object> saveTrustRule(String ownerUserId, Map<String, Object> body) {
        requireOwner(ownerUserId);
        long itemId = longVal(body.get("itemId"));
        if (itemId <= 0) throw new IllegalArgumentException("必须选择物资 itemId");
        String subjectUserId = str(body.get("subjectUserId"));
        if (!StringUtils.hasText(subjectUserId)) throw new IllegalArgumentException("缺少 subjectUserId");
        String triggerMode = str(body.get("triggerMode"));
        if (!"ON_SUBMIT".equalsIgnoreCase(triggerMode) && !"SCHEDULED".equalsIgnoreCase(triggerMode)) {
            triggerMode = "ON_SUBMIT";
        }
        boolean enabled = !Boolean.FALSE.equals(body.get("enabled"));
        String scheduleCron = str(body.get("scheduleCron"));
        if ("SCHEDULED".equalsIgnoreCase(triggerMode) && !StringUtils.hasText(scheduleCron)) {
            scheduleCron = "0 0 9 * * *";
        }
        scheduleCron = AutoApproveScheduleMatcher.normalizeDailyCron(scheduleCron);
        String note = str(body.get("note"));
        Object idRaw = body.get("id");
        if (idRaw != null && longVal(idRaw) > 0) {
            long id = longVal(idRaw);
            jdbcTemplate.update(
                    """
                    UPDATE material_auto_trust SET
                      subject_user_id=?, item_id=?, enabled=?,
                      trigger_mode=?, schedule_cron=?, note=?, updated_at=NOW()
                    WHERE id=? AND owner_user_id=?
                    """,
                    subjectUserId.trim(), itemId, enabled ? 1 : 0,
                    triggerMode.toUpperCase(), scheduleCron, note, id, ownerUserId.trim()
            );
            return Map.of("id", id);
        }
        jdbcTemplate.update(
                """
                INSERT INTO material_auto_trust (
                  owner_user_id, subject_user_id, item_id, enabled,
                  trigger_mode, schedule_cron, note
                ) VALUES (?,?,?,?,?,?,?)
                """,
                ownerUserId.trim(), subjectUserId.trim(), itemId, enabled ? 1 : 0,
                triggerMode.toUpperCase(), scheduleCron, note
        );
        Long id = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        return Map.of("id", id != null ? id : 0L);
    }

    public void deleteTrustRule(String ownerUserId, long id) {
        jdbcTemplate.update(
                "DELETE FROM material_auto_trust WHERE id=? AND owner_user_id=?",
                id, ownerUserId.trim()
        );
    }

    public List<Map<String, Object>> listBatchRules(String ownerUserId) {
        if (!StringUtils.hasText(ownerUserId)) return List.of();
        return jdbcTemplate.queryForList(
                "SELECT * FROM material_auto_batch WHERE owner_user_id=? ORDER BY updated_at DESC",
                ownerUserId.trim()
        );
    }

    public Map<String, Object> saveBatchRule(String ownerUserId, Map<String, Object> body) {
        requireOwner(ownerUserId);
        List<Long> itemIds = parseLongList(body.get("itemIds"));
        if (itemIds.isEmpty()) throw new IllegalArgumentException("至少选择一个物资");
        String name = str(body.get("name"));
        if (!StringUtils.hasText(name)) name = "批量自动审批";
        boolean enabled = !Boolean.FALSE.equals(body.get("enabled"));
        String scheduleCron = str(body.get("scheduleCron"));
        if (!StringUtils.hasText(scheduleCron)) scheduleCron = "0 0 9 * * *";
        scheduleCron = AutoApproveScheduleMatcher.normalizeDailyCron(scheduleCron);
        int maxPerRun = intVal(body.get("maxPerRun"), 20);
        boolean onlyReviewer = body.get("onlyIfReviewerMatch") == null || Boolean.TRUE.equals(body.get("onlyIfReviewerMatch"));
        String itemIdsJson = writeJson(itemIds);
        Object idRaw = body.get("id");
        if (idRaw != null && longVal(idRaw) > 0) {
            long id = longVal(idRaw);
            jdbcTemplate.update(
                    """
                    UPDATE material_auto_batch SET
                      name=?, item_ids=?, enabled=?, schedule_cron=?,
                      max_per_run=?, only_if_reviewer_match=?, updated_at=NOW()
                    WHERE id=? AND owner_user_id=?
                    """,
                    name, itemIdsJson, enabled ? 1 : 0, scheduleCron,
                    maxPerRun, onlyReviewer ? 1 : 0, id, ownerUserId.trim()
            );
            return Map.of("id", id);
        }
        jdbcTemplate.update(
                """
                INSERT INTO material_auto_batch (
                  owner_user_id, name, item_ids, enabled, schedule_cron,
                  max_per_run, only_if_reviewer_match
                ) VALUES (?,?,?,?,?,?,?)
                """,
                ownerUserId.trim(), name, itemIdsJson, enabled ? 1 : 0, scheduleCron,
                maxPerRun, onlyReviewer ? 1 : 0
        );
        Long id = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        return Map.of("id", id != null ? id : 0L);
    }

    public void deleteBatchRule(String ownerUserId, long id) {
        jdbcTemplate.update(
                "DELETE FROM material_auto_batch WHERE id=? AND owner_user_id=?",
                id, ownerUserId.trim()
        );
    }

    public List<Map<String, Object>> listSuggestions(String ownerUserId) {
        if (!StringUtils.hasText(ownerUserId)) return List.of();
        // 仅显示当前用户可审核的物品的历史统计，防止跨用户数据泄漏
        User currentUser = userMapper.findById(ownerUserId.trim());
        Set<Long> myItemIds = loadReviewerItemIds(currentUser);
        if (myItemIds.isEmpty()) return List.of();

        List<String> placeholders = myItemIds.stream().map(id -> "?").toList();
        List<Object> args = new ArrayList<>(myItemIds);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                SELECT r.user_id AS subjectUserId,
                       l.item_id AS itemId,
                       COUNT(1) AS approvedCount,
                       MAX(COALESCE(r.second_review_time, r.first_review_time, r.updated_at)) AS lastApprovedAt,
                       i.name AS itemName
                FROM material_request r
                JOIN material_request_line l ON l.request_id = r.id
                LEFT JOIN material_item i ON i.id = l.item_id
                WHERE r.deleted = 0
                  AND r.status IN ('APPROVED','FULFILLED','RECEIVED')
                  AND l.item_id IN ("""
                + String.join(",", placeholders) +
                """
                )
                  AND l.id = (
                    SELECT MIN(l2.id) FROM material_request_line l2 WHERE l2.request_id = r.id
                  )
                GROUP BY r.user_id, l.item_id, i.name
                HAVING COUNT(1) >= 1
                ORDER BY approvedCount DESC, lastApprovedAt DESC
                LIMIT 100
                """,
                args.toArray()
        );
        Set<String> trustedKeys = loadTrustedKeys(ownerUserId.trim());
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> item = new LinkedHashMap<>(row);
            item.put("subjectDisplayName", userDisplayNameService.resolveDisplayName(str(row.get("subjectUserId"))));
            String key = trustKey(str(row.get("subjectUserId")), longVal(row.get("itemId")));
            item.put("alreadyTrusted", trustedKeys.contains(key));
            out.add(item);
        }
        return out;
    }

    /**
     * 可选申请人（待审 + 历史通过），供前端按姓名锁定 subjectUserId + itemId，禁止手输 ID。
     */
    public List<Map<String, Object>> listCandidates(String ownerUserId) {
        if (!StringUtils.hasText(ownerUserId)) return List.of();
        User reviewer = userMapper.findById(ownerUserId.trim());
        if (reviewer == null) return List.of();

        Map<String, Map<String, Object>> merged = new LinkedHashMap<>();

        List<MaterialRequest> pending = requestMapper.selectPendingByReviewer(ownerUserId.trim());
        for (MaterialRequest req : pending) {
            if (req == null || !StringUtils.hasText(req.getId())) continue;
            if (!materialService.canUserReview(reviewer, req.getId())) continue;
            Long itemId = materialService.primaryItemIdForRequest(req.getId());
            if (itemId == null || itemId <= 0) continue;
            String subjectId = req.getUserId();
            String key = subjectId + "|" + itemId;
            Map<String, Object> row = merged.computeIfAbsent(key, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("subjectUserId", subjectId);
                m.put("subjectDisplayName", StringUtils.hasText(req.getApplicantName())
                        ? req.getApplicantName().trim()
                        : userDisplayNameService.resolveDisplayName(subjectId));
                m.put("itemId", itemId);
                m.put("pendingCount", 0);
                m.put("approvedCount", 0);
                return m;
            });
            row.put("pendingCount", intVal(row.get("pendingCount"), 0) + 1);
        }

        for (Map<String, Object> sug : listSuggestions(ownerUserId)) {
            String subjectId = str(sug.get("subjectUserId"));
            long itemId = longVal(sug.get("itemId"));
            if (!StringUtils.hasText(subjectId) || itemId <= 0) continue;
            String key = subjectId + "|" + itemId;
            Map<String, Object> row = merged.computeIfAbsent(key, k -> {
                Map<String, Object> m = new LinkedHashMap<>(sug);
                m.putIfAbsent("pendingCount", 0);
                m.putIfAbsent("approvedCount", 0);
                return m;
            });
            row.put("approvedCount", intVal(sug.get("approvedCount"), 0));
            if (sug.get("itemName") != null) row.put("itemName", sug.get("itemName"));
            if (sug.get("alreadyTrusted") != null) row.put("alreadyTrusted", sug.get("alreadyTrusted"));
            row.put("subjectDisplayName", sug.get("subjectDisplayName"));
        }

        for (Map<String, Object> row : merged.values()) {
            if (row.get("itemName") == null) {
                Long itemId = longVal(row.get("itemId"));
                if (itemId > 0) {
                    try {
                        String name = jdbcTemplate.queryForObject(
                                "SELECT name FROM material_item WHERE id=?",
                                String.class,
                                itemId
                        );
                        row.put("itemName", name);
                    } catch (Exception ignored) {
                        row.put("itemName", "物资 #" + itemId);
                    }
                }
            }
        }

        return merged.values().stream()
                .sorted((a, b) -> {
                    int pa = intVal(a.get("pendingCount"), 0);
                    int pb = intVal(b.get("pendingCount"), 0);
                    if (pa != pb) return Integer.compare(pb, pa);
                    return Integer.compare(intVal(b.get("approvedCount"), 0), intVal(a.get("approvedCount"), 0));
                })
                .limit(200)
                .toList();
    }

    public void tryTrustOnSubmit(String requestId) {
        MaterialRequest req = requestMapper.selectById(requestId);
        if (req == null || !"PENDING".equals(req.getStatus())) return;
        tryApproveByTrustRules(req, "ON_SUBMIT", new HashSet<>());
    }

    /** Cron 定时任务入口：执行全部用户的启用规则 */
    public Map<String, Object> runScheduledJob() {
        return runScheduledJobInternal(null, false);
    }

    /** 用户手动触发"立即执行"：仅执行该用户自己的规则，忽略 schedule 时刻限制 */
    public Map<String, Object> runScheduledJobForOwner(String ownerUserId) {
        if (!StringUtils.hasText(ownerUserId)) return Map.of("approved", 0, "skipped", 0, "failed", 0);
        return runScheduledJobInternal(ownerUserId.trim(), true);
    }

    private Map<String, Object> runScheduledJobInternal(String ownerUserId, boolean forceRun) {
        Set<String> handled = new HashSet<>();
        int approved = 0;
        int skipped = 0;
        int failed = 0;
        LocalDateTime now = LocalDateTime.now();

        List<Map<String, Object>> trustRules;
        if (StringUtils.hasText(ownerUserId)) {
            trustRules = jdbcTemplate.queryForList(
                    "SELECT * FROM material_auto_trust WHERE enabled=1 AND trigger_mode='SCHEDULED' AND owner_user_id=?",
                    ownerUserId
            );
        } else {
            trustRules = jdbcTemplate.queryForList(
                    "SELECT * FROM material_auto_trust WHERE enabled=1 AND trigger_mode='SCHEDULED'"
            );
        }
        for (Map<String, Object> rule : trustRules) {
            if (!forceRun && !AutoApproveScheduleMatcher.matchesNow(str(rule.get("schedule_cron")), now)) {
                continue;
            }
            for (MaterialRequest req : listPendingForTrustRule(rule)) {
                String reqId = req.getId();
                if (!handled.add(reqId)) continue;
                String result = approveRequestStages(reqId, str(rule.get("owner_user_id")), "trust", longVal(rule.get("id")));
                if ("APPROVED".equals(result)) approved++;
                else if ("FAILED".equals(result)) failed++;
                else skipped++;
            }
        }

        List<Map<String, Object>> batchRules;
        if (StringUtils.hasText(ownerUserId)) {
            batchRules = jdbcTemplate.queryForList(
                    "SELECT * FROM material_auto_batch WHERE enabled=1 AND owner_user_id=?",
                    ownerUserId
            );
        } else {
            batchRules = jdbcTemplate.queryForList(
                    "SELECT * FROM material_auto_batch WHERE enabled=1"
            );
        }
        for (Map<String, Object> rule : batchRules) {
            if (!forceRun && !AutoApproveScheduleMatcher.matchesNow(str(rule.get("schedule_cron")), now)) {
                continue;
            }
            int max = intVal(rule.get("max_per_run"), 20);
            for (MaterialRequest req : listPendingForBatchRule(rule, max, handled)) {
                String reqId = req.getId();
                if (!handled.add(reqId)) continue;
                String owner = str(rule.get("owner_user_id"));
                String result = approveRequestStages(reqId, owner, "batch", longVal(rule.get("id")));
                if ("APPROVED".equals(result)) approved++;
                else if ("FAILED".equals(result)) failed++;
                else skipped++;
            }
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("approved", approved);
        summary.put("skipped", skipped);
        summary.put("failed", failed);
        log.info("[material-auto] job done owner={} approved={} skipped={} failed={}",
                StringUtils.hasText(ownerUserId) ? ownerUserId : "*", approved, skipped, failed);
        return summary;
    }

    private void tryApproveByTrustRules(MaterialRequest req, String triggerMode, Set<String> handled) {
        String reqId = req.getId();
        if (handled.contains(reqId)) return;
        Long itemId = materialService.primaryItemIdForRequest(reqId);
        if (itemId == null || itemId <= 0) return;
        List<Map<String, Object>> rules = jdbcTemplate.queryForList(
                """
                SELECT * FROM material_auto_trust
                WHERE enabled=1 AND trigger_mode=?
                  AND subject_user_id=? AND item_id=?
                """,
                triggerMode.toUpperCase(),
                req.getUserId(),
                itemId
        );
        for (Map<String, Object> rule : rules) {
            String owner = str(rule.get("owner_user_id"));
            if (!materialService.canUserReview(userMapper.findById(owner), reqId)) continue;
            approveRequestStages(reqId, owner, "trust", longVal(rule.get("id")));
            handled.add(reqId);
            return;
        }
    }

    private List<MaterialRequest> listPendingForTrustRule(Map<String, Object> rule) {
        String owner = str(rule.get("owner_user_id"));
        User reviewer = userMapper.findById(owner);
        if (reviewer == null) return List.of();
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                SELECT r.id FROM material_request r
                WHERE r.deleted=0 AND r.status IN ('PENDING','FIRST_OK')
                  AND r.user_id=? AND EXISTS (
                    SELECT 1 FROM material_request_line l
                    WHERE l.request_id = r.id AND l.item_id = ?
                    AND l.id = (SELECT MIN(l2.id) FROM material_request_line l2 WHERE l2.request_id = r.id)
                  )
                ORDER BY r.created_at ASC LIMIT 50
                """,
                str(rule.get("subject_user_id")),
                longVal(rule.get("item_id"))
        );
        List<MaterialRequest> out = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            String id = str(row.get("id"));
            if (materialService.canUserReview(reviewer, id)) {
                MaterialRequest req = requestMapper.selectById(id);
                if (req != null) out.add(req);
            }
        }
        return out;
    }

    private List<MaterialRequest> listPendingForBatchRule(Map<String, Object> rule, int max, Set<String> exclude) {
        String owner = str(rule.get("owner_user_id"));
        User reviewer = userMapper.findById(owner);
        List<Long> itemIds = parseLongList(readJson(str(rule.get("item_ids"))));
        if (itemIds.isEmpty()) return List.of();
        boolean onlyReviewer = intVal(rule.get("only_if_reviewer_match"), 1) == 1;
        StringBuilder sql = new StringBuilder(
                """
                SELECT r.id FROM material_request r
                WHERE r.deleted=0 AND r.status IN ('PENDING','FIRST_OK')
                  AND EXISTS (
                    SELECT 1 FROM material_request_line l
                    WHERE l.request_id = r.id AND l.item_id IN (
                """
        );
        sql.append(String.join(",", itemIds.stream().map(x -> "?").toList()));
        sql.append("""
                    ) AND l.id = (SELECT MIN(l2.id) FROM material_request_line l2 WHERE l2.request_id = r.id)
                  )
                ORDER BY r.created_at ASC LIMIT ?
                """);
        List<Object> args = new ArrayList<>(itemIds);
        args.add(max * 2);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql.toString(), args.toArray());
        List<MaterialRequest> out = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            String id = str(row.get("id"));
            if (exclude.contains(id)) continue;
            if (onlyReviewer && (reviewer == null || !materialService.canUserReview(reviewer, id))) continue;
            MaterialRequest req = requestMapper.selectById(id);
            if (req != null) {
                out.add(req);
                if (out.size() >= max) break;
            }
        }
        return out;
    }

    /** 双审流程最多连续 approve 两次（初审+复审），直至无权限或已出库 */
    private String approveRequestStages(String requestId, String reviewerUserId, String ruleType, long ruleId) {
        User reviewer = userMapper.findById(reviewerUserId);
        if (reviewer == null) {
            log(ruleType, ruleId, requestId, "FAILED", "审核人不存在");
            return "FAILED";
        }
        boolean progressed = false;
        try {
            for (int i = 0; i < 2; i++) {
                MaterialRequest req = requestMapper.selectById(requestId);
                if (req == null) break;
                if (!"PENDING".equals(req.getStatus()) && !"FIRST_OK".equals(req.getStatus())) break;
                if (!materialService.canUserReview(reviewer, requestId)) break;
                Result<?> res = materialService.approve(reviewer, requestId);
                if (!Boolean.TRUE.equals(res.getSuccess())) {
                    log(ruleType, ruleId, requestId, "FAILED", res.getMessage());
                    return "FAILED";
                }
                progressed = true;
            }
            if (progressed) {
                log(ruleType, ruleId, requestId, "APPROVED", null);
                return "APPROVED";
            }
            log(ruleType, ruleId, requestId, "SKIPPED", "无待审阶段或无权");
            return "SKIPPED";
        } catch (Exception e) {
            log(ruleType, ruleId, requestId, "FAILED", e.getMessage());
            return "FAILED";
        }
    }

    private void log(String ruleType, long ruleId, String requestId, String result, String message) {
        try {
            jdbcTemplate.update(
                    """
                    INSERT INTO material_auto_approve_log (rule_type, rule_id, request_id, result, message)
                    VALUES (?,?,?,?,?)
                    """,
                    ruleType, ruleId > 0 ? ruleId : null, requestId, result,
                    message != null && message.length() > 250 ? message.substring(0, 250) : message
            );
        } catch (Exception e) {
            log.warn("[material-auto] log insert failed: {}", e.getMessage());
        }
    }

    private Set<String> loadTrustedKeys(String ownerUserId) {
        Set<String> keys = new HashSet<>();
        List<Map<String, Object>> rules = jdbcTemplate.queryForList(
                "SELECT subject_user_id, item_id FROM material_auto_trust WHERE owner_user_id=? AND enabled=1",
                ownerUserId
        );
        for (Map<String, Object> r : rules) {
            keys.add(trustKey(str(r.get("subject_user_id")), longVal(r.get("item_id"))));
        }
        return keys;
    }

    /** 加载当前用户担任审核人的所有物品 ID，用于 suggestion 数据隔离 */
    private Set<Long> loadReviewerItemIds(User user) {
        if (user == null) return Set.of();
        Set<Long> ids = new HashSet<>();
        String userId = StringUtils.hasText(user.getId()) ? user.getId().trim() : "";
        String username = StringUtils.hasText(user.getUsername()) ? user.getUsername().trim() : "";

        List<Map<String, Object>> items = jdbcTemplate.queryForList(
                "SELECT id, reviewer_ids, second_reviewer_ids FROM material_item"
        );
        for (Map<String, Object> item : items) {
            long itemId = longVal(item.get("id"));
            if (itemId <= 0) continue;
            if (listContainsUser(str(item.get("reviewer_ids")), userId, username)
                    || listContainsUser(str(item.get("second_reviewer_ids")), userId, username)) {
                ids.add(itemId);
            }
        }
        return ids;
    }

    private boolean listContainsUser(String jsonArray, String userId, String username) {
        if (!StringUtils.hasText(jsonArray)) return false;
        try {
            List<String> list = objectMapper.readValue(jsonArray, new TypeReference<>() {});
            if (list == null) return false;
            for (String s : list) {
                String v = s != null ? s.trim() : "";
                if (v.isEmpty()) continue;
                if (v.equals(userId) || v.equals(username)) return true;
            }
        } catch (Exception ignored) {
            // JSON 解析失败时退化为简单包含匹配（兼容非标准格式）
            if (StringUtils.hasText(userId) && jsonArray.contains(userId)) return true;
            if (StringUtils.hasText(username) && jsonArray.contains(username)) return true;
        }
        return false;
    }

    private static String trustKey(String subjectUserId, long itemId) {
        return subjectUserId + "|" + itemId;
    }

    private static void requireOwner(String ownerUserId) {
        if (!StringUtils.hasText(ownerUserId)) throw new IllegalArgumentException("缺少 owner");
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o).trim();
    }

    private static long longVal(Object o) {
        if (o == null) return 0L;
        if (o instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(String.valueOf(o).trim());
        } catch (Exception e) {
            return 0L;
        }
    }

    private static int intVal(Object o, int def) {
        if (o == null) return def;
        if (o instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(o).trim());
        } catch (Exception e) {
            return def;
        }
    }

    private List<Long> parseLongList(Object raw) {
        if (raw == null) return List.of();
        if (raw instanceof List<?> list) {
            List<Long> out = new ArrayList<>();
            for (Object o : list) {
                long v = longVal(o);
                if (v > 0) out.add(v);
            }
            return out;
        }
        return parseLongList(readJson(str(raw)));
    }

    private Object readJson(String json) {
        if (!StringUtils.hasText(json)) return null;
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            return null;
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            return "[]";
        }
    }
}
