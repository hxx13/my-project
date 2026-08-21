package com.example.demo.modules.nhp.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.entity.CrfCodelist;
import com.example.demo.modules.nhp.entity.CrfDictChangeLog;
import com.example.demo.modules.nhp.entity.CrfField;
import com.example.demo.modules.nhp.entity.CrfForm;
import com.example.demo.modules.nhp.entity.CrfTemplateField;
import com.example.demo.modules.nhp.mapper.CrfCodelistMapper;
import com.example.demo.modules.nhp.mapper.CrfDictChangeLogMapper;
import com.example.demo.modules.nhp.mapper.CrfFieldMapper;
import com.example.demo.modules.nhp.mapper.CrfFormMapper;
import com.example.demo.modules.nhp.mapper.CrfRecordValueMapper;
import com.example.demo.modules.nhp.mapper.CrfTemplateFieldMapper;
import com.example.demo.modules.nhp.util.CodedIdOrder;
import com.example.demo.modules.nhp.util.NhpAtomFormKeys;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** NHP 字段字典：CRUD + 校对流（DRAFT→PENDING_REVIEW→FROZEN）+ 软删。 */
@Service
public class NhpFieldService {

    private final CrfFieldMapper fieldMapper;
    private final CrfDictChangeLogMapper changeLogMapper;
    private final CrfTemplateFieldMapper templateFieldMapper;
    private final CrfFormMapper formMapper;
    private final CrfCodelistMapper codelistMapper;
    private final CrfRecordValueMapper recordValueMapper;
    private final NhpFieldDictionaryService dictionaryService;
    private final ObjectMapper objectMapper;

    public NhpFieldService(CrfFieldMapper fieldMapper, CrfDictChangeLogMapper changeLogMapper,
                           CrfTemplateFieldMapper templateFieldMapper, CrfFormMapper formMapper,
                           CrfCodelistMapper codelistMapper, CrfRecordValueMapper recordValueMapper,
                           NhpFieldDictionaryService dictionaryService,
                           ObjectMapper objectMapper) {
        this.fieldMapper = fieldMapper;
        this.changeLogMapper = changeLogMapper;
        this.templateFieldMapper = templateFieldMapper;
        this.formMapper = formMapper;
        this.codelistMapper = codelistMapper;
        this.recordValueMapper = recordValueMapper;
        this.dictionaryService = dictionaryService;
        this.objectMapper = objectMapper;
    }

    public List<CrfField> list(String domain) {
        return list(domain, null, null);
    }

    private static final Comparator<CrfField> BY_FIELD_CODE = Comparator.comparing(
            f -> f.getFieldCode() == null ? "" : f.getFieldCode(), CodedIdOrder.COMPARATOR);

    /** 字段列表：可按字典套、域、或按码表 id 过滤。 */
    public List<CrfField> list(String domain, Long codelistId) {
        return list(domain, codelistId, null);
    }

    public List<CrfField> list(String domain, Long codelistId, Long dictionaryId) {
        List<CrfField> rows;
        if (codelistId != null) {
            rows = fieldMapper.listByCodelistId(codelistId);
            if (dictionaryId != null) {
                rows = rows.stream()
                        .filter(f -> dictionaryId.equals(f.getDictionaryId()))
                        .toList();
            }
        } else if (dictionaryId != null) {
            if (domain == null || domain.isBlank()) {
                rows = fieldMapper.listByDictionary(dictionaryId);
            } else {
                String domainCode = domain.trim();
                rows = fieldMapper.listByDictionary(dictionaryId).stream()
                        .filter(f -> NhpAtomFormKeys.fieldBelongsToDomain(f.getFieldCode(), domainCode))
                        .toList();
            }
        } else if (domain == null || domain.isBlank()) {
            rows = fieldMapper.list();
        } else {
            String domainCode = domain.trim();
            rows = fieldMapper.list().stream()
                    .filter(f -> NhpAtomFormKeys.fieldBelongsToDomain(f.getFieldCode(), domainCode))
                    .toList();
        }
        List<CrfField> ordered = new ArrayList<>(rows);
        ordered.sort(BY_FIELD_CODE);
        return ordered;
    }

    /** 查询字段在已发布/冻结模板中的使用（供删除前警告）。 */
    public List<Map<String, Object>> publishedTemplateUsage(Long fieldId) {
        CrfField cur = fieldMapper.findById(fieldId);
        if (cur == null || cur.getFieldCode() == null) {
            return List.of();
        }
        return publishedTemplatesForFieldKey(cur.getFieldCode());
    }

