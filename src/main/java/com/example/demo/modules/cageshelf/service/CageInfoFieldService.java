package com.example.demo.modules.cageshelf.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.cageshelf.entity.CageInfoField;
import com.example.demo.modules.cageshelf.mapper.CageInfoFieldMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 笼位字段字典 CRUD + 发布 + 码表列表。
 * 系统同步字段（syncSource 非空，由 ARO 映射播种）不可删除；自定义字段（syncSource 为空）可增删改。
 */
@Service
public class CageInfoFieldService {

    /** 存储类型（对齐 NHP crf_field.data_type，11 种）。 */
    private static final Set<String> DATA_TYPES = Set.of(
            "STRING", "TEXT", "INTEGER", "DECIMAL", "DATE", "DATETIME",
            "BOOLEAN", "ENUM", "ENUM_MULTI", "CALC", "FILE");

    /**
     * 字段角色（对齐 NHP FieldRole 语义，但取值引擎一律占位）：
     *  - VALUE   = 可手填 / 码表选择
     *  - DERIVED = 自动获取（只读）——派生引擎未接入，值仅可来自外部同步/后续接入
     *  - PK      = 取号（只读）——笼位自己的取号引擎未定，绝不调用 NHP 的取号器，暂为占位
     *  - FK      = 实体（只读）——实体选择器未接入，暂为占位
     */
    private static final Set<String> FIELD_ROLES = Set.of("VALUE", "DERIVED", "PK", "FK");

    private final CageInfoFieldMapper fieldMapper;
    private final CageFormAuditService auditService;

    public CageInfoFieldService(CageInfoFieldMapper fieldMapper, CageFormAuditService auditService) {
        this.fieldMapper = fieldMapper;
        this.auditService = auditService;
    }

    /** 全部字段（含自定义 + 系统同步），按 sort, id 升序。 */
    public List<CageInfoField> listAll() {
        return fieldMapper.selectAll();
    }

    /** 已发布字段。 */
    public List<CageInfoField> listPublished() {
        return fieldMapper.selectPublished();
    }

    /** 新建自定义字段：published=false、syncSource=null、role=VALUE。canonical 唯一必填。 */
    @Transactional
    public CageInfoField create(Map<String, Object> body, String operatorId) {
        String canonical = str(body, "canonical");
        String label = str(body, "label");
        String dataType = upper(str(body, "dataType"));
        String fieldType = lower(str(body, "fieldType"));
        String dictKey = str(body, "dictKey");
        String folder = str(body, "folder");
        String required = str(body, "required");
        String domainCode = upper(str(body, "domainCode"));
        String submoduleCode = upper(str(body, "submoduleCode"));
        String role = upper(str(body, "role"));
        Integer sort = toInt(body == null ? null : body.get("sort"));

        if (canonical == null || canonical.isBlank()) {
            throw new TwinBusinessException(400, "canonical 必填（字段规范名）");
        }
        if (label == null || label.isBlank()) {
            throw new TwinBusinessException(400, "label 必填（中文显示名）");
        }
        if (dataType == null || dataType.isBlank()) {
            throw new TwinBusinessException(400, "dataType 必填");
        }
        if (!DATA_TYPES.contains(dataType)) {
            throw new TwinBusinessException(400, "dataType 必须为 STRING/TEXT/INTEGER/DECIMAL/DATE/DATETIME/BOOLEAN/ENUM/ENUM_MULTI/CALC/FILE");
        }
        if (role != null && !FIELD_ROLES.contains(role)) {
            throw new TwinBusinessException(400, "role 必须为 VALUE（可填写）/ DERIVED（自动获取·占位）/ PK（取号·占位）/ FK（实体·占位）");
        }
        if (fieldMapper.selectByCanonical(canonical) != null) {
            throw new TwinBusinessException(409, "字段「" + canonical + "」已存在");
        }
        // 绑定码表的字段强制枚举存储类型
        String resolvedDictKey = blankToNull(dictKey);
        if (resolvedDictKey != null && ("STRING".equals(dataType) || "TEXT".equals(dataType))) {
            dataType = "ENUM";
        }
        if (fieldType == null || fieldType.isBlank()) {
            fieldType = defaultFieldType(dataType);
        }

        CageInfoField f = new CageInfoField();
        f.setCanonical(canonical);
        f.setLabel(label);
        f.setDataType(dataType);
        f.setFieldType(fieldType);
        f.setDictKey(resolvedDictKey);
        f.setFolder(blankToNull(folder));
        f.setDomainCode(domainCode);
        f.setSubmoduleCode(submoduleCode);
        f.setRequired(required == null || required.isBlank() ? "NO" : required);
        f.setSort(sort);
        f.setRole(role == null || role.isBlank() ? "VALUE" : role);
        f.setSyncSource(null);
        f.setPublished(false);
        f.setStatus("DRAFT");
        fieldMapper.insert(f);
        auditService.logDictChange("CREATE", "field", f.getId(), f.getCanonical(), f.getLabel(),
                null, snapshotField(f), operatorId);
        return f;
    }

