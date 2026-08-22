package com.example.demo.modules.nhp.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.entity.*;
import com.example.demo.modules.nhp.mapper.*;
import com.example.demo.modules.nhp.util.NhpAtomFormKeys;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** NHP 数据采集：研究对象/表单实例/EAV 值 upsert/签名/快照。双录入比对、物化宽表冻结二期实现。 */
@Service
public class NhpRecordService {

    /** 与种子/模板一致的默认研究编码（一期单研究）。 */
    static final String DEFAULT_STUDY_CODE = "NHP-XENO";

    /** 生命周期顺序：SCREENING → MATCHING → POST_TX → ENDPOINT（V2 业务流转） */
    private static final java.util.List<String> LIFECYCLE_ORDER =
            java.util.List.of("SCREENING", "MATCHING", "POST_TX", "ENDPOINT");

    private final CrfSubjectMapper subjectMapper;
    private final CrfRecordMapper recordMapper;
    private final CrfRecordValueMapper valueMapper;
    private final CrfDataAuditLogMapper auditLogMapper;
    private final CrfSignatureMapper signatureMapper;
    private final CrfFieldMapper fieldMapper;
    private final CrfCodelistItemMapper codelistItemMapper;
    private final CrfStudyMapper studyMapper;
    private final CrfFormMapper formMapper;
    private final CrfCenterMapper centerMapper;
    private final NhpIdService idService;
    private final NhpSnapshotService snapshotService;
    private final ObjectMapper objectMapper;
    private final NhpEventEngine eventEngine;

    public NhpRecordService(CrfSubjectMapper subjectMapper, CrfRecordMapper recordMapper,
                            CrfRecordValueMapper valueMapper, CrfDataAuditLogMapper auditLogMapper,
                            CrfSignatureMapper signatureMapper, CrfFieldMapper fieldMapper,
                            CrfCodelistItemMapper codelistItemMapper, CrfStudyMapper studyMapper,
                            CrfFormMapper formMapper, CrfCenterMapper centerMapper, NhpIdService idService,
                            NhpSnapshotService snapshotService, ObjectMapper objectMapper,
                            NhpEventEngine eventEngine) {
        this.subjectMapper = subjectMapper;
        this.recordMapper = recordMapper;
        this.valueMapper = valueMapper;
        this.auditLogMapper = auditLogMapper;
        this.signatureMapper = signatureMapper;
        this.fieldMapper = fieldMapper;
        this.codelistItemMapper = codelistItemMapper;
        this.studyMapper = studyMapper;
        this.formMapper = formMapper;
        this.centerMapper = centerMapper;
        this.idService = idService;
        this.snapshotService = snapshotService;
        this.objectMapper = objectMapper;
        this.eventEngine = eventEngine;
    }

    @Transactional
    public Result<CrfSubject> createSubject(Map<String, Object> body) {
        String subjectType = str(body.get("subjectType"));
        if (subjectType == null || (!"DONOR".equals(subjectType) && !"RECIPIENT".equals(subjectType))) {
            return Result.fail(400, "subjectType 须为 DONOR/RECIPIENT");
        }
        StudyResolve resolved = resolveStudy(body);
        if (resolved.studyId() == null) {
            return Result.fail(400, resolved.error());
        }
        Long studyId = resolved.studyId();
        // subjectCode 可选：未填时按 DON→DON / RECIPIENT→RCP 自动取号（22 §4.3）
        String subjectCode = str(body.get("subjectCode"));
        if (subjectCode == null || subjectCode.isBlank()) {
            try {
                subjectCode = allocateSubjectCode(subjectType, body);
            } catch (IllegalArgumentException ex) {
                return Result.fail(400, ex.getMessage());
            }
        } else {
            subjectCode = subjectCode.trim();
        }
        if (subjectMapper.findBySubjectCode(subjectCode) != null) {
            return Result.fail(400, "动物编号已存在: " + subjectCode);
        }
        CrfSubject s = new CrfSubject();
        s.setStudyId(studyId);
        s.setSubjectType(subjectType);
        s.setSubjectCode(subjectCode);
        s.setCenterId(asLong(body.get("centerId")));
        s.setDagId(asLong(body.get("dagId")));
        applyIdentityFields(s, body);
        s.setStatus("ACTIVE");
        subjectMapper.insert(s);
        return Result.success(s);
    }

    @Transactional
    public Result<CrfSubject> updateSubject(Long subjectId, Map<String, Object> body) {
        CrfSubject s = subjectMapper.findById(subjectId);
        if (s == null) {
            return Result.error("动物不存在");
        }
        if ("RETIRED".equals(s.getStatus())) {
            return Result.fail(400, "已删除（RETIRED）的动物不可修改");
        }
        if (body != null) {
            if (body.containsKey("centerId")) s.setCenterId(asLong(body.get("centerId")));
            if (body.containsKey("dagId")) s.setDagId(asLong(body.get("dagId")));
            applyIdentityFields(s, body);
        }
        subjectMapper.update(s);
        return Result.success(subjectMapper.findById(subjectId));
    }