    @Transactional
    public Result<CrfField> create(CrfField field) {
        if (field.getFieldCode() == null || field.getFieldCode().isBlank()) {
            return Result.fail(400, "fieldCode 不能为空");
        }
        if (field.getNameEn() == null || field.getNameEn().isBlank()) {
            return Result.fail(400, "nameEn 不能为空");
        }
        if (field.getDictionaryId() == null) {
            var def = dictionaryService.resolveDefault();
            if (def != null) field.setDictionaryId(def.getId());
        }
        if (field.getDictionaryId() != null
                && fieldMapper.findByFieldCodeInDict(field.getDictionaryId(), field.getFieldCode()) != null) {
            return Result.fail(400, "该字典套内字段编码已存在");
        }
        if (field.getDictionaryId() == null && fieldMapper.findByFieldCode(field.getFieldCode()) != null) {
            return Result.fail(400, "字段编码已存在");
        }
        Result<?> structureCheck = dictionaryService.validateFieldBelongsToStructure(
                field.getDictionaryId(), field.getFieldCode().trim());
        if (structureCheck != null && !Boolean.TRUE.equals(structureCheck.getSuccess())) {
            return Result.fail(structureCheck.getCode() != null ? structureCheck.getCode() : 400,
                    structureCheck.getMessage());
        }
        if (field.getStatus() == null) {
            field.setStatus("DRAFT");
        }
        if (field.getVersion() == null) {
            field.setVersion(1);
        }
        if (field.getActive() == null) {
            field.setActive(true);
        }
        if (field.getCodelistId() != null) {
            Result<?> clCheck = validateCodelistBind(field.getCodelistId(), null);
            if (clCheck != null) {
                return Result.fail(clCheck.getCode() != null ? clCheck.getCode() : 400, clCheck.getMessage());
            }
        }
        fieldMapper.insert(field);
        logChange("field", field.getId(), "CREATE", null, field);
        return Result.success(field);
    }

    @Transactional
    public Result<?> update(Long fieldId, CrfField patch) {
        CrfField cur = fieldMapper.findById(fieldId);
        if (cur == null) {
            return Result.error("字段不存在");
        }
        if ("FROZEN".equals(cur.getStatus())) {
            return Result.fail(400, "已冻结字段不可编辑；无占用时可「解冻」回草稿，或新建版本后改");
        }
        if ("PENDING_REVIEW".equals(cur.getStatus())) {
            return Result.fail(400, "待校对字段不可编辑；请先驳回为草稿，或由校对人通过/驳回");
        }
        String before = toJson(cur);
        if (patch.getNameCn() != null) cur.setNameCn(patch.getNameCn());
        if (patch.getDataType() != null) cur.setDataType(patch.getDataType());
        if (patch.getUnit() != null) cur.setUnit(patch.getUnit());
        if (patch.getRequired() != null) cur.setRequired(patch.getRequired());
        if (patch.getCodelistId() != null) {
            Result<?> clCheck = validateCodelistBind(patch.getCodelistId(), cur.getCodelistId());
            if (clCheck != null) {
                return clCheck;
            }
            cur.setCodelistId(patch.getCodelistId());
        }
        if (patch.getDescription() != null) cur.setDescription(patch.getDescription());
        if (patch.getCalcExpression() != null) cur.setCalcExpression(patch.getCalcExpression());
        if (patch.getCdiscDomain() != null) cur.setCdiscDomain(patch.getCdiscDomain());
        if (patch.getCdiscVariable() != null) cur.setCdiscVariable(patch.getCdiscVariable());
        if (patch.getCdiscTestCode() != null) cur.setCdiscTestCode(patch.getCdiscTestCode());
        fieldMapper.update(cur);
        logChange("field", fieldId, "UPDATE", before, cur);
        return Result.success(cur);
    }

    /**
     * 新挂接须为已发布版本；保留当前绑定（可能是历史占用版）时允许原样回写。
     * 若该 code 有更新的 FROZEN，则新绑必须指向最新已发布版。
     */
    private Result<?> validateCodelistBind(Long newId, Long currentId) {
        if (newId == null || newId <= 0) {
            return null;
        }
        if (currentId != null && currentId.equals(newId)) {
            return null;
        }
        CrfCodelist cl = codelistMapper.findById(newId);
        if (cl == null || Boolean.FALSE.equals(cl.getActive())) {
            return Result.fail(400, "码表版本不存在");
        }
        String st = cl.getStatus() == null ? "" : cl.getStatus().toUpperCase();
        if (!"FROZEN".equals(st) && !"PUBLISHED".equals(st)) {
            return Result.fail(400, "仅可挂接已发布码表版本，当前 " + cl.getCode() + "@v" + cl.getVersion() + " 为 " + cl.getStatus());
        }
        for (CrfCodelist v : codelistMapper.listByCode(cl.getCode())) {
            String vs = v.getStatus() == null ? "" : v.getStatus().toUpperCase();
            if (("FROZEN".equals(vs) || "PUBLISHED".equals(vs))
                    && v.getVersion() != null && cl.getVersion() != null
                    && v.getVersion() > cl.getVersion()) {
                return Result.fail(400, "请挂接最新已发布版本 "
                        + cl.getCode() + "@v" + v.getVersion() + "（当前选择为 v" + cl.getVersion() + "）");
            }
        }
        return null;
    }

