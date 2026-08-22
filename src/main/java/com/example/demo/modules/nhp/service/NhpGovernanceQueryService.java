package com.example.demo.modules.nhp.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.entity.*;
import com.example.demo.modules.nhp.mapper.*;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * NHP 治理侧聚合读：全局审计/快照/总览/通知/病例墙。
 */
@Service
public class NhpGovernanceQueryService {

    private static final ObjectMapper OM = new ObjectMapper();
    private static final DateTimeFormatter ISO_DT = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    private final CrfDataAuditLogMapper dataAuditLogMapper;
    private final CrfDictChangeLogMapper dictChangeLogMapper;
    private final CrfRecordSnapshotMapper snapshotMapper;
    private final CrfSubjectMapper subjectMapper;
    private final CrfTodoMapper todoMapper;
    private final CrfQualityEventMapper qualityEventMapper;
    private final CrfFieldMapper fieldMapper;
    private final CrfRecordMapper recordMapper;
    private final CrfStandardVersionMapper standardVersionMapper;
    private final CrfNotificationMapper notificationMapper;
    private final CrfTransplantMapper transplantMapper;
    private final CrfVisitMapper visitMapper;
    private final CrfVisitInstanceMapper visitInstanceMapper;
    private final CrfQueryMapper queryMapper;
    private final NhpFieldService fieldService;

    public NhpGovernanceQueryService(CrfDataAuditLogMapper dataAuditLogMapper,
                                     CrfDictChangeLogMapper dictChangeLogMapper,
                                     CrfRecordSnapshotMapper snapshotMapper,
                                     CrfSubjectMapper subjectMapper,
                                     CrfTodoMapper todoMapper,
                                     CrfQualityEventMapper qualityEventMapper,
                                     CrfFieldMapper fieldMapper,
                                     CrfRecordMapper recordMapper,
                                     CrfStandardVersionMapper standardVersionMapper,
                                     CrfNotificationMapper notificationMapper,
                                     CrfTransplantMapper transplantMapper,
                                     CrfVisitMapper visitMapper,
                                     CrfVisitInstanceMapper visitInstanceMapper,
                                     CrfQueryMapper queryMapper,
                                     NhpFieldService fieldService) {
        this.dataAuditLogMapper = dataAuditLogMapper;
        this.dictChangeLogMapper = dictChangeLogMapper;
        this.snapshotMapper = snapshotMapper;
        this.subjectMapper = subjectMapper;
        this.todoMapper = todoMapper;
        this.qualityEventMapper = qualityEventMapper;
        this.fieldMapper = fieldMapper;
        this.recordMapper = recordMapper;
        this.standardVersionMapper = standardVersionMapper;
        this.notificationMapper = notificationMapper;
        this.transplantMapper = transplantMapper;
        this.visitMapper = visitMapper;
        this.visitInstanceMapper = visitInstanceMapper;
        this.queryMapper = queryMapper;
        this.fieldService = fieldService;
    }

    public List<Map<String, Object>> listDataAuditLog(int limit) {
        int lim = clamp(limit, 1, 500);
        List<Map<String, Object>> out = new ArrayList<>();
        for (CrfDataAuditLog row : dataAuditLogMapper.listRecent(lim)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", row.getId());
            m.put("fieldCode", row.getFieldCode() != null ? row.getFieldCode() : String.valueOf(row.getFieldId()));
            m.put("fieldId", row.getFieldId());
            m.put("changeType", row.getChangeType());
            m.put("beforeValue", row.getBeforeValue());
            m.put("afterValue", row.getAfterValue());
            m.put("operator", StringUtils.hasText(row.getOperatorName()) ? row.getOperatorName() : row.getOperatorId());
            m.put("changeReason", row.getChangeReason());
            m.put("createdAt", row.getCreatedAt());
            m.put("recordId", row.getRecordId());
            out.add(m);
        }
        return out;
    }