    /** 推进研究对象生命周期阶段（只允许向前）。 */
    @Transactional
    public Result<CrfSubject> advanceStage(Long subjectId, Map<String, Object> body) {
        CrfSubject s = subjectMapper.findById(subjectId);
        if (s == null) {
            return Result.error("动物不存在");
        }
        String target = str(body == null ? null : body.get("targetStage"));
        if (target == null || target.isBlank()) {
            return Result.fail(400, "targetStage 必填");
        }
        target = target.trim().toUpperCase();
        String current = s.getLifecycleStage() == null ? null : s.getLifecycleStage().toUpperCase();
        int ti = LIFECYCLE_ORDER.indexOf(target);
        if (ti < 0) {
            return Result.fail(400, "未知阶段: " + target);
        }
        int ci = current == null || current.isBlank() ? -1 : LIFECYCLE_ORDER.indexOf(current);
        if (ci >= 0 && ti <= ci) {
            return Result.fail(400, "非法阶段推进：" + current + " → " + target);
        }
        subjectMapper.updateLifecycleStage(subjectId, target);
        s.setLifecycleStage(target);
        return Result.success(subjectMapper.findById(subjectId));
    }

    /**
     * 软删除表单实例（status=DELETED）。需 ADMIN；保留 EAV/审计/快照便于追溯。
     */
    @Transactional
    public Result<?> deleteRecord(Long recordId) {
        CrfRecord record = recordMapper.findById(recordId);
        if (record == null) {
            return Result.error("表单实例不存在");
        }
        if ("DELETED".equals(record.getStatus())) {
            return Result.success(null);
        }
        recordMapper.updateStatus(recordId, "DELETED");
        auditStage(recordId, null, "删除实例");
        return Result.success(null);
    }

    /**
     * 软删除研究对象（status=RETIRED）。
     * 默认若仍有未删除实例则拒绝；cascade=true 时先软删全部实例再退休对象。
     */
    @Transactional
    public Result<?> deleteSubject(Long subjectId, boolean cascade) {
        CrfSubject s = subjectMapper.findById(subjectId);
        if (s == null) {
            return Result.error("动物不存在");
        }
        if ("RETIRED".equals(s.getStatus())) {
            return Result.success(null);
        }
        long activeRecords = recordMapper.countActiveBySubjectId(subjectId);
        if (activeRecords > 0 && !cascade) {
            return Result.fail(400, "该动物下仍有 " + activeRecords
                    + " 个填写实例，请先删除实例，或使用 cascade=true 一并删除");
        }
        if (activeRecords > 0) {
            recordMapper.softDeleteBySubjectId(subjectId);
        }
        subjectMapper.updateStatus(subjectId, "RETIRED");
        return Result.success(null);
    }

    /** 从请求体写入身份标识列，并同步一份到 basicJson 便于兼容旧读法。 */
    private void applyIdentityFields(CrfSubject s, Map<String, Object> body) {
        if (body == null) return;
        if (body.containsKey("sex")) s.setSex(str(body.get("sex")));
        if (body.containsKey("birthDate")) s.setBirthDate(asDate(body.get("birthDate")));
        if (body.containsKey("species")) s.setSpecies(str(body.get("species")));
        if (body.containsKey("breed")) s.setBreed(str(body.get("breed")));
        if (body.containsKey("weightKg")) s.setWeightKg(asDecimal(body.get("weightKg")));
        if (body.containsKey("ageYears")) s.setAgeYears(asDecimal(body.get("ageYears")));
        if (body.containsKey("externalId")) s.setExternalId(str(body.get("externalId")));
        if (body.containsKey("microchipId")) s.setMicrochipId(str(body.get("microchipId")));
        if (body.containsKey("farmCode")) s.setFarmCode(str(body.get("farmCode")));
        if (body.containsKey("originNote")) s.setOriginNote(str(body.get("originNote")));
        if (body.containsKey("biocontainmentLevel")) s.setBiocontainmentLevel(str(body.get("biocontainmentLevel")));
        if (body.containsKey("pedigree")) s.setPedigree(str(body.get("pedigree")));
        if (body.containsKey("lifecycleStage")) s.setLifecycleStage(str(body.get("lifecycleStage")));
        if (body.containsKey("armCode")) s.setArmCode(str(body.get("armCode")));

        // 显式 basicJson 优先；否则用身份字段合成
        if (body.containsKey("basicJson") && body.get("basicJson") != null) {
            s.setBasicJson(toJson(body.get("basicJson")));
        } else {
            Map<String, Object> identity = new LinkedHashMap<>();
            if (s.getSex() != null) identity.put("sex", s.getSex());
            if (s.getBirthDate() != null) identity.put("birthDate", s.getBirthDate().toString());
            if (s.getSpecies() != null) identity.put("species", s.getSpecies());
            if (s.getBreed() != null) identity.put("breed", s.getBreed());
            if (s.getWeightKg() != null) identity.put("weightKg", s.getWeightKg());
            if (s.getAgeYears() != null) identity.put("ageYears", s.getAgeYears());
            if (s.getExternalId() != null) identity.put("externalId", s.getExternalId());
            if (s.getMicrochipId() != null) identity.put("microchipId", s.getMicrochipId());
            if (s.getFarmCode() != null) identity.put("farmCode", s.getFarmCode());
            if (s.getOriginNote() != null) identity.put("originNote", s.getOriginNote());
            if (s.getBiocontainmentLevel() != null) identity.put("biocontainmentLevel", s.getBiocontainmentLevel());
            if (s.getPedigree() != null) identity.put("pedigree", s.getPedigree());
            if (!identity.isEmpty()) {
                s.setBasicJson(toJson(identity));
            }
        }
    }