    @Transactional
    public Result<?> submitReview(Long fieldId) {
        CrfField cur = fieldMapper.findById(fieldId);
        if (cur == null) {
            return Result.error("字段不存在");
        }
        if (!"DRAFT".equals(cur.getStatus())) {
            return Result.fail(400, "仅 DRAFT 状态可提交校对，当前 " + cur.getStatus());
        }
        fieldMapper.updateStatus(fieldId, "PENDING_REVIEW");
        logChange("field", fieldId, "SUBMIT_REVIEW", "DRAFT", "PENDING_REVIEW", null, null);
        return Result.success(null);
    }

    /**
     * 校对通过：PENDING_REVIEW → FROZEN。
     * PI 身份标签尚未绑定时，由 content-manager ADMIN 代行校对。
     */
    @Transactional
    public Result<?> approveReview(Long fieldId, String operator, String comment) {
        CrfField cur = fieldMapper.findById(fieldId);
        if (cur == null) {
            return Result.error("字段不存在");
        }
        if (!"PENDING_REVIEW".equals(cur.getStatus())) {
            return Result.fail(400, "仅 PENDING_REVIEW 可校对通过，当前 " + cur.getStatus());
        }
        String op = (operator == null || operator.isBlank()) ? "unknown" : operator.trim();
        String note = comment == null ? "" : comment.trim();
        fieldMapper.updateFreeze(fieldId, "FROZEN", LocalDateTime.now(), op);
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("status", "FROZEN");
        after.put("frozenBy", op);
        after.put("comment", note);
        logChange("field", fieldId, "APPROVE_REVIEW", "PENDING_REVIEW", after, op, note);
        return Result.success(null);
    }

    /**
     * 校对驳回：PENDING_REVIEW → DRAFT（须填意见）。
     */
    @Transactional
    public Result<?> rejectReview(Long fieldId, String operator, String comment) {
        CrfField cur = fieldMapper.findById(fieldId);
        if (cur == null) {
            return Result.error("字段不存在");
        }
        if (!"PENDING_REVIEW".equals(cur.getStatus())) {
            return Result.fail(400, "仅 PENDING_REVIEW 可驳回，当前 " + cur.getStatus());
        }
        String op = (operator == null || operator.isBlank()) ? "unknown" : operator.trim();
        String note = comment == null ? "" : comment.trim();
        if (note.isEmpty()) {
            return Result.fail(400, "驳回须填写校对意见");
        }
        fieldMapper.clearFreeze(fieldId, "DRAFT");
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("status", "DRAFT");
        after.put("comment", note);
        logChange("field", fieldId, "REJECT_REVIEW", "PENDING_REVIEW", after, op, note);
        return Result.success(null);
    }

    /**
     * 解冻：FROZEN → DRAFT。无活跃填写取值、且未被已发布/冻结模板引用时可解冻。
     * 软删实例 / 软删模板不计占用。仍有占用时 409 并列出剩余引用。
     */
    @Transactional
    public Result<?> unfreeze(Long fieldId, String operator) {
        CrfField cur = fieldMapper.findById(fieldId);
        if (cur == null || Boolean.FALSE.equals(cur.getActive())) {
            return Result.error("字段不存在或已删除");
        }
        String st = cur.getStatus() == null ? "" : cur.getStatus().trim().toUpperCase();
        if (!"FROZEN".equals(st) && !"PUBLISHED".equals(st)) {
            return Result.fail(400, "仅已冻结字段可解冻，当前 " + cur.getStatus());
        }
        List<Map<String, Object>> templates = publishedTemplatesForFieldKey(cur.getFieldCode());
        long fills = recordValueMapper.countActiveByFieldId(fieldId);
        if (!templates.isEmpty() || fills > 0) {
            List<String> parts = new ArrayList<>();
            if (!templates.isEmpty()) {
                String titles = templates.stream()
                        .map(m -> String.valueOf(m.getOrDefault("title", m.get("formKey")))
                                + "(" + m.getOrDefault("formKey", "?") + ")")
                        .collect(Collectors.joining("、"));
                parts.add("已发布/冻结模板引用 " + templates.size() + " 个：" + titles);
            }
            if (fills > 0) {
                parts.add("活跃填写取值 " + fills + " 条（已软删实例不计）");
            }
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("templates", templates);
            data.put("activeFillValues", fills);
            Result<Map<String, Object>> blocked = Result.fail(409,
                    "无法解冻字段「" + (cur.getNameCn() != null ? cur.getNameCn() : cur.getFieldCode())
                            + "」——" + String.join("；", parts)
                            + "。清占用后再解冻，或保留冻结并用新编码演进。");
            blocked.setData(data);
            return blocked;
        }
        String op = (operator == null || operator.isBlank()) ? "unknown" : operator.trim();
        fieldMapper.clearFreeze(fieldId, "DRAFT");
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("status", "DRAFT");
        logChange("field", fieldId, "UNFREEZE", st, after, op, null);
        return Result.success(fieldMapper.findById(fieldId), "已解冻为草稿，可直接编辑");
    }