    /** 更新可编辑字段：label/dataType/dictKey/required/sort/showWhen；不动 canonical/syncSource/published。 */
    @Transactional
    public CageInfoField update(Long id, Map<String, Object> body, String operatorId) {
        if (id == null) {
            throw new TwinBusinessException(400, "id 不能为空");
        }
        CageInfoField f = fieldMapper.selectById(id);
        if (f == null) {
            throw new TwinBusinessException(404, "字段不存在");
        }
        Map<String, Object> before = snapshotField(f);
        if (body == null) {
            return f;
        }

        if (body.containsKey("label")) {
            String label = str(body, "label");
            if (label == null || label.isBlank()) {
                throw new TwinBusinessException(400, "label 不能为空");
            }
            f.setLabel(label);
        }
        if (body.containsKey("dataType")) {
            String dataType = upper(str(body, "dataType"));
            if (dataType == null || dataType.isBlank()) {
                throw new TwinBusinessException(400, "dataType 不能为空");
            }
            if (!DATA_TYPES.contains(dataType)) {
                throw new TwinBusinessException(400, "dataType 必须为 STRING/TEXT/INTEGER/DECIMAL/DATE/DATETIME/BOOLEAN/ENUM/ENUM_MULTI/CALC/FILE");
            }
            f.setDataType(dataType);
        }
        if (body.containsKey("fieldType")) {
            f.setFieldType(blankToNull(lower(str(body, "fieldType"))));
        }
        if (body.containsKey("dictKey")) {
            String dictKey = blankToNull(str(body, "dictKey"));
            f.setDictKey(dictKey);
            // 绑定码表后强制枚举存储类型
            if (dictKey != null && ("STRING".equals(f.getDataType()) || "TEXT".equals(f.getDataType()))) {
                f.setDataType("ENUM");
                if (f.getFieldType() == null || f.getFieldType().isBlank()) {
                    f.setFieldType("select");
                }
            }
        }
        if (body.containsKey("folder")) {
            f.setFolder(blankToNull(str(body, "folder")));
        }
        if (body.containsKey("domainCode")) {
            f.setDomainCode(blankToNull(upper(str(body, "domainCode"))));
        }
        if (body.containsKey("submoduleCode")) {
            f.setSubmoduleCode(blankToNull(upper(str(body, "submoduleCode"))));
        }
        if (body.containsKey("required")) {
            String required = str(body, "required");
            f.setRequired(required == null || required.isBlank() ? "NO" : required);
        }
        if (body.containsKey("role")) {
            String role = upper(str(body, "role"));
            if (!FIELD_ROLES.contains(role)) {
                throw new TwinBusinessException(400, "role 必须为 VALUE（可填写）/ DERIVED（自动获取·占位）/ PK（取号·占位）/ FK（实体·占位）");
            }
            f.setRole(role);
        }
        if (body.containsKey("sort")) {
            f.setSort(toInt(body.get("sort")));
        }
        if (body.containsKey("showWhen")) {
            f.setShowWhen(blankToNull(str(body, "showWhen")));
        }
        fieldMapper.update(f);
        auditService.logDictChange("UPDATE", "field", f.getId(), f.getCanonical(), f.getLabel(),
                before, snapshotField(f), operatorId);
        return f;
    }

    /** 删除：仅自定义字段（syncSource 为空）；系统同步字段不可删除。 */
    @Transactional
    public void delete(Long id, String operatorId) {
        if (id == null) {
            throw new TwinBusinessException(400, "id 不能为空");
        }
        CageInfoField f = fieldMapper.selectById(id);
        if (f == null) {
            throw new TwinBusinessException(404, "字段不存在");
        }
        if (f.getSyncSource() != null && !f.getSyncSource().isBlank()) {
            throw new TwinBusinessException(400, "系统同步字段不可删除");
        }
        if ("FROZEN".equals(f.getStatus())) {
            throw new TwinBusinessException(409, "已冻结字段不可删除，请先解冻（或重新生成模板后删除）");
        }
        auditService.logDictChange("DELETE", "field", f.getId(), f.getCanonical(), f.getLabel(),
                snapshotField(f), null, operatorId);
        fieldMapper.deleteById(id);
    }

    /** 发布：指定 id 列表发布；空/null 则发布全部。返回受影响行数。 */
    @Transactional
    public int publish(List<Long> fieldIds, String operatorId) {
        int affected;
        if (fieldIds == null || fieldIds.isEmpty()) {
            affected = fieldMapper.markAllPublished();
        } else {
            affected = fieldMapper.markPublishedByIds(fieldIds);
        }
        if (affected > 0) {
            int publishedCount = fieldMapper.selectPublished().size();
            auditService.bumpFormVersion(CageFormAuditService.FORM_KEY_DEFAULT, publishedCount, operatorId);
        }
        return affected;
    }