    @Transactional
    public Result<CrfRecord> createRecord(Long subjectId, Map<String, Object> body) {
        if (subjectMapper.findById(subjectId) == null) {
            return Result.error("动物不存在");
        }
        Long formId = asLong(body == null ? null : body.get("formId"));
        if (formId == null) {
            return Result.fail(400, "formId 不能为空");
        }
        CrfForm form = formMapper.findById(formId);
        if (form == null) {
            return Result.fail(400, "表单不存在: " + formId);
        }
        String formType = form.getFormType() == null ? "" : form.getFormType().trim().toUpperCase();
        boolean looksAtom = NhpAtomFormKeys.looksLikeAtomCode(form.getCode());
        // 非域码（如 nhp-crf）即使误标 DOMAIN 也视为组合；域码原子可作独立已发布表单开填
        boolean composite = "TEMPLATE".equals(formType) || "COMPOSITE".equals(formType) || !looksAtom;
        boolean atomForm = looksAtom && !composite
                && ("DOMAIN".equals(formType) || "MODULE".equals(formType)
                || "ATOM".equals(formType) || "PUBLIC".equals(formType) || formType.isEmpty());
        if (!composite && !atomForm) {
            return Result.fail(400, "仅已发布的「原子」或「组合」模板可创建填写实例。"
                    + " 当前 formType=" + (formType.isEmpty() ? "未知" : formType));
        }
        // 组合误标时自愈为 TEMPLATE；原子保持 DOMAIN/MODULE，勿改写成组合
        if (composite && !"TEMPLATE".equals(formType)) {
            form.setFormType("TEMPLATE");
            formMapper.update(form);
        }
        String formStatus = form.getStatus() == null ? "" : form.getStatus().trim().toUpperCase();
        // 原子或组合：仅已发布（FROZEN/PUBLISHED）可建填写实例
        if (!"FROZEN".equals(formStatus) && !"PUBLISHED".equals(formStatus)) {
            return Result.fail(400, "仅已发布（FROZEN/PUBLISHED）模板可创建填写实例，当前: "
                    + (formStatus.isEmpty() ? "未知" : formStatus)
                    + "。若列表头是草稿，请选已发布版（publishedFormId）或先发布。");
        }
        CrfRecord r = new CrfRecord();
        r.setSubjectId(subjectId);
        r.setFormId(formId);
        if (form.getVersion() != null) {
            r.setFormVersionId(form.getVersion().longValue());
        }
        r.setVisitInstanceId(asLong(body.get("visitInstanceId")));
        r.setStatus("DRAFT");
        r.setCreatedBy(str(body.get("createdBy")));
        recordMapper.insert(r);
        return Result.success(r);
    }

    /**
     * 解析 study_id：请求 studyId → studyCode → 默认 NHP-XENO → 唯一启用研究。
     */
    StudyResolve resolveStudy(Map<String, Object> body) {
        Long studyId = asLong(body == null ? null : body.get("studyId"));
        if (studyId != null) {
            if (studyMapper.findById(studyId) == null) {
                return StudyResolve.fail("studyId 不存在: " + studyId);
            }
            return StudyResolve.ok(studyId);
        }
        String studyCode = str(body == null ? null : body.get("studyCode"));
        if (studyCode != null) {
            CrfStudy byCode = studyMapper.findByCode(studyCode);
            if (byCode == null) {
                return StudyResolve.fail("studyCode 不存在: " + studyCode);
            }
            return StudyResolve.ok(byCode.getId());
        }
        CrfStudy defaults = studyMapper.findByCode(DEFAULT_STUDY_CODE);
        if (defaults != null) {
            return StudyResolve.ok(defaults.getId());
        }
        List<CrfStudy> active = studyMapper.list();
        if (active != null && active.size() == 1) {
            return StudyResolve.ok(active.get(0).getId());
        }
        return StudyResolve.fail("studyId 缺失且无法解析默认研究（请传 studyId/studyCode，或先种子化 " + DEFAULT_STUDY_CODE + "）");
    }

    record StudyResolve(Long studyId, String error) {
        static StudyResolve ok(Long id) { return new StudyResolve(id, null); }
        static StudyResolve fail(String msg) { return new StudyResolve(null, msg); }
    }

