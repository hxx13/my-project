package com.example.demo.modules.nhp.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.entity.CrfDataAuditLog;
import com.example.demo.modules.nhp.entity.CrfQuery;
import com.example.demo.modules.nhp.entity.CrfRecord;
import com.example.demo.modules.nhp.mapper.CrfDataAuditLogMapper;
import com.example.demo.modules.nhp.mapper.CrfQueryMapper;
import com.example.demo.modules.nhp.mapper.CrfRecordMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/** NHP 审计 + 数据质疑：审计日志查询、发起质疑、回复质疑。 */
@Service
public class NhpAuditService {

    private final CrfDataAuditLogMapper auditLogMapper;
    private final CrfQueryMapper queryMapper;
    private final CrfRecordMapper recordMapper;

    public NhpAuditService(CrfDataAuditLogMapper auditLogMapper, CrfQueryMapper queryMapper,
                           CrfRecordMapper recordMapper) {
        this.auditLogMapper = auditLogMapper;
        this.queryMapper = queryMapper;
        this.recordMapper = recordMapper;
    }

    public List<CrfDataAuditLog> audit(Long recordId) {
        return auditLogMapper.listByRecordId(recordId);
    }

    public Result<List<CrfQuery>> listQueries(Long recordId) {
        if (recordMapper.findById(recordId) == null) {
            return Result.error("表单实例不存在");
        }
        return Result.success(queryMapper.listByRecordId(recordId));
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