    /** 待校对队列（可按字典套过滤）。 */
    public List<CrfField> listPendingReview(Long dictionaryId) {
        List<CrfField> rows = dictionaryId != null
                ? fieldMapper.listByDictionary(dictionaryId)
                : fieldMapper.list();
        return rows.stream()
                .filter(f -> "PENDING_REVIEW".equals(f.getStatus()))
                .sorted(BY_FIELD_CODE)
                .toList();
    }

    /**
     * 软删字段。默认若在已发布/冻结模板中使用则拒绝；force=true 时仍删除但返回警告信息。
     */
    @Transactional
    public Result<?> delete(Long fieldId, boolean force) {
        CrfField cur = fieldMapper.findById(fieldId);
        if (cur == null || Boolean.FALSE.equals(cur.getActive())) {
            return Result.error("字段不存在");
        }
        List<Map<String, Object>> used = publishedTemplatesForFieldKey(cur.getFieldCode());
        if (!used.isEmpty() && !force) {
            String titles = used.stream()
                    .map(m -> String.valueOf(m.getOrDefault("title", m.get("formKey"))))
                    .collect(Collectors.joining("、"));
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("templates", used);
            data.put("requireForce", true);
            Result<Map<String, Object>> r = Result.fail(409, "该字段已在已发布模板中使用：" + titles + "。确认删除请传 force=true");
            r.setData(data);
            return r;
        }
        String before = toJson(cur);
        fieldMapper.softDelete(fieldId);
        logChange("field", fieldId, "DELETE", before, "RETIRED");
        if (!used.isEmpty()) {
            return Result.success(Map.of("warnedTemplates", used), "已删除（字段曾用于已发布模板）");
        }
        return Result.success(null);
    }

    private List<Map<String, Object>> publishedTemplatesForFieldKey(String fieldKey) {
        if (fieldKey == null || fieldKey.isBlank()) {
            return List.of();
        }
        List<CrfTemplateField> rows = templateFieldMapper.listByFieldKey(fieldKey);
        Set<Long> seen = new LinkedHashSet<>();
        List<Map<String, Object>> out = new ArrayList<>();
        for (CrfTemplateField tf : rows) {
            if (tf.getFormId() == null || !seen.add(tf.getFormId())) continue;
            CrfForm form = formMapper.findById(tf.getFormId());
            if (form == null || Boolean.FALSE.equals(form.getActive())) continue;
            String st = form.getStatus() == null ? "" : form.getStatus().toUpperCase();
            if (!"PUBLISHED".equals(st) && !"FROZEN".equals(st)) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("formId", form.getId());
            m.put("formKey", form.getCode());
            m.put("title", form.getName());
            m.put("status", form.getStatus());
            out.add(m);
        }
        return out;
    }

    private void logChange(String entity, Long entityId, String changeType, Object before, Object after) {
        logChange(entity, entityId, changeType, before, after, null, null);
    }

    private void logChange(String entity, Long entityId, String changeType, Object before, Object after,
                           String operator, String comment) {
        CrfDictChangeLog log = new CrfDictChangeLog();
        log.setEntity(entity);
        log.setEntityId(entityId);
        log.setChangeType(changeType);
        log.setBeforeJson(toJson(before));
        Object afterPayload = after;
        if (comment != null && !comment.isBlank()) {
            Map<String, Object> wrapped = new LinkedHashMap<>();
            wrapped.put("value", after);
            wrapped.put("comment", comment);
            afterPayload = wrapped;
        }
        log.setAfterJson(toJson(afterPayload));
        if (operator != null && !operator.isBlank()) {
            log.setOperator(operator);
        }
        changeLogMapper.insert(log);
    }

    private String toJson(Object o) {
        try {
            return o == null ? null : objectMapper.writeValueAsString(o);
        } catch (Exception e) {
            return null;
        }
    }
}
