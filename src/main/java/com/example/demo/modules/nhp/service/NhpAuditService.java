package com.example.demo.modules.nhp.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.nhp.entity.CrfDataAuditLog;
import com.example.demo.modules.nhp.entity.CrfQuery;
import com.example.demo.modules.nhp.entity.CrfRecord;
import com.example.demo.modules.nhp.mapper.CrfDataAuditLogMapper;
import com.example.demo.modules.nhp.mapper.CrfQueryMapper;
import com.example.demo.modules.nhp.mapper.CrfRecordMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/** NHP 审计 + 数据质疑：审计日志查询、发起质疑、回复质疑。 */
@Service
public class NhpAuditService {

    private final CrfDataAuditLogMapper auditLogMapper;
    private final CrfQueryMapper queryMapper;
    private final CrfRecordMapper recordMapper;
    private final UserDisplayNameService userDisplayNameService;

    public NhpAuditService(CrfDataAuditLogMapper auditLogMapper, CrfQueryMapper queryMapper,
                           CrfRecordMapper recordMapper, UserDisplayNameService userDisplayNameService) {
        this.auditLogMapper = auditLogMapper;
        this.queryMapper = queryMapper;
        this.recordMapper = recordMapper;
        this.userDisplayNameService = userDisplayNameService;
    }

    public List<CrfDataAuditLog> audit(Long recordId) {
        List<CrfDataAuditLog> rows = auditLogMapper.listByRecordId(recordId);
        enrichOperatorNames(rows);
        return rows;
    }

    public Result<List<CrfQuery>> listQueries(Long recordId) {
        if (recordMapper.findById(recordId) == null) {
            return Result.error("表单实例不存在");
        }
        List<CrfQuery> rows = queryMapper.listByRecordId(recordId);
        enrichQueryUserNames(rows);
        return Result.success(rows);
    }

    @Transactional
    public Result<CrfQuery> createQuery(Map<String, Object> body) {
        Long recordId = asLong(body.get("recordId"));
        String text = str(body.get("queryText"));
        if (recordId == null || text == null) {
            return Result.fail(400, "recordId 与 queryText 必填");
        }
        CrfRecord record = recordMapper.findById(recordId);
        if (record == null) {
            return Result.error("表单实例不存在");
        }
        CrfQuery q = new CrfQuery();
        q.setRecordId(recordId);
        q.setFieldId(asLong(body.get("fieldId")));
        q.setQueryText(text);
        q.setStatus("OPEN");
        q.setOpenedBy(str(body.get("openedBy")));
        queryMapper.insert(q);
        audit(recordId, q.getFieldId() == null ? 0L : q.getFieldId(), "INSERT", null,
                truncate(text, 200), str(body.get("openedBy")), "质疑");
        enrichQueryUserNames(List.of(q));
        return Result.success(q);
    }

    @Transactional
    public Result<?> answerQuery(Long id, Map<String, Object> body) {
        CrfQuery q = queryMapper.findById(id);
        if (q == null) {
            return Result.error("质疑不存在");
        }
        if (!"OPEN".equals(q.getStatus())) {
            return Result.fail(400, "仅 OPEN 状态可回复，当前 " + q.getStatus());
        }
        String answer = str(body.get("answerText"));
        q.setStatus("ANSWERED");
        q.setAnsweredBy(str(body.get("answeredBy")));
        q.setAnsweredAt(LocalDateTime.now());
        q.setAnswerText(answer);
        queryMapper.updateAnswer(q);
        audit(q.getRecordId(), q.getFieldId() == null ? 0L : q.getFieldId(), "UPDATE", null,
                truncate(answer, 200), str(body.get("answeredBy")), "query回复");
        enrichQueryUserNames(List.of(q));
        return Result.success(q);
    }

    @Transactional
    public Result<?> closeQuery(Long id, Map<String, Object> body) {
        CrfQuery q = queryMapper.findById(id);
        if (q == null) {
            return Result.error("质疑不存在");
        }
        if ("CLOSED".equals(q.getStatus())) {
            return Result.success(q);
        }
        queryMapper.close(id);
        q.setStatus("CLOSED");
        audit(q.getRecordId(), q.getFieldId() == null ? 0L : q.getFieldId(), "UPDATE", null,
                "CLOSED", str(body == null ? null : body.get("closedBy")), "质疑关闭");
        return Result.success(q);
    }

    private void enrichOperatorNames(List<CrfDataAuditLog> rows) {
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

    private void enrichQueryUserNames(List<CrfQuery> rows) {
        if (rows == null || rows.isEmpty()) {
            return;
        }
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (CrfQuery q : rows) {
            if (q == null) {
                continue;
            }
            if (StringUtils.hasText(q.getOpenedBy())) {
                ids.add(q.getOpenedBy().trim());
            }
            if (StringUtils.hasText(q.getAnsweredBy())) {
                ids.add(q.getAnsweredBy().trim());
            }
        }
        if (ids.isEmpty()) {
            return;
        }
        Map<String, String> names = userDisplayNameService.resolveDisplayNames(new ArrayList<>(ids));
        for (CrfQuery q : rows) {
            if (q == null) {
                continue;
            }
            if (StringUtils.hasText(q.getOpenedBy())) {
                String id = q.getOpenedBy().trim();
                String n = names.get(id);
                if (StringUtils.hasText(n) && !n.equals(id)) {
                    q.setOpenedByName(n);
                }
            }
            if (StringUtils.hasText(q.getAnsweredBy())) {
                String id = q.getAnsweredBy().trim();
                String n = names.get(id);
                if (StringUtils.hasText(n) && !n.equals(id)) {
                    q.setAnsweredByName(n);
                }
            }
        }
    }

    private void audit(Long recordId, Long fieldId, String changeType, String before, String after,
                       String operatorId, String reason) {
        CrfDataAuditLog log = new CrfDataAuditLog();
        log.setRecordId(recordId);
        log.setFieldId(fieldId);
        log.setChangeType(changeType);
        log.setBeforeValue(before);
        log.setAfterValue(after);
        log.setOperatorId(operatorId);
        log.setChangeReason(reason);
        auditLogMapper.insert(log);
    }

    private String truncate(String s, int n) {
        if (s == null) return null;
        return s.length() <= n ? s : s.substring(0, n) + "…";
    }

    private String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private Long asLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(v)); } catch (Exception e) { return null; }
    }
}