    /** 批量 upsert 字段值（EAV）：写 crf_record_value + 审计（before/after），同事务。 */
    @Transactional
    public Result<?> upsertValues(Long recordId, List<Map<String, Object>> values, String operatorId) {
        CrfRecord record = recordMapper.findById(recordId);
        if (record == null) {
            return Result.error("表单实例不存在");
        }
        if ("LOCKED".equals(record.getStatus())) {
            return Result.fail(400, "记录已锁定，不可修改");
        }
        int count = 0;
        if (values != null) {
            for (Map<String, Object> entry : values) {
                CrfField field = resolveField(entry);
                if (field == null) {
                    return Result.fail(400, "字段不存在: " + entry.get("fieldCode") + "/" + entry.get("fieldId"));
                }
                Object raw = entry.get("value");
                CrfRecordValue rv = valueMapper.findByRecordAndField(recordId, field.getId());
                String changeType;
                String before = rv == null ? null : primaryValue(rv);
                if (rv == null) {
                    rv = new CrfRecordValue();
                    rv.setRecordId(recordId);
                    rv.setFieldId(field.getId());
                    rv.setEntryMode(entry.get("entryMode") == null ? "MANUAL" : str(entry.get("entryMode")));
                    rv.setEntryPass(1);
                    rv.setSourceRef(str(entry.get("sourceRef")));
                    rv.setCollectedAt(asDateTime(entry.get("collectedAt")));
                    rv.setCreatedBy(operatorId);
                    changeType = "INSERT";
                } else {
                    rv.setUpdatedBy(operatorId);
                    if (rv.getEntryPass() == null) rv.setEntryPass(1);
                    changeType = "UPDATE";
                }
                if (applyValue(rv, field, raw)) {
                    if ("INSERT".equals(changeType)) {
                        valueMapper.insert(rv);
                    } else {
                        valueMapper.update(rv);
                    }
                    audit(recordId, field.getId(), changeType, before, primaryValue(rv), operatorId, "录入");
                    count++;
                }
            }
        }
        return Result.success(Map.of("saved", count));
    }

    /**
     * 双录入二录：写入 entry_pass=2 的 EAV 行（与一录隔离），并记审计。
     * body.values 同 upsert；可先清空再整批写入。
     */
    @Transactional
    public Result<?> doubleEntry(Long recordId, Map<String, Object> body) {
        CrfRecord record = recordMapper.findById(recordId);
        if (record == null) {
            return Result.error("表单实例不存在");
        }
        if ("LOCKED".equals(record.getStatus())) {
            return Result.fail(400, "记录已锁定，不可二录");
        }
        String operatorId = str(body == null ? null : body.get("operatorId"));
        Object values = body == null ? null : body.get("values");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> list = values instanceof List ? (List<Map<String, Object>>) values : null;
        boolean replace = body != null && Boolean.TRUE.equals(body.get("replace"));
        if (replace) {
            valueMapper.deleteByRecordIdAndPass(recordId, 2);
        }
        int count = 0;
        if (list != null) {
            for (Map<String, Object> entry : list) {
                CrfField field = resolveField(entry);
                if (field == null) {
                    return Result.fail(400, "字段不存在: " + entry.get("fieldCode") + "/" + entry.get("fieldId"));
                }
                Object raw = entry.get("value");
                CrfRecordValue rv = valueMapper.findByRecordFieldPass(recordId, field.getId(), 2);
                String changeType;
                String before = rv == null ? null : primaryValue(rv);
                if (rv == null) {
                    rv = new CrfRecordValue();
                    rv.setRecordId(recordId);
                    rv.setFieldId(field.getId());
                    rv.setEntryMode("MANUAL");
                    rv.setEntryPass(2);
                    rv.setCollectedAt(asDateTime(entry.get("collectedAt")));
                    rv.setCreatedBy(operatorId);
                    changeType = "INSERT";
                } else {
                    rv.setUpdatedBy(operatorId);
                    rv.setEntryPass(2);
                    changeType = "UPDATE";
                }
                if (applyValue(rv, field, raw)) {
                    if ("INSERT".equals(changeType)) {
                        valueMapper.insert(rv);
                    } else {
                        valueMapper.update(rv);
                    }
                    audit(recordId, field.getId(), changeType, before, primaryValue(rv), operatorId, "二录");
                    count++;
                }
            }
        }
        return Result.success(Map.of("saved", count, "entryPass", 2));
    }

