package com.example.demo.modules.accessfusion.service;

import com.example.demo.modules.accessfusion.model.AccessAuditFilterParams;
import com.example.demo.modules.twin.dahua.entity.DahuaSwingRecord;
import com.example.demo.modules.twin.dahua.mapper.DahuaSwingMapper;
import com.example.demo.modules.twin.dahua.support.DahuaSwingDepartmentSupport;
import com.example.demo.modules.twin.dahua.support.DahuaSwingDepartmentSupport.Dept;
import com.example.demo.modules.twin.dahua.support.DahuaSwingEnterExitSupport;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** 按筛选范围补全历史门禁记录字段并 upsert 覆盖 */
@Service
public class AccessSwingRecordEnrichService {

    private static final int BATCH_SIZE = 500;
    private static final int MAX_BATCHES_PER_REQUEST = 40;

    private final DahuaSwingMapper dahuaSwingMapper;
    private final DahuaSwingDepartmentSupport departmentSupport;

    public AccessSwingRecordEnrichService(
            DahuaSwingMapper dahuaSwingMapper, DahuaSwingDepartmentSupport departmentSupport) {
        this.dahuaSwingMapper = dahuaSwingMapper;
        this.departmentSupport = departmentSupport;
    }

    public Map<String, Object> enrichByFilter(AccessAuditFilterParams filter) {
        int updated = 0;
        int scanned = 0;
        int batches = 0;
        for (int b = 0; b < MAX_BATCHES_PER_REQUEST; b++) {
            int offset = b * BATCH_SIZE;
            List<DahuaSwingRecord> rows = dahuaSwingMapper.listRecordsByFilter(filter, BATCH_SIZE, offset);
            if (rows == null || rows.isEmpty()) {
                break;
            }
            batches++;
            for (DahuaSwingRecord r : rows) {
                scanned++;
                if (enrichOne(r)) {
                    updated++;
                }
            }
            if (rows.size() < BATCH_SIZE) {
                break;
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("scanned", scanned);
        out.put("updated", updated);
        out.put("batches", batches);
        out.put("truncated", batches >= MAX_BATCHES_PER_REQUEST);
        return out;
    }

    /**
     * 按筛选范围重算受众：部门 ID 或大华部门映射名含「学生」→ STUDENT，其余 → STAFF，写回 twin_dahua_swing_record。
     */
    public Map<String, Object> recalculateAudienceByFilter(AccessAuditFilterParams filter) {
        int updated = 0;
        int scanned = 0;
        int studentCount = 0;
        int staffCount = 0;
        int batches = 0;
        for (int b = 0; b < MAX_BATCHES_PER_REQUEST; b++) {
            int offset = b * BATCH_SIZE;
            List<DahuaSwingRecord> rows = dahuaSwingMapper.listRecordsByFilter(filter, BATCH_SIZE, offset);
            if (rows == null || rows.isEmpty()) {
                break;
            }
            batches++;
            for (DahuaSwingRecord r : rows) {
                scanned++;
                if (recalculateAudienceOne(r)) {
                    updated++;
                }
                if (AccessAudienceConstants.AUDIENCE_STUDENT.equals(r.getAudienceType())) {
                    studentCount++;
                } else {
                    staffCount++;
                }
            }
            if (rows.size() < BATCH_SIZE) {
                break;
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("scanned", scanned);
        out.put("updated", updated);
        out.put("studentCount", studentCount);
        out.put("staffCount", staffCount);
        out.put("batches", batches);
        out.put("truncated", batches >= MAX_BATCHES_PER_REQUEST);
        out.put("rule", AccessAudienceConstants.studentRuleLabel());
        return out;
    }

    public Map<String, Object> qualitySummary(AccessAuditFilterParams filter) {
        int total = dahuaSwingMapper.countRecordsByFilter(filter);
        int missingEnterExit =
                dahuaSwingMapper.countRecordsMissingEnterExit(
                        filter.taskId(),
                        filter.channelCode(),
                        filter.personCode(),
                        filter.personName(),
                        filter.openType(),
                        filter.startTime(),
                        filter.endTime());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", total);
        out.put("missingEnterExit", missingEnterExit);
        return out;
    }

    private boolean enrichOne(DahuaSwingRecord r) {
        if (r == null || !StringUtils.hasText(r.getRecordId())) {
            return false;
        }
        boolean changed = false;
        Dept dept = departmentSupport.resolveForClassification(r);
        if (StringUtils.hasText(dept.id()) && !dept.id().equals(r.getDepartmentId())) {
            r.setDepartmentId(dept.id());
            changed = true;
        }
        if (StringUtils.hasText(dept.name()) && !dept.name().equals(r.getDepartmentName())) {
            r.setDepartmentName(dept.name());
            changed = true;
        }
        Integer beforeExit = r.getEnterOrExit();
        DahuaSwingEnterExitSupport.applyResolved(r);
        if (r.getEnterOrExit() != null && !r.getEnterOrExit().equals(beforeExit)) {
            changed = true;
        }
        String audience = departmentSupport.classifyAudienceForRecord(r);
        if (!Objects.equals(audience, r.getAudienceType())) {
            r.setAudienceType(audience);
            changed = true;
        }
        if (changed) {
            dahuaSwingMapper.upsertRecord(r);
        }
        return changed;
    }

    private boolean recalculateAudienceOne(DahuaSwingRecord r) {
        if (r == null || !StringUtils.hasText(r.getRecordId())) {
            return false;
        }
        Dept dept = departmentSupport.resolveForClassification(r);
        boolean changed = false;
        if (StringUtils.hasText(dept.id()) && !dept.id().equals(r.getDepartmentId())) {
            r.setDepartmentId(dept.id());
            changed = true;
        }
        String mappedName = departmentSupport.mappedDepartmentName(dept);
        if (StringUtils.hasText(mappedName) && !mappedName.equals(r.getDepartmentName())) {
            r.setDepartmentName(mappedName);
            changed = true;
        }
        String audience = departmentSupport.classifyAudienceForRecord(r);
        if (!Objects.equals(audience, r.getAudienceType())) {
            r.setAudienceType(audience);
            changed = true;
        }
        if (changed) {
            dahuaSwingMapper.upsertRecord(r);
        }
        return changed;
    }
}
