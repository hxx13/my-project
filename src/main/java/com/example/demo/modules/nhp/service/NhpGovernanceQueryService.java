package com.example.demo.modules.nhp.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.UserDisplayNameService;
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
    private final CrfFormMapper formMapper;
    private final CrfCodelistMapper codelistMapper;
    private final CrfRecordMapper recordMapper;
    private final CrfStandardVersionMapper standardVersionMapper;
    private final CrfNotificationMapper notificationMapper;
    private final CrfTransplantMapper transplantMapper;
    private final CrfVisitMapper visitMapper;
    private final CrfVisitInstanceMapper visitInstanceMapper;
    private final CrfQueryMapper queryMapper;
    private final NhpFieldService fieldService;
    private final UserDisplayNameService userDisplayNameService;
    private final NhpSnapshotService snapshotService;
    private final NhpPermissionService permissionService;

    public NhpGovernanceQueryService(CrfDataAuditLogMapper dataAuditLogMapper,
                                     CrfDictChangeLogMapper dictChangeLogMapper,
                                     CrfRecordSnapshotMapper snapshotMapper,
                                     CrfSubjectMapper subjectMapper,
                                     CrfTodoMapper todoMapper,
                                     CrfQualityEventMapper qualityEventMapper,
                                     CrfFieldMapper fieldMapper,
                                     CrfFormMapper formMapper,
                                     CrfCodelistMapper codelistMapper,
                                     CrfRecordMapper recordMapper,
                                     CrfStandardVersionMapper standardVersionMapper,
                                     CrfNotificationMapper notificationMapper,
                                     CrfTransplantMapper transplantMapper,
                                     CrfVisitMapper visitMapper,
                                     CrfVisitInstanceMapper visitInstanceMapper,
                                     CrfQueryMapper queryMapper,
                                     NhpFieldService fieldService,
                                     UserDisplayNameService userDisplayNameService,
                                     NhpSnapshotService snapshotService,
                                     NhpPermissionService permissionService) {
        this.dataAuditLogMapper = dataAuditLogMapper;
        this.dictChangeLogMapper = dictChangeLogMapper;
        this.snapshotMapper = snapshotMapper;
        this.subjectMapper = subjectMapper;
        this.todoMapper = todoMapper;
        this.qualityEventMapper = qualityEventMapper;
        this.fieldMapper = fieldMapper;
        this.formMapper = formMapper;
        this.codelistMapper = codelistMapper;
        this.recordMapper = recordMapper;
        this.standardVersionMapper = standardVersionMapper;
        this.notificationMapper = notificationMapper;
        this.transplantMapper = transplantMapper;
        this.visitMapper = visitMapper;
        this.visitInstanceMapper = visitInstanceMapper;
        this.queryMapper = queryMapper;
        this.fieldService = fieldService;
        this.userDisplayNameService = userDisplayNameService;
        this.snapshotService = snapshotService;
        this.permissionService = permissionService;
    }

    public List<Map<String, Object>> listDataAuditLog(int limit) {
        int lim = clamp(limit, 1, 500);
        List<CrfDataAuditLog> rows = dataAuditLogMapper.listRecent(lim);
        enrichAuditOperatorNames(rows);
        Map<Long, CrfRecord> recordCache = new HashMap<>();
        Map<Long, CrfForm> formCache = new HashMap<>();
        Map<Long, CrfSubject> subjectCache = new HashMap<>();
        List<Map<String, Object>> out = new ArrayList<>();
        for (CrfDataAuditLog row : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", row.getId());
            m.put("fieldCode", row.getFieldCode() != null ? row.getFieldCode() : String.valueOf(row.getFieldId()));
            m.put("fieldName", row.getFieldName());
            m.put("fieldId", row.getFieldId());
            m.put("changeType", row.getChangeType());
            m.put("beforeValue", row.getBeforeValue());
            m.put("afterValue", row.getAfterValue());
            m.put("operatorId", row.getOperatorId());
            m.put("operatorName", row.getOperatorName());
            m.put("operator", displayNameOrId(row.getOperatorName(), row.getOperatorId()));
            m.put("changeReason", row.getChangeReason());
            m.put("createdAt", row.getCreatedAt());
            m.put("recordId", row.getRecordId());
            enrichAuditRecordContext(m, row.getRecordId(), recordCache, formCache, subjectCache);
            out.add(m);
        }
        return out;
    }

    public Map<String, Object> pageDataAuditLog(Long formId, String formKey, String keyword,
                                              String changeType, String operatorId, String subjectType,
                                              String dateFrom, String dateTo, int page, int pageSize) {
        int p = Math.max(page, 1);
        int sz = Math.min(Math.max(pageSize, 1), 200);
        int offset = (p - 1) * sz;
        String kw = blankToNull(keyword);
        String ct = blankToNull(changeType);
        String op = blankToNull(operatorId);
        String st = blankToNull(subjectType);
        String df = blankToNull(dateFrom);
        String dt = blankToNull(dateTo);
        String fk = blankToNull(formKey);
        List<CrfDataAuditLog> rows = dataAuditLogMapper.listFiltered(
                formId, fk, kw, ct, op, st, df, dt, offset, sz);
        long total = dataAuditLogMapper.countFiltered(formId, fk, kw, ct, op, st, df, dt);
        enrichAuditOperatorNames(rows);
        Map<Long, CrfRecord> recordCache = new HashMap<>();
        Map<Long, CrfForm> formCache = new HashMap<>();
        Map<Long, CrfSubject> subjectCache = new HashMap<>();
        List<Map<String, Object>> items = new ArrayList<>();
        for (CrfDataAuditLog row : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", row.getId());
            m.put("fieldCode", row.getFieldCode() != null ? row.getFieldCode() : String.valueOf(row.getFieldId()));
            m.put("fieldName", row.getFieldName());
            m.put("fieldId", row.getFieldId());
            m.put("changeType", row.getChangeType());
            m.put("beforeValue", row.getBeforeValue());
            m.put("afterValue", row.getAfterValue());
            m.put("operatorId", row.getOperatorId());
            m.put("operatorName", row.getOperatorName());
            m.put("operator", displayNameOrId(row.getOperatorName(), row.getOperatorId()));
            m.put("changeReason", row.getChangeReason());
            m.put("createdAt", row.getCreatedAt());
            m.put("recordId", row.getRecordId());
            enrichAuditRecordContext(m, row.getRecordId(), recordCache, formCache, subjectCache);
            items.add(m);
        }
        List<Map<String, Object>> formSummaries = new ArrayList<>();
        for (Map<String, Object> raw : dataAuditLogMapper.countByForm()) {
            Map<String, Object> s = new LinkedHashMap<>();
            s.put("formId", raw.get("formId"));
            s.put("formKey", raw.get("formKey"));
            s.put("formTitle", raw.get("formTitle"));
            s.put("count", raw.get("cnt"));
            formSummaries.add(s);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", total);
        out.put("page", p);
        out.put("pageSize", sz);
        out.put("formSummaries", formSummaries);
        return out;
    }

    public List<Map<String, Object>> listDictChangeLog(int limit) {
        int lim = clamp(limit, 1, 500);
        List<CrfDictChangeLog> rows = dictChangeLogMapper.listRecent(lim);
        Map<String, String> operatorNames = resolveOperatorNames(rows);
        List<Map<String, Object>> out = new ArrayList<>();
        for (CrfDictChangeLog row : rows) {
            String operatorId = row.getOperator();
            String operatorName = operatorId != null ? operatorNames.get(operatorId.trim()) : null;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", row.getId());
            m.put("entity", row.getEntity());
            m.put("entityId", row.getEntityId());
            enrichDictEntityLabels(m, row.getEntity(), row.getEntityId());
            m.put("changeType", row.getChangeType());
            m.put("beforeJson", row.getBeforeJson());
            m.put("afterJson", row.getAfterJson());
            m.put("operatorId", operatorId);
            m.put("operatorName", operatorName);
            m.put("operator", displayNameOrId(operatorName, operatorId));
            m.put("createdAt", row.getCreatedAt());
            out.add(m);
        }
        return out;
    }

    public Map<String, Object> pageDictChangeLog(String entityType, String keyword,
                                                 String changeType, String operatorId,
                                                 String dateFrom, String dateTo, int page, int pageSize) {
        int p = Math.max(page, 1);
        int sz = Math.min(Math.max(pageSize, 1), 200);
        int offset = (p - 1) * sz;
        String et = blankToNull(entityType);
        String kw = blankToNull(keyword);
        String ct = blankToNull(changeType);
        String op = blankToNull(operatorId);
        String df = blankToNull(dateFrom);
        String dt = blankToNull(dateTo);
        List<CrfDictChangeLog> rows = dictChangeLogMapper.listFiltered(et, kw, ct, op, df, dt, offset, sz);
        long total = dictChangeLogMapper.countFiltered(et, kw, ct, op, df, dt);
        Map<String, String> operatorNames = resolveOperatorNames(rows);
        List<Map<String, Object>> items = new ArrayList<>();
        for (CrfDictChangeLog row : rows) {
            String operatorIdVal = row.getOperator();
            String operatorName = operatorIdVal != null ? operatorNames.get(operatorIdVal.trim()) : null;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", row.getId());
            m.put("entity", row.getEntity());
            m.put("entityId", row.getEntityId());
            enrichDictEntityLabels(m, row.getEntity(), row.getEntityId());
            m.put("changeType", row.getChangeType());
            m.put("beforeJson", row.getBeforeJson());
            m.put("afterJson", row.getAfterJson());
            m.put("operatorId", operatorIdVal);
            m.put("operatorName", operatorName);
            m.put("operator", displayNameOrId(operatorName, operatorIdVal));
            m.put("createdAt", row.getCreatedAt());
            items.add(m);
        }
        List<Map<String, Object>> entitySummaries = new ArrayList<>();
        for (Map<String, Object> raw : dictChangeLogMapper.countByEntity()) {
            Map<String, Object> s = new LinkedHashMap<>();
            String entity = String.valueOf(raw.get("entity"));
            s.put("entity", entity);
            s.put("label", entityLabel(entity));
            s.put("count", raw.get("cnt"));
            entitySummaries.add(s);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", total);
        out.put("page", p);
        out.put("pageSize", sz);
        out.put("entitySummaries", entitySummaries);
        return out;
    }

    public List<Map<String, Object>> listSnapshots(Long recordId, int limit) {
        int lim = clamp(limit, 1, 500);
        List<CrfRecordSnapshot> snaps = snapshotMapper.listLight(recordId, lim);
        snapshotService.enrichCreatedByNames(snaps);
        List<Map<String, Object>> out = new ArrayList<>();
        for (CrfRecordSnapshot snap : snaps) {
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
        // 语义：对比「otherId（上一版）→ id（当前）」。a=当前(id) → after，b=上一版(otherId) → before。
        Map<String, Object> current = parseJsonMap(a.getDataJson());
        Map<String, Object> previous = parseJsonMap(b.getDataJson());
        Set<String> keys = new TreeSet<>();
        keys.addAll(current.keySet());
        keys.addAll(previous.keySet());
        List<Map<String, Object>> diffs = new ArrayList<>();
        for (String key : keys) {
            String before = stringify(previous.get(key));
            String after = stringify(current.get(key));
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
            card.put("armCode", s.getArmCode());
            card.put("status", s.getStatus());

            String txDate = null;
            CrfTransplant project = null;
            List<CrfTransplant> txs = transplantMapper.listBySubjectId(s.getId());
            if (txs != null && !txs.isEmpty()) {
                project = txs.get(0);
                if (project.getTxDate() != null) {
                    txDate = project.getTxDate().toString();
                }
            }
            // 生命周期以项目为准（挪到 crf_transplant.lifecycle_stage）；项目缺省时回退 subject
            String lifecycle = (project != null && project.getLifecycleStage() != null)
                    ? project.getLifecycleStage()
                    : s.getLifecycleStage();
            card.put("lifecycleStage", lifecycle);
            card.put("txDate", txDate);
            card.put("currentTp", resolveCurrentTp(s.getId(), txDate, project));
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
        out.put("qualityEvents", enrichQualityEventsForOverview(qualityEventMapper.listRecent(20)));
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

    /** 记录可见性：平台所有者全见；未归属(teamId=null)全见；否则仅本团队成员见。 */
    private boolean canViewRecordByTeam(User user, Long recordId) {
        if (permissionService.isPlatformOwner(user)) return true;
        Long tid = permissionService.teamIdOfRecord(recordId);
        if (tid == null) return true;
        return permissionService.isTeamMember(user, tid);
    }

    public List<Map<String, Object>> listMyTasks(User user) {
        List<Map<String, Object>> out = new ArrayList<>();
        boolean nhpExpert = permissionService.isNhpExpert(user);
        for (CrfField f : fieldService.listPendingReview(null)) {
            if (!nhpExpert) continue; // 字段校对仅 NHP专家
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
            if (!canViewRecordByTeam(user, r.getId())) continue;
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
            if (!canViewRecordByTeam(user, r.getId())) continue;
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
            if (!canViewRecordByTeam(user, q.getRecordId())) continue;
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

    private String resolveCurrentTp(Long subjectId, String txDate, CrfTransplant project) {
        // 手动选定的 TP 优先；未选定则退回自动推算（项目级 current_tp 覆盖所有消费方）
        if (project != null && project.getCurrentTp() != null && !project.getCurrentTp().isBlank()) {
            return project.getCurrentTp();
        }
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
        m.put("createdBy", snap.getCreatedBy());
        m.put("createdByName", snap.getCreatedByName());
        m.put("createdAt", snap.getCreatedAt());
        return m;
    }

    private void enrichAuditOperatorNames(List<CrfDataAuditLog> rows) {
        if (rows == null || rows.isEmpty()) {
            return;
        }
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (CrfDataAuditLog r : rows) {
            if (r != null && StringUtils.hasText(r.getOperatorId())) {
                ids.add(r.getOperatorId().trim());
            }
        }
        if (ids.isEmpty()) {
            return;
        }
        Map<String, String> names = userDisplayNameService.resolveDisplayNames(new ArrayList<>(ids));
        for (CrfDataAuditLog r : rows) {
            if (r == null || !StringUtils.hasText(r.getOperatorId())) {
                continue;
            }
            String id = r.getOperatorId().trim();
            String n = names.get(id);
            if (StringUtils.hasText(n) && !n.equals(id)) {
                r.setOperatorName(n);
            }
        }
    }

    private Map<String, String> resolveOperatorNames(List<CrfDictChangeLog> rows) {
        if (rows == null || rows.isEmpty()) {
            return Map.of();
        }
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (CrfDictChangeLog row : rows) {
            if (row != null && StringUtils.hasText(row.getOperator())) {
                ids.add(row.getOperator().trim());
            }
        }
        if (ids.isEmpty()) {
            return Map.of();
        }
        return userDisplayNameService.resolveDisplayNames(new ArrayList<>(ids));
    }

    private List<Map<String, Object>> enrichQualityEventsForOverview(List<CrfQualityEvent> events) {
        if (events == null || events.isEmpty()) {
            return List.of();
        }
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (CrfQualityEvent e : events) {
            if (e != null && StringUtils.hasText(e.getReviewer())) {
                ids.add(e.getReviewer().trim());
            }
        }
        Map<String, String> names = ids.isEmpty()
                ? Map.of()
                : userDisplayNameService.resolveDisplayNames(new ArrayList<>(ids));
        List<Map<String, Object>> out = new ArrayList<>();
        for (CrfQualityEvent e : events) {
            if (e == null) {
                continue;
            }
            String reviewerId = e.getReviewer();
            String reviewerName = null;
            if (StringUtils.hasText(reviewerId)) {
                String id = reviewerId.trim();
                String n = names.get(id);
                if (StringUtils.hasText(n) && !n.equals(id)) {
                    reviewerName = n;
                }
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", e.getId());
            m.put("eventType", e.getEventType());
            m.put("subjectId", e.getSubjectId());
            m.put("refType", e.getRefType());
            m.put("refId", e.getRefId());
            m.put("triggerRule", e.getTriggerRule());
            m.put("status", e.getStatus());
            m.put("reviewer", reviewerId);
            m.put("reviewerName", reviewerName);
            m.put("createdAt", e.getCreatedAt());
            out.add(m);
        }
        return out;
    }

    private void enrichAuditRecordContext(
            Map<String, Object> m,
            Long recordId,
            Map<Long, CrfRecord> recordCache,
            Map<Long, CrfForm> formCache,
            Map<Long, CrfSubject> subjectCache) {
        if (recordId == null) {
            return;
        }
        CrfRecord record = recordCache.computeIfAbsent(recordId, recordMapper::findById);
        if (record == null) {
            return;
        }
        m.put("subjectId", record.getSubjectId());
        m.put("formId", record.getFormId());
        if (record.getSubjectId() != null) {
            CrfSubject subject = subjectCache.computeIfAbsent(record.getSubjectId(), subjectMapper::findById);
            if (subject != null) {
                m.put("subjectCode", subject.getSubjectCode());
                m.put("subjectName", subject.getSubjectCode());
                m.put("subjectType", subject.getSubjectType());
            }
        }
        if (record.getFormId() != null) {
            CrfForm form = formCache.computeIfAbsent(record.getFormId(), formMapper::findById);
            if (form != null) {
                m.put("formKey", form.getCode());
                m.put("formTitle", form.getName());
                m.put("formType", form.getFormType());
            }
        }
    }

    private void enrichDictEntityLabels(Map<String, Object> m, String entity, Long entityId) {
        if (entity == null || entityId == null) {
            return;
        }
        String kind = entity.trim().toLowerCase(Locale.ROOT);
        if ("field".equals(kind)) {
            CrfField field = fieldMapper.findById(entityId);
            if (field != null) {
                m.put("entityCode", field.getFieldCode());
                m.put("entityName", pickFieldDisplayName(field));
            }
            return;
        }
        if ("codelist".equals(kind)) {
            CrfCodelist cl = codelistMapper.findById(entityId);
            if (cl != null) {
                m.put("entityCode", cl.getCode());
                m.put("entityName", cl.getName() != null ? cl.getName() : cl.getCode());
            }
            return;
        }
        if ("form".equals(kind)) {
            CrfForm form = formMapper.findById(entityId);
            if (form != null) {
                m.put("entityCode", form.getCode());
                m.put("entityName", form.getName() != null ? form.getName() : form.getCode());
            }
        }
    }

    private static String pickFieldDisplayName(CrfField field) {
        if (field.getNameCn() != null && !field.getNameCn().isBlank()) {
            return field.getNameCn().trim();
        }
        if (field.getNameEn() != null && !field.getNameEn().isBlank()) {
            return field.getNameEn().trim();
        }
        return field.getFieldCode();
    }

    private static String displayNameOrId(String name, String id) {
        if (StringUtils.hasText(name) && !name.equals(id)) {
            return name.trim();
        }
        return StringUtils.hasText(id) ? id.trim() : null;
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

    private static String entityLabel(String entity) {
        if (entity == null) {
            return "—";
        }
        switch (entity.trim().toLowerCase(Locale.ROOT)) {
            case "field":
                return "字段";
            case "codelist":
                return "码表";
            case "form":
                return "模板";
            default:
                return entity;
        }
    }

    private static String blankToNull(String s) {
        if (s == null || s.isBlank()) {
            return null;
        }
        return s.trim();
    }

    private static int clamp(int v, int min, int max) {
        return Math.max(min, Math.min(max, v));
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }
}