    public List<Map<String, Object>> listDictChangeLog(int limit) {
        int lim = clamp(limit, 1, 500);
        List<Map<String, Object>> out = new ArrayList<>();
        for (CrfDictChangeLog row : dictChangeLogMapper.listRecent(lim)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", row.getId());
            m.put("entity", row.getEntity());
            m.put("entityId", row.getEntityId());
            m.put("changeType", row.getChangeType());
            m.put("beforeJson", row.getBeforeJson());
            m.put("afterJson", row.getAfterJson());
            m.put("operator", row.getOperator());
            m.put("createdAt", row.getCreatedAt());
            out.add(m);
        }
        return out;
    }

    public List<Map<String, Object>> listSnapshots(Long recordId, int limit) {
        int lim = clamp(limit, 1, 500);
        List<Map<String, Object>> out = new ArrayList<>();
        for (CrfRecordSnapshot snap : snapshotMapper.listLight(recordId, lim)) {
            out.add(toSnapshotDto(snap));
        }
        return out;
    }

    public Result<List<Map<String, Object>>> diffSnapshots(Long id, Long otherId) {
        CrfRecordSnapshot a = snapshotMapper.findById(id);
        CrfRecordSnapshot b = snapshotMapper.findById(otherId);
        if (a == null || b == null) {
            return Result.fail(404, "快照不存在");
        }
        Map<String, Object> left = parseJsonMap(a.getDataJson());
        Map<String, Object> right = parseJsonMap(b.getDataJson());
        Set<String> keys = new TreeSet<>();
        keys.addAll(left.keySet());
        keys.addAll(right.keySet());
        List<Map<String, Object>> diffs = new ArrayList<>();
        for (String key : keys) {
            String before = stringify(left.get(key));
            String after = stringify(right.get(key));
            if (Objects.equals(before, after)) continue;
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("fieldCode", key);
            d.put("beforeValue", before);
            d.put("afterValue", after);
            diffs.add(d);
        }
        return Result.success(diffs);
    }

    public List<Map<String, Object>> listSubjectBoard(String armCode) {
        List<CrfSubject> subjects = subjectMapper.list();
        List<Map<String, Object>> out = new ArrayList<>();
        for (CrfSubject s : subjects) {
            if (armCode != null && !armCode.isBlank()
                    && (s.getArmCode() == null || !armCode.equalsIgnoreCase(s.getArmCode()))) {
                continue;
            }
            Map<String, Object> card = new LinkedHashMap<>();
            card.put("id", s.getId());
            card.put("subjectCode", s.getSubjectCode());
            card.put("subjectType", s.getSubjectType());
            card.put("species", s.getSpecies());
            card.put("sex", s.getSex());
            card.put("lifecycleStage", s.getLifecycleStage());
            card.put("armCode", s.getArmCode());
            card.put("status", s.getStatus());

            String txDate = null;
            List<CrfTransplant> txs = transplantMapper.listBySubjectId(s.getId());
            if (txs != null && !txs.isEmpty() && txs.get(0).getTxDate() != null) {
                txDate = txs.get(0).getTxDate().toString();
            }
            card.put("txDate", txDate);
            card.put("currentTp", resolveCurrentTp(s.getId(), txDate));
            card.put("todoCount", todoMapper.countOpenBySubject(s.getId()));
            card.put("overdueCount", todoMapper.countOverdueBySubject(s.getId()));
            out.add(card);
        }
        return out;
    }