    /** 两录差异比对：pass1（权威一录）vs pass2（二录）。 */
    public Result<?> compare(Long recordId) {
        if (recordMapper.findById(recordId) == null) {
            return Result.error("表单实例不存在");
        }
        Map<String, Object> pass1 = loadValueMap(recordId, 1);
        Map<String, Object> pass2 = loadValueMap(recordId, 2);
        java.util.Set<String> keys = new java.util.LinkedHashSet<>();
        keys.addAll(pass1.keySet());
        keys.addAll(pass2.keySet());
        List<Map<String, Object>> diffs = new java.util.ArrayList<>();
        for (String code : keys) {
            Object a = pass1.get(code);
            Object b = pass2.get(code);
            if (!valueEquals(a, b)) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("fieldCode", code);
                row.put("first", a);
                row.put("second", b);
                diffs.add(row);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("match", diffs.isEmpty());
        out.put("diffCount", diffs.size());
        out.put("firstCount", pass1.size());
        out.put("secondCount", pass2.size());
        out.put("diffs", diffs);
        return Result.success(out);
    }

    /** 研究对象分页列表。 */
    public Result<Map<String, Object>> listSubjects(String subjectType, String status, String q, int page, int size) {
        int p = Math.max(page, 1);
        int sz = Math.min(Math.max(size, 1), 100);
        int offset = (p - 1) * sz;
        String qq = blankToNull(q);
        String st = blankToNull(status);
        String typ = blankToNull(subjectType);
        List<CrfSubject> items = subjectMapper.listPaged(typ, st, qq, offset, sz);
        long total = subjectMapper.countPaged(typ, st, qq);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", total);
        out.put("page", p);
        out.put("size", sz);
        return Result.success(out);
    }

    /** 表单实例分页列表（可按研究对象/状态/关键词）。 */
    public Result<Map<String, Object>> listRecords(String status, Long subjectId, String q, int page, int size) {
        int p = Math.max(page, 1);
        int sz = Math.min(Math.max(size, 1), 100);
        int offset = (p - 1) * sz;
        String qq = blankToNull(q);
        String st = blankToNull(status);
        List<CrfRecord> records = recordMapper.listPaged(st, subjectId, qq, offset, sz);
        long total = recordMapper.countPaged(st, subjectId, qq);
        List<Map<String, Object>> items = new java.util.ArrayList<>();
        for (CrfRecord r : records) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("record", r);
            CrfSubject sub = subjectMapper.findById(r.getSubjectId());
            row.put("subject", sub);
            CrfForm form = formMapper.findById(r.getFormId());
            row.put("formCode", form == null ? null : form.getCode());
            row.put("formName", form == null ? null : form.getName());
            items.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", total);
        out.put("page", p);
        out.put("size", sz);
        return Result.success(out);
    }

    /**
     * 快照回退：先对当前值打可逆快照，再按目标快照 data_json 覆盖 EAV，状态回 DRAFT，写审计。
     * 已 LOCKED 不可回退（需先解锁流程，本期未开放）。
     */
    @Transactional
    public Result<Map<String, Object>> rollbackSnapshot(Long recordId, Long snapshotId, Map<String, Object> body) {
        CrfRecord record = recordMapper.findById(recordId);
        if (record == null) {
            return Result.error("表单实例不存在");
        }
        if ("LOCKED".equals(record.getStatus())) {
            return Result.fail(409, "已锁定记录不可回退快照");
        }
        CrfRecordSnapshot target = snapshotService.get(recordId, snapshotId);
        if (target == null) {
            return Result.error("快照不存在");
        }
        String operatorId = str(body == null ? null : body.get("operatorId"));
        String note = str(body == null ? null : body.get("note"));
        // 回退前保留当前状态快照（可逆）
        snapshotService.create(record, toJson(loadValueMap(recordId)),
                str(body == null ? null : body.get("bizStage")),
                note != null ? note : ("回退前备份 · 目标 v" + target.getVersionNo()),
                operatorId);
        // 覆盖 EAV：清空后按快照 JSON 重写一录
        valueMapper.deleteByRecordId(recordId);
        Map<String, Object> data = parseJsonMap(target.getDataJson());
        List<Map<String, Object>> values = new java.util.ArrayList<>();
        for (Map.Entry<String, Object> e : data.entrySet()) {
            if (e.getKey() == null || e.getKey().isBlank()) continue;
            if (e.getValue() == null) continue;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("fieldCode", e.getKey());
            item.put("value", e.getValue());
            values.add(item);
        }
        Result<?> upsert = upsertValues(recordId, values, operatorId);
        if (!Boolean.TRUE.equals(upsert.getSuccess())) {
            return Result.fail(upsert.getCode() == null ? 500 : upsert.getCode(),
                    upsert.getMessage() == null ? "回退写入失败" : upsert.getMessage());
        }
        // 修正审计：upsert 会记「录入」，追加一条回退总览
        recordMapper.updateStatus(recordId, "DRAFT");
        record.setStatus("DRAFT");
        auditStage(recordId, operatorId, "回退至快照 v" + target.getVersionNo());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("record", record);
        out.put("restoredFromSnapshotId", snapshotId);
        out.put("restoredVersionNo", target.getVersionNo());
        out.put("values", loadValueMap(recordId));
        out.put("snapshotCount", snapshotService.count(recordId));
        return Result.success(out);
    }

    @Transactional
    public Result<CrfSignature> sign(Long recordId, Map<String, Object> body) {
        CrfRecord record = recordMapper.findById(recordId);
        if (record == null) {
            return Result.error("表单实例不存在");
        }
        CrfSignature sig = new CrfSignature();
        sig.setRecordId(recordId);
        sig.setSignerId(str(body.get("signerId")));
        sig.setSignerRole(str(body.get("signerRole")));
        sig.setMeaning(str(body.get("meaning")));
        sig.setSignatureHash(str(body.get("signatureHash")));
        signatureMapper.insert(sig);
        // 签署驱动：REVIEWED（复核通过）状态下签署 → 推进 SIGNED（签署集齐）；LOCKED 不可再签
        if ("REVIEWED".equals(record.getStatus())) {
            recordMapper.updateStatus(recordId, "SIGNED");
            record.setStatus("SIGNED");
            snapshotService.create(record, toJson(loadValueMap(recordId)), null,
                    "签署集齐快照", str(body.get("signerId")));
        }
        return Result.success(sig);
    }

    public Result<Map<String, Object>> subjectDetail(Long subjectId) {
        CrfSubject s = subjectMapper.findById(subjectId);
        if (s == null) {
            return Result.error("研究对象不存在");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("subject", s);
        List<CrfRecord> records = recordMapper.listBySubjectId(subjectId);
        if (records != null) {
            records = records.stream()
                    .filter(r -> r.getStatus() == null || !"DELETED".equals(r.getStatus()))
                    .toList();
        }
        out.put("records", records);
        return Result.success(out);
    }

    /** 表单实例详情：记录 + 研究对象 + 当前值 map + 快照数。 */
    public Result<Map<String, Object>> recordDetail(Long recordId) {
        CrfRecord record = recordMapper.findById(recordId);
        if (record == null) {
            return Result.error("表单实例不存在");
        }
        CrfSubject subject = subjectMapper.findById(record.getSubjectId());
        CrfForm form = formMapper.findById(record.getFormId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("record", record);
        out.put("subject", subject);
        out.put("values", loadValueMap(recordId));
        out.put("snapshotCount", snapshotService.count(recordId));
        if (form != null) {
            out.put("formCode", form.getCode());
            out.put("formName", form.getName());
            out.put("formType", form.getFormType());
            out.put("formVersion", form.getVersion());
            out.put("formStatus", form.getStatus());
        }
        return Result.success(out);
    }

    /** fieldCode → 原始值（供前端续填）。 */
    public Result<Map<String, Object>> listValues(Long recordId) {
        return listValuesPass(recordId, 1);
    }

    public Result<Map<String, Object>> listValuesPass(Long recordId, int entryPass) {
        if (recordMapper.findById(recordId) == null) {
            return Result.error("表单实例不存在");
        }
        return Result.success(loadValueMap(recordId, entryPass));
    }

    /**
     * 更新记录状态（DRAFT→COMPLETE→REVIEWED→SIGNED→LOCKED，五态流转）。
     * COMPLETE=提交完成（沿用旧名，兼容存量）；REVIEWED=复核通过；SIGNED=签署集齐；LOCKED=锁定归档（终态）。
     * 进入 COMPLETE/REVIEWED/SIGNED/LOCKED 均打快照；LOCKED 不可回退；质疑走 crf_query（字段级），不设 record 级 QUERIED 态。
     */
    @Transactional
    public Result<CrfRecord> updateStatus(Long recordId, Map<String, Object> body) {
        CrfRecord record = recordMapper.findById(recordId);
        if (record == null) {
            return Result.error("表单实例不存在");
        }
        String status = str(body == null ? null : body.get("status"));
        if (status == null || !Set.of("DRAFT", "COMPLETE", "REVIEWED", "SIGNED", "LOCKED").contains(status)) {
            return Result.fail(400, "status 须为 DRAFT/COMPLETE/REVIEWED/SIGNED/LOCKED");
        }
        if ("LOCKED".equals(record.getStatus()) && !"LOCKED".equals(status)) {
            return Result.fail(400, "已锁定记录不可回退状态");
        }
        String operatorId = str(body == null ? null : body.get("operatorId"));
        String bizStage = str(body == null ? null : body.get("bizStage"));
        String note = str(body == null ? null : body.get("note"));
        recordMapper.updateStatus(recordId, status);
        record.setStatus(status);
        // 事件引擎：状态变更（非 DRAFT）触发下游（手术完成→展开术后随访待办等）
        if (!"DRAFT".equals(status)) {
            CrfForm form = formMapper.findById(record.getFormId());
            String atomCode = form == null ? null : form.getCode();
            if (atomCode != null && !atomCode.isBlank()) {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("subjectId", record.getSubjectId());
                payload.put("transplantId", record.getTransplantId());
                payload.put("triggerOn", "STATUS_CHANGED");
                payload.put("status", status);
                eventEngine.onEvent(atomCode, recordId, payload);
            }
        }
        if (!"DRAFT".equals(status)) {
            String dataJson = toJson(loadValueMap(recordId));
            snapshotService.create(record, dataJson, bizStage,
                    note != null ? note : statusNote(status),
                    operatorId);
            auditStage(recordId, operatorId, statusLabel(status));
        }
        return Result.success(record);
    }

    /** 状态快照默认注记 */
    private String statusNote(String status) {
        return switch (status) {
            case "COMPLETE" -> "提交完成快照";
            case "REVIEWED" -> "复核通过快照";
            case "SIGNED" -> "签署集齐快照";
            case "LOCKED" -> "数据锁定归档";
            default -> "状态变更快照";
        };
    }

    /** 状态审计标签 */
    private String statusLabel(String status) {
        return switch (status) {
            case "COMPLETE" -> "提交";
            case "REVIEWED" -> "复核";
            case "SIGNED" -> "签署";
            case "LOCKED" -> "锁定";
            default -> status;
        };
    }

    /** 手动创建不可变快照（当前 EAV 值）。 */
    @Transactional
    public Result<CrfRecordSnapshot> createSnapshot(Long recordId, Map<String, Object> body) {
        CrfRecord record = recordMapper.findById(recordId);
        if (record == null) {
            return Result.error("表单实例不存在");
        }
        String operatorId = str(body == null ? null : body.get("operatorId"));
        String bizStage = str(body == null ? null : body.get("bizStage"));
        String note = str(body == null ? null : body.get("note"));
        CrfRecordSnapshot snap = snapshotService.create(
                record, toJson(loadValueMap(recordId)), bizStage,
                note != null ? note : "手动快照", operatorId);
        auditStage(recordId, operatorId, "快照");
        return Result.success(snap);
    }

    public Result<List<CrfRecordSnapshot>> listSnapshots(Long recordId) {
        if (recordMapper.findById(recordId) == null) {
            return Result.error("表单实例不存在");
        }
        return Result.success(snapshotService.listLight(recordId));
    }

    public Result<CrfRecordSnapshot> getSnapshot(Long recordId, Long snapshotId) {
        CrfRecordSnapshot snap = snapshotService.get(recordId, snapshotId);
        if (snap == null) {
            return Result.error("快照不存在");
        }
        return Result.success(snap);
    }

    private Map<String, Object> loadValueMap(Long recordId) {
        return loadValueMap(recordId, 1);
    }

    private Map<String, Object> loadValueMap(Long recordId, int entryPass) {
        Map<String, Object> out = new LinkedHashMap<>();
        List<CrfRecordValue> rows = entryPass <= 1
                ? valueMapper.listByRecordId(recordId)
                : valueMapper.listByRecordIdAndPass(recordId, entryPass);
        for (CrfRecordValue rv : rows) {
            CrfField field = fieldMapper.findById(rv.getFieldId());
            if (field == null || field.getFieldCode() == null) continue;
            out.put(field.getFieldCode(), primaryValueObject(rv));
        }
        return out;
    }

    private boolean valueEquals(Object a, Object b) {
        if (a == null && b == null) return true;
        if (a == null || b == null) return false;
        return String.valueOf(a).equals(String.valueOf(b));
    }

    private Map<String, Object> parseJsonMap(String json) {
        if (json == null || json.isBlank()) return new LinkedHashMap<>();
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = objectMapper.readValue(json, Map.class);
            return m == null ? new LinkedHashMap<>() : new LinkedHashMap<>(m);
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
    }

    private String blankToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private Object primaryValueObject(CrfRecordValue rv) {
        if (rv.getValueString() != null) return rv.getValueString();
        if (rv.getValueText() != null) return rv.getValueText();
        if (rv.getValueInt() != null) return rv.getValueInt();
        if (rv.getValueDecimal() != null) return rv.getValueDecimal();
        if (rv.getValueDate() != null) return rv.getValueDate().toString();
        if (rv.getValueDatetime() != null) return rv.getValueDatetime().toString();
        if (rv.getValueBool() != null) return rv.getValueBool();
        if (rv.getCodelistItemId() != null) {
            CrfCodelistItem item = null;
            try {
                item = codelistItemMapper.findById(rv.getCodelistItemId());
            } catch (Exception ignored) {
                item = null;
            }
            if (item != null && item.getItemCode() != null) return item.getItemCode();
            return "item:" + rv.getCodelistItemId();
        }
        if (rv.getValueFileId() != null) return rv.getValueFileId();
        if (rv.getValueJson() != null) {
            try {
                return objectMapper.readValue(rv.getValueJson(), Object.class);
            } catch (Exception e) {
                return rv.getValueJson();
            }
        }
        return null;
    }

    /** 阶段类动作写入审计（field_id=0 表示记录级）。 */
    private void auditStage(Long recordId, String operatorId, String reason) {
        CrfDataAuditLog log = new CrfDataAuditLog();
        log.setRecordId(recordId);
        log.setFieldId(0L);
        log.setChangeType("UPDATE");
        log.setBeforeValue(null);
        log.setAfterValue(reason);
        log.setOperatorId(operatorId);
        log.setChangeReason(reason);
        auditLogMapper.insert(log);
    }

    /* ── 内部辅助 ── */

    /**
     * 未填 subjectCode 时按类型取号：DONOR→DON（基地码 FARM）、RECIPIENT→RCP（中心码 CENTER）。
     */
    private String allocateSubjectCode(String subjectType, Map<String, Object> body) {
        Map<String, Object> ctx = new LinkedHashMap<>();
        int year = LocalDate.now().getYear();
        ctx.put("year", year);
        if ("DONOR".equals(subjectType)) {
            String base = str(body.get("farmCode"));
            if (base == null) base = str(body.get("base"));
            if (base == null) {
                throw new IllegalArgumentException("自动取号需提供 farmCode（基地/FARM 码）");
            }
            ctx.put("base", base);
            ctx.put("farm", base);
            return idService.buildCode("DON", ctx);
        }
        String center = str(body.get("centerCode"));
        if (center == null) {
            Long centerId = asLong(body.get("centerId"));
            if (centerId != null) {
                CrfCenter c = centerMapper.findById(centerId);
                if (c != null) center = c.getCode();
            }
        }
        if (center == null) {
            throw new IllegalArgumentException("自动取号需提供 centerCode 或 centerId（中心/CENTER 码）");
        }
        ctx.put("center", center);
        ctx.put("centerCode", center);
        return idService.buildCode("RCP", ctx);
    }

    private CrfField resolveField(Map<String, Object> entry) {
        Long fieldId = asLong(entry.get("fieldId"));
        if (fieldId != null) {
            return fieldMapper.findById(fieldId);
        }
        String fieldCode = str(entry.get("fieldCode"));
        if (fieldCode != null) {
            return fieldMapper.findByFieldCode(fieldCode);
        }
        return null;
    }

    /** 按 data_type 把原始值路由到 EAV 类型化列；CALC 返回 false（派生不落库）。 */
    private boolean applyValue(CrfRecordValue rv, CrfField field, Object raw) {
        String type = field.getDataType();
        if (raw == null) {
            return true;
        }
        if ("CALC".equals(type)) {
            return false;
        }
        // 结构化字段（repeatGroup/table）：值为数组/对象 → value_json
        if (raw instanceof List || raw instanceof Map) {
            rv.setValueJson(toJson(raw));
            return true;
        }
        switch (type == null ? "STRING" : type) {
            case "TEXT" -> rv.setValueText(str(raw));
            case "INTEGER" -> rv.setValueInt(asInt(raw));
            case "DECIMAL" -> rv.setValueDecimal(asDecimal(raw));
            case "DATE" -> rv.setValueDate(asDate(raw));
            case "DATETIME" -> rv.setValueDatetime(asDateTime(raw));
            case "BOOLEAN" -> rv.setValueBool(asBool(raw));
            case "ENUM" -> {
                Long itemId = resolveCodelistItem(field.getCodelistId(), str(raw));
                if (itemId != null) {
                    rv.setCodelistItemId(itemId);
                } else {
                    rv.setValueString(str(raw));
                }
            }
            case "ENUM_MULTI" -> rv.setValueJson(toJson(raw));
            case "FILE" -> rv.setValueFileId(asLong(raw));
            default -> rv.setValueString(str(raw));
        }
        return true;
    }

    private Long resolveCodelistItem(Long codelistId, String itemCode) {
        if (codelistId == null || itemCode == null) {
            return null;
        }
        return codelistItemMapper.listByCodelistId(codelistId).stream()
                .filter(i -> itemCode.equals(i.getItemCode()))
                .map(CrfCodelistItem::getId)
                .findFirst().orElse(null);
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

    private String primaryValue(CrfRecordValue rv) {
        if (rv == null) return null;
        if (rv.getValueString() != null) return rv.getValueString();
        if (rv.getValueText() != null) return rv.getValueText();
        if (rv.getValueInt() != null) return String.valueOf(rv.getValueInt());
        if (rv.getValueDecimal() != null) return rv.getValueDecimal().toPlainString();
        if (rv.getValueDate() != null) return rv.getValueDate().toString();
        if (rv.getValueDatetime() != null) return rv.getValueDatetime().toString();
        if (rv.getValueBool() != null) return String.valueOf(rv.getValueBool());
        if (rv.getCodelistItemId() != null) return "item:" + rv.getCodelistItemId();
        return rv.getValueJson();
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

    private Integer asInt(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(v)); } catch (Exception e) { return null; }
    }

    private BigDecimal asDecimal(Object v) {
        if (v == null) return null;
        if (v instanceof BigDecimal b) return b;
        if (v instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
        try { return new BigDecimal(String.valueOf(v)); } catch (Exception e) { return null; }
    }

    private LocalDate asDate(Object v) {
        if (v == null) return null;
        if (v instanceof LocalDate d) return d;
        try { return LocalDate.parse(String.valueOf(v)); } catch (Exception e) { return null; }
    }

    private LocalDateTime asDateTime(Object v) {
        if (v == null) return null;
        if (v instanceof LocalDateTime dt) return dt;
        try { return LocalDateTime.parse(String.valueOf(v)); } catch (Exception e) { return null; }
    }

    private Boolean asBool(Object v) {
        if (v == null) return null;
        if (v instanceof Boolean b) return b;
        return "true".equalsIgnoreCase(String.valueOf(v)) || "1".equals(String.valueOf(v));
    }

    private String toJson(Object o) {
        try {
            return o == null ? null : objectMapper.writeValueAsString(o);
        } catch (Exception e) {
            return null;
        }
    }
}