    /** DRAFT → PENDING_REVIEW */
    @Transactional
    public void submitReview(Long id, String operatorId) {
        CageInfoField f = requireById(id);
        if (!"DRAFT".equals(f.getStatus())) {
            throw new TwinBusinessException(409, "仅草稿字段可提交校对");
        }
        fieldMapper.updateStatus(id, "PENDING_REVIEW");
        auditService.logDictChange("SUBMIT_REVIEW", "field", id, f.getCanonical(), f.getLabel(),
                Map.of("status", "DRAFT"), Map.of("status", "PENDING_REVIEW"), operatorId);
    }

    /** PENDING_REVIEW → FROZEN（发布，published=1 与 status 保持同步） */
    @Transactional
    public void approve(Long id, String operatorId) {
        CageInfoField f = requireById(id);
        if (!"PENDING_REVIEW".equals(f.getStatus())) {
            throw new TwinBusinessException(409, "仅待校对字段可通过");
        }
        fieldMapper.markPublishedByIds(List.of(id));
        auditService.logDictChange("APPROVE", "field", id, f.getCanonical(), f.getLabel(),
                Map.of("status", "PENDING_REVIEW"), Map.of("status", "FROZEN", "published", true), operatorId);
    }

    /** PENDING_REVIEW → DRAFT */
    @Transactional
    public void reject(Long id, String operatorId) {
        CageInfoField f = requireById(id);
        if (!"PENDING_REVIEW".equals(f.getStatus())) {
            throw new TwinBusinessException(409, "仅待校对字段可驳回");
        }
        fieldMapper.updateStatus(id, "DRAFT");
        auditService.logDictChange("REJECT", "field", id, f.getCanonical(), f.getLabel(),
                Map.of("status", "PENDING_REVIEW"), Map.of("status", "DRAFT"), operatorId);
    }

    /** FROZEN → DRAFT（解冻，published=0 与 status 保持同步） */
    @Transactional
    public void unfreeze(Long id, String operatorId) {
        CageInfoField f = requireById(id);
        if (!"FROZEN".equals(f.getStatus())) {
            throw new TwinBusinessException(409, "仅已冻结字段可解冻");
        }
        fieldMapper.markPublishedUnfrozenByIds(List.of(id));
        auditService.logDictChange("UNFREEZE", "field", id, f.getCanonical(), f.getLabel(),
                Map.of("status", "FROZEN"), Map.of("status", "DRAFT", "published", false), operatorId);
    }

    /** 批量解冻（FROZEN → DRAFT，published=0 同步）。 */
    @Transactional
    public int batchUnfreeze(List<Long> ids, String operatorId) {
        if (ids == null || ids.isEmpty()) {
            throw new TwinBusinessException(400, "fieldIds 不能为空");
        }
        List<Long> frozen = new java.util.ArrayList<>();
        for (Long id : ids) {
            CageInfoField f = fieldMapper.selectById(id);
            if (f != null && "FROZEN".equals(f.getStatus())) {
                frozen.add(id);
            }
        }
        if (frozen.isEmpty()) {
            return 0;
        }
        int n = fieldMapper.markPublishedUnfrozenByIds(frozen);
        auditService.logDictChange("BATCH_UNFREEZE", "field", null, null, null,
                null, Map.of("count", n), operatorId);
        return n;
    }

    private CageInfoField requireById(Long id) {
        CageInfoField f = fieldMapper.selectById(id);
        if (f == null) {
            throw new TwinBusinessException(404, "字段不存在");
        }
        return f;
    }

    private static Map<String, Object> snapshotField(CageInfoField f) {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("canonical", f.getCanonical());
        m.put("label", f.getLabel());
        m.put("dataType", f.getDataType());
        m.put("fieldType", f.getFieldType());
        m.put("dictKey", f.getDictKey());
        m.put("folder", f.getFolder());
        m.put("domainCode", f.getDomainCode());
        m.put("submoduleCode", f.getSubmoduleCode());
        m.put("required", f.getRequired());
        m.put("sort", f.getSort());
        m.put("role", f.getRole());
        m.put("published", f.getPublished());
        m.put("status", f.getStatus());
        return m;
    }

    private static String str(Map<String, Object> m, String k) {
        if (m == null) return null;
        Object v = m.get(k);
        return v == null ? null : String.valueOf(v).trim();
    }

    private static String blankToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private static String upper(String s) {
        return s == null ? null : s.toUpperCase();
    }

    private static String lower(String s) {
        return s == null ? null : s.toLowerCase();
    }

    /** dataType → 默认题型（对齐 NHP typeRegistry 的兼容映射） */
    private static String defaultFieldType(String dataType) {
        if (dataType == null) return "text";
        return switch (dataType.toUpperCase()) {
            case "INTEGER", "DECIMAL" -> "number";
            case "BOOLEAN" -> "checkbox";
            case "ENUM", "ENUM_MULTI" -> "select";
            case "DATE", "DATETIME" -> "date";
            case "TEXT" -> "textarea";
            case "FILE" -> "file";
            default -> "text";
        };
    }

    private static Integer toInt(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