    public Map<String, Object> overview() {
        List<CrfField> allFields = fieldMapper.list();
        long frozenFields = allFields.stream()
                .filter(f -> "FROZEN".equalsIgnoreCase(nullToEmpty(f.getStatus()))
                        || "PUBLISHED".equalsIgnoreCase(nullToEmpty(f.getStatus())))
                .count();
        int fieldTotal = allFields.size();
        int fieldProgress = fieldTotal == 0 ? 0 : (int) Math.round(100.0 * frozenFields / fieldTotal);

        List<CrfField> pendingFields = fieldService.listPendingReview(null);
        long pendingSign = recordMapper.countPaged("COMPLETE", null, null);
        long caseCount = subjectMapper.countPaged(null, null, null);
        int todoCount = todoMapper.countOpen();
        int qualityOpen = qualityEventMapper.countByStatus("OPEN");

        Map<String, Object> kpi = new LinkedHashMap<>();
        kpi.put("caseCount", caseCount);
        kpi.put("followUpCount", todoCount);
        kpi.put("todoCount", todoCount);
        kpi.put("qualityEventCount", qualityOpen);
        kpi.put("fieldReviewProgress", fieldProgress);
        kpi.put("pendingSignCount", pendingSign);
        kpi.put("pendingReviewCount", pendingFields.size());
        kpi.put("dictVersion", resolveDictVersion());

        List<Map<String, Object>> reviewProgress = new ArrayList<>();
        Map<String, int[]> byDomain = new LinkedHashMap<>();
        for (CrfField f : allFields) {
            String code = f.getFieldCode() == null ? "?" : f.getFieldCode();
            String domain = code.contains(".") ? code.substring(0, code.indexOf('.')) : code;
            int[] pair = byDomain.computeIfAbsent(domain, k -> new int[2]);
            pair[1]++;
            if ("FROZEN".equalsIgnoreCase(nullToEmpty(f.getStatus()))
                    || "PUBLISHED".equalsIgnoreCase(nullToEmpty(f.getStatus()))) {
                pair[0]++;
            }
        }
        for (Map.Entry<String, int[]> e : byDomain.entrySet()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("name", e.getKey());
            row.put("done", e.getValue()[0]);
            row.put("total", e.getValue()[1]);
            reviewProgress.add(row);
        }

        List<Map<String, Object>> notifications = new ArrayList<>();
        for (CrfNotification n : notificationMapper.listRecent(null, 20)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", n.getId());
            m.put("text", n.getTitle());
            m.put("sub", n.getType());
            m.put("action", "OPEN");
            notifications.add(m);
        }

        List<Map<String, Object>> versions = new ArrayList<>();
        for (CrfStandardVersion v : standardVersionMapper.list()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", v.getStandardCode() + ":" + v.getObjectRef());
            m.put("version", "v" + v.getVersion());
            m.put("status", Boolean.TRUE.equals(v.getActive()) ? "ACTIVE" : "INACTIVE");
            m.put("date", v.getUpdatedAt() != null ? v.getUpdatedAt().toLocalDate().toString() : null);
            versions.add(m);
            if (versions.size() >= 10) break;
        }

        List<Map<String, Object>> activities = new ArrayList<>();
        for (CrfDictChangeLog row : dictChangeLogMapper.listRecent(15)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("time", row.getCreatedAt() == null ? "" : row.getCreatedAt().format(ISO_DT));
            m.put("text", row.getChangeType() + " " + row.getEntity() + "#" + row.getEntityId());
            activities.add(m);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kpi", kpi);
        out.put("reviewProgress", reviewProgress);
        out.put("notifications", notifications);
        out.put("qualityEvents", qualityEventMapper.listRecent(20));
        out.put("todos", todoMapper.listOpenRecent(20));
        out.put("cases", listSubjectBoard(null).stream().limit(20).toList());
        out.put("versions", versions);
        out.put("activities", activities);
        return out;
    }

    public List<Map<String, Object>> listNotifications(String userId, int limit) {
        int lim = clamp(limit, 1, 500);
        List<Map<String, Object>> out = new ArrayList<>();
        for (CrfNotification n : notificationMapper.listRecent(userId, lim)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", n.getId());
            m.put("group", n.getType());
            m.put("text", n.getTitle());
            m.put("time", n.getCreatedAt() == null ? null : n.getCreatedAt().format(ISO_DT));
            m.put("read", Boolean.TRUE.equals(n.getRead()));
            out.add(m);
        }
        return out;
    }

    public List<Map<String, Object>> listMyTasks() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (CrfField f : fieldService.listPendingReview(null)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", f.getId());
            m.put("tab", "FIELD_REVIEW");
            m.put("code", f.getFieldCode());
            m.put("title", f.getNameCn() != null ? f.getNameCn() : f.getFieldCode());
            m.put("sub", f.getStatus());
            m.put("action", "校对");
            out.add(m);
        }
        for (CrfRecord r : recordMapper.listPaged("COMPLETE", null, null, 0, 50)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", r.getId());
            m.put("tab", "SIGN");
            m.put("code", "R" + r.getId());
            m.put("title", "待签署记录 #" + r.getId());
            m.put("sub", r.getStatus());
            m.put("action", "签署");
            out.add(m);
        }
        for (CrfRecord r : recordMapper.listPaged("IN_REVIEW", null, null, 0, 50)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", r.getId());
            m.put("tab", "RECORD_REVIEW");
            m.put("code", "R" + r.getId());
            m.put("title", "待复核记录 #" + r.getId());
            m.put("sub", r.getStatus());
            m.put("action", "复核");
            out.add(m);
        }
        for (CrfQuery q : queryMapper.listOpenRecent(50)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", q.getId());
            m.put("tab", "QUESTION");
            m.put("code", "Q" + q.getId());
            m.put("title", q.getQueryText() == null ? "质疑" : q.getQueryText());
            m.put("sub", q.getStatus());
            m.put("action", "处理");
            out.add(m);
        }
        return out;
    }

