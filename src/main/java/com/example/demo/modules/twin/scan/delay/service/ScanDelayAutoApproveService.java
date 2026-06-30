package com.example.demo.modules.twin.scan.delay.service;

import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.twin.common.util.AutoApproveScheduleMatcher;
import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayRequest;
import com.example.demo.modules.twin.scan.delay.mapper.TwinScanDelayRequestMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class ScanDelayAutoApproveService {

    private static final Logger log = LoggerFactory.getLogger(ScanDelayAutoApproveService.class);

    private final JdbcTemplate jdbcTemplate;
    private final ScanDelayRequestService requestService;
    private final TwinScanDelayRequestMapper requestMapper;
    private final ObjectMapper objectMapper;
    private final UserDisplayNameService userDisplayNameService;

    public ScanDelayAutoApproveService(
            JdbcTemplate jdbcTemplate,
            ScanDelayRequestService requestService,
            TwinScanDelayRequestMapper requestMapper,
            ObjectMapper objectMapper,
            UserDisplayNameService userDisplayNameService
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.requestService = requestService;
        this.requestMapper = requestMapper;
        this.objectMapper = objectMapper;
        this.userDisplayNameService = userDisplayNameService;
    }

    public List<Map<String, Object>> listTrustRules(String ownerUserId) {
        if (!StringUtils.hasText(ownerUserId)) return List.of();
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                SELECT t.*, o.option_label, o.room_name AS option_room_name
                FROM twin_scan_delay_auto_trust t
                LEFT JOIN twin_scan_delay_option o ON o.id = t.option_id
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
        long optionId = longVal(body.get("optionId"));
        if (optionId <= 0) throw new IllegalArgumentException("必须选择延迟选项 optionId");
        String subjectUserId = str(body.get("subjectUserId"));
        if (!StringUtils.hasText(subjectUserId)) throw new IllegalArgumentException("缺少 subjectUserId");
        String roomId = emptyToNull(str(body.get("roomId")));
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
                    UPDATE twin_scan_delay_auto_trust SET
                      subject_user_id=?, option_id=?, room_id=?, enabled=?,
                      trigger_mode=?, schedule_cron=?, note=?, updated_at=NOW()
                    WHERE id=? AND owner_user_id=?
                    """,
                    subjectUserId.trim(), optionId, roomId, enabled ? 1 : 0,
                    triggerMode.toUpperCase(), scheduleCron, note, id, ownerUserId.trim()
            );
            return Map.of("id", id);
        }
        jdbcTemplate.update(
                """
                INSERT INTO twin_scan_delay_auto_trust (
                  owner_user_id, subject_user_id, option_id, room_id, enabled,
                  trigger_mode, schedule_cron, note
                ) VALUES (?,?,?,?,?,?,?,?)
                """,
                ownerUserId.trim(), subjectUserId.trim(), optionId, roomId, enabled ? 1 : 0,
                triggerMode.toUpperCase(), scheduleCron, note
        );
        Long id = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        return Map.of("id", id != null ? id : 0L);
    }

    public void deleteTrustRule(String ownerUserId, long id) {
        jdbcTemplate.update(
                "DELETE FROM twin_scan_delay_auto_trust WHERE id=? AND owner_user_id=?",
                id, ownerUserId.trim()
        );
    }

    public List<Map<String, Object>> listBatchRules(String ownerUserId) {
        if (!StringUtils.hasText(ownerUserId)) return List.of();
        return jdbcTemplate.queryForList(
                "SELECT * FROM twin_scan_delay_auto_batch WHERE owner_user_id=? ORDER BY updated_at DESC",
                ownerUserId.trim()
        );
    }

    public Map<String, Object> saveBatchRule(String ownerUserId, Map<String, Object> body) {
        requireOwner(ownerUserId);
        List<Long> optionIds = parseLongList(body.get("optionIds"));
        if (optionIds.isEmpty()) throw new IllegalArgumentException("至少选择一个延迟选项");
        List<String> roomIds = parseStringList(body.get("roomIds"));
        String name = str(body.get("name"));
        if (!StringUtils.hasText(name)) name = "批量自动审批";
        boolean enabled = !Boolean.FALSE.equals(body.get("enabled"));
        String scheduleCron = str(body.get("scheduleCron"));
        if (!StringUtils.hasText(scheduleCron)) scheduleCron = "0 0 9 * * *";
        scheduleCron = AutoApproveScheduleMatcher.normalizeDailyCron(scheduleCron);
        int maxPerRun = intVal(body.get("maxPerRun"), 20);
        boolean onlyReviewer = body.get("onlyIfReviewerMatch") == null || Boolean.TRUE.equals(body.get("onlyIfReviewerMatch"));
        String optionIdsJson = writeJson(optionIds);
        String roomIdsJson = roomIds.isEmpty() ? null : writeJson(roomIds);
        Object idRaw = body.get("id");
        if (idRaw != null && longVal(idRaw) > 0) {
            long id = longVal(idRaw);
            jdbcTemplate.update(
                    """
                    UPDATE twin_scan_delay_auto_batch SET
                      name=?, option_ids=?, room_ids=?, enabled=?, schedule_cron=?,
                      max_per_run=?, only_if_reviewer_match=?, updated_at=NOW()
                    WHERE id=? AND owner_user_id=?
                    """,
                    name, optionIdsJson, roomIdsJson, enabled ? 1 : 0, scheduleCron,
                    maxPerRun, onlyReviewer ? 1 : 0, id, ownerUserId.trim()
            );
            return Map.of("id", id);
        }
        jdbcTemplate.update(
                """
                INSERT INTO twin_scan_delay_auto_batch (
                  owner_user_id, name, option_ids, room_ids, enabled, schedule_cron,
                  max_per_run, only_if_reviewer_match
                ) VALUES (?,?,?,?,?,?,?,?)
                """,
                ownerUserId.trim(), name, optionIdsJson, roomIdsJson, enabled ? 1 : 0, scheduleCron,
                maxPerRun, onlyReviewer ? 1 : 0
        );
        Long id = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        return Map.of("id", id != null ? id : 0L);
    }

    public void deleteBatchRule(String ownerUserId, long id) {
        jdbcTemplate.update(
                "DELETE FROM twin_scan_delay_auto_batch WHERE id=? AND owner_user_id=?",
                id, ownerUserId.trim()
        );
    }

    /** 历史通过统计，仅建议，不自动写规则 */
    public List<Map<String, Object>> listSuggestions(String ownerUserId) {
        if (!StringUtils.hasText(ownerUserId)) return List.of();
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                SELECT r.subject_user_id AS subjectUserId,
                       r.option_id AS optionId,
                       r.room_id AS roomId,
                       COUNT(1) AS approvedCount,
                       MAX(r.reviewed_at) AS lastApprovedAt,
                       o.option_label AS optionLabel,
                       o.room_name AS roomName
                FROM twin_scan_delay_request r
                LEFT JOIN twin_scan_delay_option o ON o.id = r.option_id
                WHERE r.status = 'APPROVED' AND r.reviewer_user_id = ?
                GROUP BY r.subject_user_id, r.option_id, r.room_id, o.option_label, o.room_name
                HAVING COUNT(1) >= 1
                ORDER BY approvedCount DESC, lastApprovedAt DESC
                LIMIT 100
                """,
                ownerUserId.trim()
        );
        Set<String> trustedKeys = loadTrustedKeys(ownerUserId.trim());
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> item = new LinkedHashMap<>(row);
            String key = trustKey(
                    str(row.get("subjectUserId")),
                    longVal(row.get("optionId")),
                    str(row.get("roomId"))
            );
            item.put("alreadyTrusted", trustedKeys.contains(key));
            item.put("subjectDisplayName", userDisplayNameService.resolveDisplayName(str(row.get("subjectUserId"))));
            out.add(item);
        }
        return out;
    }

    /** 待审 + 历史通过，供前端按姓名锁定申请人 */
    public List<Map<String, Object>> listCandidates(String ownerUserId) {
        if (!StringUtils.hasText(ownerUserId)) return List.of();
        Map<String, Map<String, Object>> merged = new LinkedHashMap<>();

        for (Map<String, Object> p : requestService.listPendingEnriched(ownerUserId.trim())) {
            String subjectId = str(p.get("subjectUserId"));
            long optionId = longVal(p.get("optionId"));
            if (!StringUtils.hasText(subjectId) || optionId <= 0) continue;
            String roomId = str(p.get("roomId"));
            String key = trustKey(subjectId, optionId, roomId);
            Map<String, Object> row = merged.computeIfAbsent(key, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("subjectUserId", subjectId);
                m.put("optionId", optionId);
                m.put("roomId", StringUtils.hasText(roomId) ? roomId : null);
                m.put("optionLabel", p.get("optionLabel"));
                m.put("roomName", p.get("roomName"));
                m.put("subjectDisplayName", userDisplayNameService.resolveDisplayName(subjectId));
                m.put("pendingCount", 0);
                m.put("approvedCount", 0);
                return m;
            });
            row.put("pendingCount", intVal(row.get("pendingCount"), 0) + 1);
        }

        for (Map<String, Object> sug : listSuggestions(ownerUserId)) {
            String subjectId = str(sug.get("subjectUserId"));
            long optionId = longVal(sug.get("optionId"));
            if (!StringUtils.hasText(subjectId) || optionId <= 0) continue;
            String roomId = str(sug.get("roomId"));
            String key = trustKey(subjectId, optionId, roomId);
            Map<String, Object> row = merged.computeIfAbsent(key, k -> {
                Map<String, Object> m = new LinkedHashMap<>(sug);
                m.putIfAbsent("pendingCount", 0);
                m.putIfAbsent("approvedCount", 0);
                return m;
            });
            row.put("approvedCount", intVal(sug.get("approvedCount"), 0));
            row.put("subjectDisplayName", sug.get("subjectDisplayName"));
            if (sug.get("alreadyTrusted") != null) row.put("alreadyTrusted", sug.get("alreadyTrusted"));
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

    public void tryTrustOnSubmit(long requestId) {
        Map<String, Object> req = jdbcTemplate.queryForMap(
                "SELECT * FROM twin_scan_delay_request WHERE id=? AND status='PENDING'",
                requestId
        );
        tryApproveByTrustRules(req, "ON_SUBMIT", Set.of());
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
        Set<Long> handled = new HashSet<>();
        int approved = 0;
        int skipped = 0;
        int failed = 0;
        LocalDateTime now = LocalDateTime.now();

        List<Map<String, Object>> trustRules;
        if (StringUtils.hasText(ownerUserId)) {
            trustRules = jdbcTemplate.queryForList(
                    "SELECT * FROM twin_scan_delay_auto_trust WHERE enabled=1 AND trigger_mode='SCHEDULED' AND owner_user_id=?",
                    ownerUserId
            );
        } else {
            trustRules = jdbcTemplate.queryForList(
                    "SELECT * FROM twin_scan_delay_auto_trust WHERE enabled=1 AND trigger_mode='SCHEDULED'"
            );
        }
        for (Map<String, Object> rule : trustRules) {
            if (!forceRun && !AutoApproveScheduleMatcher.matchesNow(str(rule.get("schedule_cron")), now)) {
                continue;
            }
            List<Map<String, Object>> pending = listPendingForTrustRule(rule);
            for (Map<String, Object> req : pending) {
                long reqId = longVal(req.get("id"));
                if (!handled.add(reqId)) continue;
                String owner = str(rule.get("owner_user_id"));
                String result = approveRequest(reqId, owner, "trust", longVal(rule.get("id")));
                if ("APPROVED".equals(result)) approved++;
                else if ("FAILED".equals(result)) failed++;
                else skipped++;
            }
        }

        List<Map<String, Object>> batchRules;
        if (StringUtils.hasText(ownerUserId)) {
            batchRules = jdbcTemplate.queryForList(
                    "SELECT * FROM twin_scan_delay_auto_batch WHERE enabled=1 AND owner_user_id=?",
                    ownerUserId
            );
        } else {
            batchRules = jdbcTemplate.queryForList(
                    "SELECT * FROM twin_scan_delay_auto_batch WHERE enabled=1"
            );
        }
        for (Map<String, Object> rule : batchRules) {
            if (!forceRun && !AutoApproveScheduleMatcher.matchesNow(str(rule.get("schedule_cron")), now)) {
                continue;
            }
            int max = intVal(rule.get("max_per_run"), 20);
            List<Map<String, Object>> pending = listPendingForBatchRule(rule, max, handled);
            for (Map<String, Object> req : pending) {
                long reqId = longVal(req.get("id"));
                if (!handled.add(reqId)) continue;
                String owner = str(rule.get("owner_user_id"));
                String result = approveRequest(reqId, owner, "batch", longVal(rule.get("id")));
                if ("APPROVED".equals(result)) approved++;
                else if ("FAILED".equals(result)) failed++;
                else skipped++;
            }
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("approved", approved);
        summary.put("skipped", skipped);
        summary.put("failed", failed);
        log.info("[scan-delay-auto] job done owner={} approved={} skipped={} failed={}",
                StringUtils.hasText(ownerUserId) ? ownerUserId : "*", approved, skipped, failed);
        return summary;
    }

    private void tryApproveByTrustRules(Map<String, Object> req, String triggerMode, Set<Long> handled) {
        long reqId = longVal(req.get("id"));
        if (handled.contains(reqId)) return;
        TwinScanDelayRequest entity = requestMapper.findById(reqId);
        if (entity == null || !"PENDING".equalsIgnoreCase(entity.getStatus())) return;

        List<Map<String, Object>> rules = jdbcTemplate.queryForList(
                """
                SELECT * FROM twin_scan_delay_auto_trust
                WHERE enabled=1 AND trigger_mode=?
                  AND subject_user_id=? AND option_id=?
                  AND (room_id IS NULL OR room_id='' OR room_id=?)
                """,
                triggerMode.toUpperCase(),
                str(req.get("subject_user_id")),
                longVal(req.get("option_id")),
                str(req.get("room_id"))
        );
        for (Map<String, Object> rule : rules) {
            String owner = str(rule.get("owner_user_id"));
            if (!requestService.canUserReviewDelayRequest(owner, entity)) continue;
            approveRequest(reqId, owner, "trust", longVal(rule.get("id")));
            handled.add(reqId);
            return;
        }
    }

    /** 与 listPendingEnriched 同源：规则 owner 须在选项审核人列表内，而非仅匹配单据 reviewer_user_id 首位 */
    private List<Map<String, Object>> listPendingForTrustRule(Map<String, Object> rule) {
        String owner = str(rule.get("owner_user_id"));
        String roomId = emptyToNull(str(rule.get("room_id")));
        List<Map<String, Object>> rows;
        if (StringUtils.hasText(roomId)) {
            rows = jdbcTemplate.queryForList(
                    """
                    SELECT * FROM twin_scan_delay_request
                    WHERE status='PENDING'
                      AND subject_user_id=? AND option_id=? AND room_id=?
                    ORDER BY created_at ASC LIMIT 50
                    """,
                    str(rule.get("subject_user_id")), longVal(rule.get("option_id")), roomId
            );
        } else {
            rows = jdbcTemplate.queryForList(
                    """
                    SELECT * FROM twin_scan_delay_request
                    WHERE status='PENDING'
                      AND subject_user_id=? AND option_id=?
                    ORDER BY created_at ASC LIMIT 50
                    """,
                    str(rule.get("subject_user_id")), longVal(rule.get("option_id"))
            );
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            TwinScanDelayRequest entity = requestMapper.findById(longVal(row.get("id")));
            if (entity != null && requestService.canUserReviewDelayRequest(owner, entity)) {
                out.add(row);
            }
        }
        return out;
    }

    private List<Map<String, Object>> listPendingForBatchRule(Map<String, Object> rule, int max, Set<Long> exclude) {
        String owner = str(rule.get("owner_user_id"));
        List<Long> optionIds = parseLongList(readJson(str(rule.get("option_ids"))));
        if (optionIds.isEmpty()) return List.of();
        List<String> roomIds = parseStringList(readJson(str(rule.get("room_ids"))));
        boolean onlyReviewer = intVal(rule.get("only_if_reviewer_match"), 1) == 1;
        StringBuilder sql = new StringBuilder(
                "SELECT * FROM twin_scan_delay_request WHERE status='PENDING' AND option_id IN ("
        );
        sql.append(String.join(",", optionIds.stream().map(x -> "?").toList()));
        sql.append(")");
        List<Object> args = new ArrayList<>(optionIds);
        if (!roomIds.isEmpty()) {
            sql.append(" AND room_id IN (");
            sql.append(String.join(",", roomIds.stream().map(x -> "?").toList()));
            sql.append(")");
            args.addAll(roomIds);
        }
        sql.append(" ORDER BY created_at ASC LIMIT ?");
        args.add(max * 2);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql.toString(), args.toArray());
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            long id = longVal(row.get("id"));
            if (exclude.contains(id)) continue;
            if (onlyReviewer) {
                TwinScanDelayRequest entity = requestMapper.findById(id);
                if (entity == null || !requestService.canUserReviewDelayRequest(owner, entity)) continue;
            }
            out.add(row);
            if (out.size() >= max) break;
        }
        return out;
    }

    private String approveRequest(long requestId, String reviewerUserId, String ruleType, long ruleId) {
        try {
            requestService.reviewRequest(requestId, true, reviewerUserId, null);
            log(ruleType, ruleId, requestId, "APPROVED", null);
            return "APPROVED";
        } catch (Exception e) {
            log(ruleType, ruleId, requestId, "FAILED", e.getMessage());
            return "FAILED";
        }
    }

    private void log(String ruleType, long ruleId, long requestId, String result, String message) {
        try {
            jdbcTemplate.update(
                    """
                    INSERT INTO twin_scan_delay_auto_approve_log (rule_type, rule_id, request_id, result, message)
                    VALUES (?,?,?,?,?)
                    """,
                    ruleType, ruleId > 0 ? ruleId : null, requestId, result,
                    message != null && message.length() > 250 ? message.substring(0, 250) : message
            );
        } catch (Exception e) {
            log.warn("[scan-delay-auto] log insert failed: {}", e.getMessage());
        }
    }

    private Set<String> loadTrustedKeys(String ownerUserId) {
        Set<String> keys = new HashSet<>();
        List<Map<String, Object>> rules = jdbcTemplate.queryForList(
                "SELECT subject_user_id, option_id, room_id FROM twin_scan_delay_auto_trust WHERE owner_user_id=? AND enabled=1",
                ownerUserId
        );
        for (Map<String, Object> r : rules) {
            keys.add(trustKey(str(r.get("subject_user_id")), longVal(r.get("option_id")), str(r.get("room_id"))));
        }
        return keys;
    }

    private static String trustKey(String subjectUserId, long optionId, String roomId) {
        return subjectUserId + "|" + optionId + "|" + (StringUtils.hasText(roomId) ? roomId.trim() : "*");
    }

    private static void requireOwner(String ownerUserId) {
        if (!StringUtils.hasText(ownerUserId)) throw new IllegalArgumentException("缺少 owner");
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o).trim();
    }

    private static String emptyToNull(String s) {
        return StringUtils.hasText(s) ? s.trim() : null;
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

    private List<String> parseStringList(Object raw) {
        if (raw == null) return List.of();
        if (raw instanceof List<?> list) {
            List<String> out = new ArrayList<>();
            for (Object o : list) {
                if (o != null && StringUtils.hasText(String.valueOf(o))) out.add(String.valueOf(o).trim());
            }
            return out;
        }
        Object parsed = readJson(str(raw));
        if (parsed instanceof List<?> list) {
            return parseStringList(list);
        }
        return List.of();
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