    private String resolveCurrentTp(Long subjectId, String txDate) {
        List<CrfVisitInstance> instances = visitInstanceMapper.listBySubjectId(subjectId);
        if (instances == null || instances.isEmpty()) {
            if (txDate == null) return null;
            try {
                LocalDate day0 = LocalDate.parse(txDate);
                long days = LocalDate.now().toEpochDay() - day0.toEpochDay();
                List<CrfVisit> visits = visitMapper.list();
                CrfVisit best = null;
                for (CrfVisit v : visits) {
                    if (v.getPlannedDays() == null) continue;
                    if (v.getPlannedDays() <= days) {
                        if (best == null || v.getPlannedDays() > best.getPlannedDays()) best = v;
                    }
                }
                return best == null ? null : best.getCode();
            } catch (Exception ignored) {
                return null;
            }
        }
        CrfVisitInstance last = instances.get(instances.size() - 1);
        CrfVisit visit = visitMapper.findById(last.getVisitId());
        return visit == null ? null : visit.getCode();
    }

    private String resolveDictVersion() {
        List<CrfStandardVersion> list = standardVersionMapper.list();
        for (CrfStandardVersion v : list) {
            if ("DICT".equalsIgnoreCase(v.getStandardCode()) && Boolean.TRUE.equals(v.getActive())) {
                return v.getObjectRef() + "@v" + v.getVersion();
            }
        }
        return list.isEmpty() ? "—" : ("v" + list.get(0).getVersion());
    }

    private Map<String, Object> toSnapshotDto(CrfRecordSnapshot snap) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", snap.getId());
        m.put("recordId", snap.getRecordId());
        m.put("version", snap.getVersionNo());
        m.put("stage", snap.getStage());
        m.put("bizStage", snap.getBizStage());
        m.put("createdBy", StringUtils.hasText(snap.getCreatedByName()) ? snap.getCreatedByName() : snap.getCreatedBy());
        m.put("createdAt", snap.getCreatedAt());
        return m;
    }

    private Map<String, Object> parseJsonMap(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            Map<String, Object> raw = OM.readValue(json, new TypeReference<>() {});
            // 兼容 {values:{field:val}} 或扁平 map
            Object values = raw.get("values");
            if (values instanceof Map<?, ?> nested) {
                Map<String, Object> flat = new LinkedHashMap<>();
                for (Map.Entry<?, ?> e : nested.entrySet()) {
                    flat.put(String.valueOf(e.getKey()), e.getValue());
                }
                return flat;
            }
            return raw;
        } catch (Exception e) {
            return Map.of();
        }
    }

    private static String stringify(Object v) {
        if (v == null) return null;
        if (v instanceof String s) return s;
        try {
            return OM.writeValueAsString(v);
        } catch (Exception e) {
            return String.valueOf(v);
        }
    }

    private static int clamp(int v, int min, int max) {
        return Math.max(min, Math.min(max, v));
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }
}
