package com.example.demo.modules.aup.service;

import com.example.demo.common.dto.Result;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.aup.dto.*;
import com.example.demo.modules.aup.entity.AupCompositeAtom;
import com.example.demo.modules.aup.entity.FormField;
import com.example.demo.modules.aup.entity.FormSection;
import com.example.demo.modules.aup.entity.FormSubsection;
import com.example.demo.modules.aup.entity.FormTemplate;
import com.example.demo.modules.aup.mapper.AupCompositeAtomMapper;
import com.example.demo.modules.aup.mapper.AupRecordMapper;
import com.example.demo.modules.aup.mapper.DictMapper;
import com.example.demo.modules.aup.mapper.FormFieldMapper;
import com.example.demo.modules.aup.mapper.FormSectionMapper;
import com.example.demo.modules.aup.mapper.FormSubsectionMapper;
import com.example.demo.modules.aup.mapper.FormTemplateMapper;
import com.example.demo.modules.aup.util.AupVersionAllocator;
import com.example.demo.modules.auth.entity.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** AUP 模板版本管理：新建草稿（深拷贝）、整树快照保存、发布冻结、原子域/组合域。 */
@Service
public class AupTemplateService {

    public static final String STATUS_DRAFT = "DRAFT";
    public static final String STATUS_PENDING_REVIEW = "PENDING_REVIEW";
    public static final String STATUS_PUBLISHED = "PUBLISHED";
    public static final String STATUS_ARCHIVED = "ARCHIVED";
    public static final String DEFAULT_FORM_KEY = "aup";
    public static final String KIND_PROTOCOL = "PROTOCOL";
    public static final String KIND_ATOM = "ATOM";
    public static final String KIND_COMPOSITE = "COMPOSITE";

    private static final Set<String> ALLOWED_FIELD_TYPES = Set.of(
            "text", "textarea", "number", "date", "dateRange", "time",
            "choice", "select", "checkbox", "cascade",
            "table", "group", "repeatGroup",
            "file", "image",
            "personPicker", "departmentPicker", "cagePicker", "animalPicker",
            "signature", "richText", "divider", "description"
    );

    private final FormTemplateMapper templateMapper;
    private final FormSectionMapper sectionMapper;
    private final FormSubsectionMapper subsectionMapper;
    private final FormFieldMapper fieldMapper;
    private final AupRecordMapper recordMapper;
    private final DictMapper dictMapper;
    private final AupCompositeAtomMapper compositeAtomMapper;
    private final AupConfigAuditService auditService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final JdbcTemplate jdbc;

    public AupTemplateService(FormTemplateMapper templateMapper,
                              FormSectionMapper sectionMapper,
                              FormSubsectionMapper subsectionMapper,
                              FormFieldMapper fieldMapper,
                              AupRecordMapper recordMapper,
                              DictMapper dictMapper,
                              AupCompositeAtomMapper compositeAtomMapper,
                              AupConfigAuditService auditService,
                              JdbcTemplate jdbc) {
        this.templateMapper = templateMapper;
        this.sectionMapper = sectionMapper;
        this.subsectionMapper = subsectionMapper;
        this.fieldMapper = fieldMapper;
        this.recordMapper = recordMapper;
        this.dictMapper = dictMapper;
        this.compositeAtomMapper = compositeAtomMapper;
        this.auditService = auditService;
        this.jdbc = jdbc;
    }

    /* ── 查询 ── */

    public List<TemplateVersionVO> listTemplates() {
        return listTemplates(null);
    }

    public List<TemplateVersionVO> listTemplates(String kind) {
        List<FormTemplate> list = (kind == null || kind.isBlank())
                ? templateMapper.listAll()
                : templateMapper.listByKind(kind.trim());
        return list.stream().map(this::toVersionVO).collect(Collectors.toList());
    }

    public TemplateDetailVO getPublished(String formKey) {
        return getPublished(formKey, KIND_PROTOCOL);
    }

    public TemplateDetailVO getPublished(String formKey, String kind) {
        String key = normalizeFormKey(formKey);
        FormTemplate t = templateMapper.findPublishedByFormKey(key);
        if (t == null) {
            return null;
        }
        if (kind != null && !kind.isBlank() && !kind.equalsIgnoreCase(t.getKind())) {
            return null;
        }
        return buildDetail(t);
    }

    public TemplateDetailVO resolve(String formKey, Integer version) {
        String key = normalizeFormKey(formKey);
        List<FormTemplate> list = templateMapper.listByFormKey(key);
        if (version == null) {
            return list.isEmpty() ? null : buildDetail(list.get(0));
        }
        return list.stream()
                .filter(t -> version.equals(t.getVersion()))
                .findFirst()
                .map(this::buildDetail)
                .orElse(null);
    }

    public TemplateDetailVO getDetail(Long id) {
        FormTemplate t = templateMapper.findById(id);
        return t == null ? null : buildDetail(t);
    }

    public List<TemplateVersionBriefVO> listVersions(Long id) {
        FormTemplate t = templateMapper.findById(id);
        if (t == null) return new ArrayList<>();
        return templateMapper.listByFormKey(t.getFormKey()).stream()
                .map(this::toBriefVO)
                .collect(Collectors.toList());
    }

    /* ── 写 ── */

    /**
     * 新建 DRAFT 版本：从上一 PUBLISHED（无则最新非空版本）深拷贝结构，version+1。
     */
    @Transactional
    public TemplateVersionBriefVO createDraft(TemplateCreateRequest req, User operator) {
        String formKey = normalizeFormKey(req.getFormKey());
        FormTemplate source = templateMapper.findPublishedByFormKey(formKey);
        if (source == null) {
            source = templateMapper.findLatestByFormKey(formKey);
        }
        boolean sourceEmpty = source == null || loadTree(source.getId()).isEmpty();

        int nextVersion = nextVersion(formKey);

        FormTemplate t = new FormTemplate();
        t.setFormKey(formKey);
        t.setKind(KIND_PROTOCOL);
        t.setOrigin("USER");
        if (isBlank(req.getName())) {
            t.setName(source != null ? source.getName() : formKey);
        } else {
            t.setName(req.getName().trim());
        }
        t.setVersion(nextVersion);
        t.setStatus(STATUS_DRAFT);
        t.setDescription(source != null ? source.getDescription() : null);
        t.setCreatedBy(uid(operator));
        templateMapper.insert(t);

        if (!sourceEmpty && source != null) {
            List<SectionVO> copyTree = loadTree(source.getId());
            if (copyTree != null && !copyTree.isEmpty()) {
                rebuildTree(t.getId(), copyTree);
            }
        }
        auditService.log("template", t.getId(), t.getFormKey(), t.getName(), "CREATE", null, t, operator, null);
        return toBriefVO(t);
    }

    /** 整树快照式保存：后端全量重建 sections/subsections/fields。仅 DRAFT 可改（发布冻结）。 */
    @Transactional
    public Result<TemplateDetailVO> saveTree(Long id, TemplateSaveRequest req, User operator) {
        FormTemplate t = templateMapper.findById(id);
        if (t == null) {
            return Result.error("模板不存在");
        }
        // 发布即冻结：仅 DRAFT 允许整树保存；PUBLISHED/ARCHIVED 只读，需先复制为草稿
        if (STATUS_PUBLISHED.equals(t.getStatus())) {
            throw new TwinBusinessException(409, "已发布版本不可编辑，请先复制为草稿");
        }
        if (STATUS_ARCHIVED.equals(t.getStatus())) {
            throw new TwinBusinessException(409, "归档版本不可编辑，请先复制为草稿");
        }
        if (req.getName() != null && !req.getName().isBlank()) {
            t.setName(req.getName().trim());
        }
        if (req.getDescription() != null) {
            t.setDescription(req.getDescription());
        }
        templateMapper.update(t);

        rebuildTree(id, req.getSections());

        auditService.log("template", t.getId(), t.getFormKey(), t.getName(), "UPDATE", null, null, operator, "saveTree");
        return Result.success(buildDetail(templateMapper.findById(id)));
    }

    /** 该 formKey 是否已存在任意版本（种子幂等判断用）。 */
    public boolean hasTemplates(String formKey) {
        return templateMapper.findMaxVersionByFormKey(normalizeFormKey(formKey)) > 0;
    }

    /**
     * 删除版本（含整树结构）。
     * 允许删除已发布版本；删除时级联删除该模板下「同步（aro）/ 演示（demo）」计划书，
     * 但若仍有「本地填写」计划书则拒绝（本地数据无法复原，不可删除）。
     */
    @Transactional
    public Result<Void> deleteDraft(Long id, User operator) {
        FormTemplate t = templateMapper.findById(id);
        if (t == null) {
            return Result.error("模板不存在");
        }
        // 本地填写的计划书不可删除（同步可再拉取、demo 可再种子，本地则无法复原）
        int localRefs = recordMapper.countLocalRecords(id);
        if (localRefs > 0) {
            throw new TwinBusinessException(409, "该模板下还有 " + localRefs + " 份本地填写的计划书，禁止删除（仅同步/demo 可级联删除）");
        }
        // 级联删除同步/demo 计划书：先删子表，再删主记录
        List<Long> deletableIds = recordMapper.listDeletableRecordIds(id);
        if (!deletableIds.isEmpty()) {
            for (Long aupId : deletableIds) {
                deleteRecordRelated(aupId);
            }
            recordMapper.deleteByIds(deletableIds);
        }
        deleteTree(id);
        templateMapper.deleteById(id);
        auditService.log("template", id, t.getFormKey(), t.getName(), "DELETE", t, null, operator, null);
        return Result.success(null);
    }

    /** 删除计划书相关子表（aup_data / snapshot / review / assignment / audit_log / review_item）。 */
    private void deleteRecordRelated(long aupId) {
        jdbc.update("DELETE FROM aup_review_item WHERE aup_id = ?", aupId);
        jdbc.update("DELETE FROM aup_review WHERE aup_id = ?", aupId);
        jdbc.update("DELETE FROM aup_review_assignment WHERE aup_id = ?", aupId);
        jdbc.update("DELETE FROM aup_audit_log WHERE aup_id = ?", aupId);
        jdbc.update("DELETE FROM aup_snapshot WHERE aup_id = ?", aupId);
        jdbc.update("DELETE FROM aup_data WHERE aup_id = ?", aupId);
    }

    /** 归档：已发布版本 → ARCHIVED（不再对填写人生效）。 */
    @Transactional
    public Result<Void> archive(Long id, User operator) {
        FormTemplate t = templateMapper.findById(id);
        if (t == null) {
            return Result.error("模板不存在");
        }
        if (!STATUS_PUBLISHED.equals(t.getStatus())) {
            return Result.fail(400, "仅已发布版本可归档");
        }
        templateMapper.archive(id);
        auditService.log("template", id, t.getFormKey(), t.getName(), "ARCHIVE",
                Map.of("status", STATUS_PUBLISHED), Map.of("status", STATUS_ARCHIVED), operator, null);
        return Result.success(null);
    }

    /** 复制版本为新的 DRAFT（深拷贝整树结构，名称加「副本」后缀）。 */
    @Transactional
    public Result<TemplateVersionBriefVO> copy(Long id, User operator) {
        FormTemplate source = templateMapper.findById(id);
        if (source == null) {
            return Result.error("模板不存在");
        }
        String formKey = source.getFormKey();
        int nextVersion = nextVersion(formKey);

        FormTemplate t = new FormTemplate();
        t.setFormKey(formKey);
        t.setKind(source.getKind() != null ? source.getKind() : KIND_PROTOCOL);
        t.setOrigin("USER");
        t.setFolderId(source.getFolderId());
        t.setName((source.getName() == null ? "未命名" : source.getName()) + "（副本）");
        t.setVersion(nextVersion);
        t.setStatus(STATUS_DRAFT);
        t.setDescription(source.getDescription());
        t.setCreatedBy(uid(operator));
        templateMapper.insert(t);

        List<SectionVO> copyTree = loadTree(source.getId());
        if (copyTree != null && !copyTree.isEmpty()) {
            rebuildTree(t.getId(), copyTree);
        }
        auditService.log("template", t.getId(), t.getFormKey(), t.getName(), "NEW_VERSION", null, t, operator, null);
        return Result.success(toBriefVO(t));
    }

    /** 仅更新名称/描述（不触碰结构树）。 */
    @Transactional
    public Result<TemplateDetailVO> updateMeta(Long id, String name, String description, User operator) {
        FormTemplate t = templateMapper.findById(id);
        if (t == null) {
            return Result.error("模板不存在");
        }
        if (name != null && !name.isBlank()) {
            t.setName(name.trim());
        }
        if (description != null) {
            t.setDescription(description);
        }
        templateMapper.update(t);
        auditService.log("template", t.getId(), t.getFormKey(), t.getName(), "UPDATE", null, null, operator, "updateMeta");
        return Result.success(buildDetail(t));
    }

    private void deleteTree(Long templateId) {
        List<FormSection> existingSections = sectionMapper.listByTemplateId(templateId);
        List<Long> sectionIds = existingSections.stream().map(FormSection::getId).collect(Collectors.toList());
        List<Long> subsectionIds = new ArrayList<>();
        if (!sectionIds.isEmpty()) {
            subsectionIds = subsectionMapper.listBySectionIds(sectionIds).stream()
                    .map(FormSubsection::getId).collect(Collectors.toList());
        }
        if (!sectionIds.isEmpty()) fieldMapper.deleteBySectionIds(sectionIds);
        if (!subsectionIds.isEmpty()) fieldMapper.deleteBySubsectionIds(subsectionIds);
        if (!subsectionIds.isEmpty()) subsectionMapper.deleteBySectionIds(sectionIds);
        sectionMapper.deleteByTemplateId(templateId);
    }

    /** 发布：本版本置 PUBLISHED + published_at，同 form_key 上一 PUBLISHED 置 ARCHIVED，并回填字段 dict_version。 */
    @Transactional
    public Result<TemplateVersionBriefVO> publish(Long id, User operator) {
        FormTemplate t = templateMapper.findById(id);
        if (t == null) {
            return Result.error("模板不存在");
        }
        if (STATUS_PUBLISHED.equals(t.getStatus())) {
            return Result.fail(400, "该版本已发布");
        }
        if (STATUS_ARCHIVED.equals(t.getStatus())) {
            return Result.fail(400, "归档版本不可发布");
        }
        lintBeforePublish(id);
        backfillDictVersions(id);
        LocalDateTime now = LocalDateTime.now();
        templateMapper.publish(id, now);
        templateMapper.archivePublished(t.getFormKey(), id);

        t.setStatus(STATUS_PUBLISHED);
        t.setPublishedAt(now);
        auditService.log("template", t.getId(), t.getFormKey(), t.getName(), "APPROVE",
                null, Map.of("status", STATUS_PUBLISHED), operator, null);
        return Result.success(toBriefVO(t));
    }

    /** 发布前回填：dict_key 非空且 dict_version 为空的字段，钉住该 dict_key 当前 PUBLISHED 版本号。 */
    private void backfillDictVersions(Long templateId) {
        List<FormSection> sections = sectionMapper.listByTemplateId(templateId);
        if (sections == null || sections.isEmpty()) {
            return;
        }
        List<Long> sectionIds = sections.stream().map(FormSection::getId).collect(Collectors.toList());
        List<Long> subsectionIds = subsectionMapper.listBySectionIds(sectionIds).stream()
                .map(FormSubsection::getId).collect(Collectors.toList());
        List<FormField> fields = new ArrayList<>(fieldMapper.listBySectionIds(sectionIds));
        if (!subsectionIds.isEmpty()) {
            fields.addAll(fieldMapper.listBySubsectionIds(subsectionIds));
        }
        for (FormField f : fields) {
            if (StringUtils.hasText(f.getDictKey()) && f.getDictVersion() == null) {
                Integer pv = dictMapper.findPublishedVersionByKey(f.getDictKey().trim());
                if (pv != null) {
                    fieldMapper.updateDictVersion(f.getId(), pv);
                }
            }
        }
    }

    /** 发布前 schema 校验：重复 fieldKey、字典引用、字段基本结构。 */
    private void lintBeforePublish(Long templateId) {
        List<SectionVO> sections = loadTree(templateId);
        if (sections == null || sections.isEmpty()) {
            throw new TwinBusinessException(400, "模板至少包含一个大段");
        }
        Set<String> fieldKeys = new HashSet<>();
        List<String> errors = new ArrayList<>();
        for (int i = 0; i < sections.size(); i++) {
            SectionVO section = sections.get(i);
            String sectionPath = "大段[" + i + "]";
            if (isBlank(section.getCode())) {
                errors.add(sectionPath + " 缺少 code");
            }
            if (isBlank(section.getLabel())) {
                errors.add(sectionPath + " 缺少 label");
            }
            List<SubsectionVO> subs = section.getSubsections();
            if (subs != null && !subs.isEmpty()) {
                for (int j = 0; j < subs.size(); j++) {
                    SubsectionVO sub = subs.get(j);
                    String subPath = sectionPath + "/小章节[" + j + "]";
                    if (isBlank(sub.getCode())) {
                        errors.add(subPath + " 缺少 code");
                    }
                    if (isBlank(sub.getLabel())) {
                        errors.add(subPath + " 缺少 label");
                    }
                    lintFields(sub.getFields(), subPath, fieldKeys, errors);
                }
            } else {
                lintFields(section.getFields(), sectionPath, fieldKeys, errors);
            }
        }
        if (!errors.isEmpty()) {
            throw new TwinBusinessException(400, "模板校验未通过：" + String.join("；", errors));
        }
    }

    private void lintFields(List<FieldVO> fields, String parentPath, Set<String> fieldKeys, List<String> errors) {
        if (fields == null || fields.isEmpty()) {
            return;
        }
        for (int i = 0; i < fields.size(); i++) {
            FieldVO field = fields.get(i);
            if (field == null) {
                continue;
            }
            String path = parentPath + "/字段[" + i + "]";
            if (isBlank(field.getFieldKey())) {
                errors.add(path + " 缺少 fieldKey");
            } else if (!fieldKeys.add(field.getFieldKey())) {
                errors.add("重复的 fieldKey: " + field.getFieldKey());
            }
            if (isBlank(field.getLabel())) {
                errors.add(path + " 缺少 label");
            }
            if (isBlank(field.getType())) {
                errors.add(path + " 缺少 type");
            } else if (!ALLOWED_FIELD_TYPES.contains(field.getType().trim())) {
                errors.add(path + " 字段类型非法: " + field.getType());
            }
            if (StringUtils.hasText(field.getDictKey()) && dictMapper.findByKey(field.getDictKey().trim()) == null) {
                errors.add(path + " 引用的字典不存在: " + field.getDictKey());
            }
            lintNestedConfigFields(field.getConfig(), path, fieldKeys, errors);
        }
    }

    @SuppressWarnings("unchecked")
    private void lintNestedConfigFields(Object config, String parentPath, Set<String> fieldKeys, List<String> errors) {
        if (!(config instanceof Map<?, ?> cfg)) {
            return;
        }
        for (String nestKey : List.of("columns", "fields")) {
            Object nested = cfg.get(nestKey);
            if (!(nested instanceof List<?> list)) {
                continue;
            }
            for (int i = 0; i < list.size(); i++) {
                Object item = list.get(i);
                if (!(item instanceof Map<?, ?> m)) {
                    continue;
                }
                String path = parentPath + "/" + nestKey + "[" + i + "]";
                Object fk = m.get("fieldKey");
                if (fk == null || String.valueOf(fk).isBlank()) {
                    errors.add(path + " 缺少 fieldKey");
                } else {
                    String key = String.valueOf(fk).trim();
                    if (!fieldKeys.add(key)) {
                        errors.add("重复的 fieldKey: " + key);
                    }
                }
                Object label = m.get("label");
                if (label == null || String.valueOf(label).isBlank()) {
                    errors.add(path + " 缺少 label");
                }
                Object type = m.get("type");
                if (type == null || String.valueOf(type).isBlank()) {
                    errors.add(path + " 缺少 type");
                } else if (!ALLOWED_FIELD_TYPES.contains(String.valueOf(type).trim())) {
                    errors.add(path + " 字段类型非法: " + type);
                }
                Object dictKey = m.get("dictKey");
                if (dictKey != null && StringUtils.hasText(String.valueOf(dictKey))) {
                    String dk = String.valueOf(dictKey).trim();
                    if (dictMapper.findByKey(dk) == null) {
                        errors.add(path + " 引用的字典不存在: " + dk);
                    }
                }
            }
        }
    }

    /* ── 原子域 / 组合域 / 状态机 ── */

    @Transactional
    public Result<TemplateVersionBriefVO> createAtom(AtomCreateRequest req, User operator) {
        String formKey = req.getFormKey() != null && !req.getFormKey().isBlank()
                ? req.getFormKey().trim()
                : "atom:" + (isBlank(req.getCode()) ? (isBlank(req.getName()) ? "unnamed" : req.getName()) : req.getCode());
        if (templateMapper.findMaxVersionByFormKey(formKey) > 0) {
            return Result.fail(400, "该原子域 formKey 已存在");
        }
        String name = isBlank(req.getName()) ? formKey : req.getName().trim();
        FormTemplate t = new FormTemplate();
        t.setFormKey(formKey);
        t.setKind(KIND_ATOM);
        t.setOrigin("USER");
        t.setFolderId(req.getFolderId());
        t.setName(name);
        t.setVersion(1);
        t.setStatus(STATUS_DRAFT);
        t.setDescription(req.getDescription());
        t.setCreatedBy(uid(operator));
        templateMapper.insert(t);

        FormSection sec = new FormSection();
        sec.setTemplateId(t.getId());
        sec.setCode(isBlank(req.getCode()) ? "G1" : req.getCode().trim());
        sec.setLabel(name);
        sec.setSortOrder(0);
        sec.setSubdivisible(false);
        sectionMapper.insert(sec);

        auditService.log("template", t.getId(), formKey, name, "CREATE", null, t, operator, null);
        return Result.success(toBriefVO(t));
    }

    @Transactional
    public Result<TemplateVersionBriefVO> compose(ComposeRequest req, User operator) {
        if (req.getAtoms() == null || req.getAtoms().isEmpty()) {
            return Result.fail(400, "组合域至少需要引用一个原子域");
        }
        String formKey = req.getFormKey() != null && !req.getFormKey().isBlank()
                ? req.getFormKey().trim()
                : "composite:" + (isBlank(req.getName()) ? "unnamed" : req.getName());
        if (templateMapper.findMaxVersionByFormKey(formKey) > 0) {
            return Result.fail(400, "该组合域 formKey 已存在");
        }
        String name = isBlank(req.getName()) ? formKey : req.getName().trim();
        FormTemplate t = new FormTemplate();
        t.setFormKey(formKey);
        t.setKind(KIND_COMPOSITE);
        t.setOrigin("COMPOSED");
        t.setFolderId(req.getFolderId());
        t.setName(name);
        t.setVersion(1);
        t.setStatus(STATUS_DRAFT);
        t.setDescription(req.getDescription());
        t.setCreatedBy(uid(operator));
        templateMapper.insert(t);

        List<SectionVO> combined = new ArrayList<>();
        int sort = 0;
        for (AtomRef ref : req.getAtoms()) {
            FormTemplate atom = templateMapper.findById(ref.getAtomTemplateId());
            if (atom == null || !KIND_ATOM.equals(atom.getKind())) {
                continue;
            }
            List<SectionVO> sections = loadTree(atom.getId());
            if (sections != null && !sections.isEmpty()) {
                for (SectionVO s : sections) {
                    s.setSortOrder(sort++);
                }
                combined.addAll(sections);
            }
            AupCompositeAtom ca = new AupCompositeAtom();
            ca.setCompositeTemplateId(t.getId());
            ca.setAtomFormKey(atom.getFormKey());
            ca.setAtomTemplateId(atom.getId());
            ca.setSortOrder(sort);
            compositeAtomMapper.insert(ca);
        }
        if (!combined.isEmpty()) {
            rebuildTree(t.getId(), combined);
        }
        auditService.log("template", t.getId(), formKey, name, "CREATE", null, t, operator, null);
        return Result.success(toBriefVO(t));
    }

    @Transactional
    public Result<TemplateDetailVO> importAtoms(Long id, ImportAtomsRequest req, User operator) {
        FormTemplate t = templateMapper.findById(id);
        if (t == null) {
            return Result.error("模板不存在");
        }
        if (!STATUS_DRAFT.equals(t.getStatus())) {
            return Result.fail(400, "仅草稿状态可导入原子域");
        }
        if (req.getAtomTemplateIds() == null || req.getAtomTemplateIds().isEmpty()) {
            return Result.fail(400, "未指定原子域");
        }
        List<SectionVO> existing = loadTree(id);
        int sort = existing.size();
        for (Long atomId : req.getAtomTemplateIds()) {
            FormTemplate atom = templateMapper.findById(atomId);
            if (atom == null || !KIND_ATOM.equals(atom.getKind())) {
                continue;
            }
            List<SectionVO> sections = loadTree(atomId);
            if (sections != null && !sections.isEmpty()) {
                for (SectionVO s : sections) {
                    s.setSortOrder(sort++);
                }
                existing.addAll(sections);
            }
        }
        rebuildTree(id, existing);
        auditService.log("template", id, t.getFormKey(), t.getName(), "UPDATE", null, null, operator, "import-atoms");
        return Result.success(buildDetail(templateMapper.findById(id)));
    }

    @Transactional
    public Result<Void> submitReview(Long id, User operator) {
        FormTemplate t = templateMapper.findById(id);
        if (t == null) {
            return Result.error("模板不存在");
        }
        if (!STATUS_DRAFT.equals(t.getStatus())) {
            return Result.fail(400, "仅草稿状态可提交审核");
        }
        if (loadTree(id).isEmpty()) {
            return Result.fail(400, "模板至少包含一个大段");
        }
        t.setStatus(STATUS_PENDING_REVIEW);
        t.setSubmittedAt(LocalDateTime.now());
        templateMapper.update(t);
        auditService.log("template", id, t.getFormKey(), t.getName(), "SUBMIT_REVIEW",
                Map.of("status", STATUS_DRAFT), Map.of("status", STATUS_PENDING_REVIEW), operator, null);
        return Result.success(null);
    }

    @Transactional
    public Result<Void> reject(Long id, String comment, User operator) {
        FormTemplate t = templateMapper.findById(id);
        if (t == null) {
            return Result.error("模板不存在");
        }
        if (!STATUS_PENDING_REVIEW.equals(t.getStatus())) {
            return Result.fail(400, "仅待审核状态可驳回");
        }
        if (comment == null || comment.isBlank()) {
            return Result.fail(400, "驳回意见必填");
        }
        t.setStatus(STATUS_DRAFT);
        t.setReviewComment(comment.trim());
        templateMapper.update(t);
        auditService.log("template", id, t.getFormKey(), t.getName(), "REJECT",
                Map.of("status", STATUS_PENDING_REVIEW), Map.of("status", STATUS_DRAFT), operator, comment);
        return Result.success(null);
    }

    @Transactional
    public Result<Void> unfreeze(Long id, User operator) {
        FormTemplate t = templateMapper.findById(id);
        if (t == null) {
            return Result.error("模板不存在");
        }
        if (!STATUS_PUBLISHED.equals(t.getStatus())) {
            return Result.fail(400, "仅已发布状态可解冻");
        }
        if (KIND_ATOM.equals(t.getKind())) {
            int pinned = compositeAtomMapper.countByAtomTemplateId(id);
            if (pinned > 0) {
                return Result.fail(400, "该原子域被 " + pinned + " 个组合域钉住，无法解冻");
            }
        }
        if (KIND_PROTOCOL.equals(t.getKind())) {
            int localRefs = recordMapper.countLocalRecords(id);
            if (localRefs > 0) {
                return Result.fail(400, "该模板下还有 " + localRefs + " 份本地填写的计划书，无法解冻");
            }
        }
        t.setStatus(STATUS_DRAFT);
        templateMapper.update(t);
        auditService.log("template", id, t.getFormKey(), t.getName(), "UNFREEZE",
                Map.of("status", STATUS_PUBLISHED), Map.of("status", STATUS_DRAFT), operator, null);
        return Result.success(null);
    }

    public TemplateUsageVO usage(Long id) {
        FormTemplate t = templateMapper.findById(id);
        TemplateUsageVO vo = new TemplateUsageVO();
        if (t == null) {
            return vo;
        }
        vo.setTemplateId(t.getId());
        vo.setFormKey(t.getFormKey());
        vo.setName(t.getName());
        vo.setVersion(t.getVersion());
        vo.setKind(t.getKind());
        List<TemplateUsageRef> refs = new ArrayList<>();
        if (KIND_ATOM.equals(t.getKind())) {
            for (AupCompositeAtom ca : compositeAtomMapper.listByAtomTemplateId(id)) {
                FormTemplate composite = templateMapper.findById(ca.getCompositeTemplateId());
                TemplateUsageRef r = new TemplateUsageRef();
                r.setCompositeTemplateId(ca.getCompositeTemplateId());
                r.setAtomFormKey(ca.getAtomFormKey());
                if (composite != null) {
                    r.setCompositeFormKey(composite.getFormKey());
                    r.setCompositeName(composite.getName());
                    r.setCompositeVersion(composite.getVersion());
                }
                refs.add(r);
            }
        }
        vo.setRefCount(refs.size());
        vo.setRefs(refs);
        return vo;
    }

    private String uid(User u) {
        return u != null ? u.getId() : null;
    }

    /** 版号补位：取该 formKey 下已占用版本号之外的最小正整数（不无限自增）。 */
    private int nextVersion(String formKey) {
        List<Integer> used = templateMapper.listByFormKey(formKey).stream()
                .map(FormTemplate::getVersion)
                .collect(Collectors.toList());
        return AupVersionAllocator.nextAvailable(used);
    }

    /* ── 树加载 / 重建 ── */

    private TemplateDetailVO buildDetail(FormTemplate t) {
        TemplateDetailVO vo = new TemplateDetailVO();
        vo.setId(t.getId());
        vo.setFormKey(t.getFormKey());
        vo.setKind(t.getKind());
        vo.setFolderId(t.getFolderId());
        vo.setName(t.getName());
        vo.setVersion(t.getVersion());
        vo.setStatus(t.getStatus());
        vo.setDescription(t.getDescription());
        vo.setPublishedAt(t.getPublishedAt());
        vo.setSubmittedAt(t.getSubmittedAt());
        vo.setReviewComment(t.getReviewComment());
        vo.setUpdatedAt(t.getUpdatedAt());
        vo.setSections(loadTree(t.getId()));
        return vo;
    }

    private List<SectionVO> loadTree(Long templateId) {
        List<FormSection> sections = sectionMapper.listByTemplateId(templateId);
        if (sections == null || sections.isEmpty()) {
            return new ArrayList<>();
        }
        List<Long> sectionIds = sections.stream().map(FormSection::getId).collect(Collectors.toList());
        List<FormSubsection> subsections = subsectionMapper.listBySectionIds(sectionIds);
        Map<Long, List<FormSubsection>> subsBySection =
                subsections.stream().collect(Collectors.groupingBy(FormSubsection::getSectionId));
        List<FormField> directFields = fieldMapper.listBySectionIds(sectionIds);
        Map<Long, List<FormField>> fieldsBySection =
                directFields.stream().collect(Collectors.groupingBy(FormField::getSectionId));

        List<SectionVO> result = new ArrayList<>();
        for (FormSection s : sections) {
            SectionVO sv = new SectionVO();
            sv.setId(s.getId());
            sv.setCode(s.getCode());
            sv.setLabel(s.getLabel());
            sv.setSortOrder(s.getSortOrder());
            sv.setSubdivisible(s.getSubdivisible());
            sv.setShowWhen(fromJson(s.getShowWhen()));
            sv.setHighlight(s.getHighlight());

            List<FormSubsection> subList = subsBySection.get(s.getId());
            if (subList != null && !subList.isEmpty()) {
                List<Long> subIds = subList.stream().map(FormSubsection::getId).collect(Collectors.toList());
                List<FormField> subFields = fieldMapper.listBySubsectionIds(subIds);
                Map<Long, List<FormField>> fieldsBySub =
                        subFields.stream().collect(Collectors.groupingBy(FormField::getSubsectionId));
                List<SubsectionVO> subVOs = new ArrayList<>();
                for (FormSubsection sub : subList) {
                    SubsectionVO subVO = new SubsectionVO();
                    subVO.setId(sub.getId());
                    subVO.setCode(sub.getCode());
                    subVO.setLabel(sub.getLabel());
                    subVO.setSortOrder(sub.getSortOrder());
                    subVO.setDescription(sub.getDescription());
                    subVO.setDescriptionTone(sub.getDescriptionTone());
                    subVO.setShowWhen(fromJson(sub.getShowWhen()));
                    subVO.setFields(toFieldVOs(fieldsBySub.get(sub.getId())));
                    subVOs.add(subVO);
                }
                sv.setSubsections(subVOs);
            }
            sv.setFields(toFieldVOs(fieldsBySection.get(s.getId())));
            result.add(sv);
        }
        return result;
    }

    private void rebuildTree(Long templateId, List<SectionVO> sections) {
        // 1. 清空旧结构（先字段，再小章节，再大段）
        List<FormSection> existingSections = sectionMapper.listByTemplateId(templateId);
        List<Long> sectionIds = existingSections.stream().map(FormSection::getId).collect(Collectors.toList());
        List<Long> subsectionIds = new ArrayList<>();
        if (!sectionIds.isEmpty()) {
            subsectionIds = subsectionMapper.listBySectionIds(sectionIds).stream()
                    .map(FormSubsection::getId).collect(Collectors.toList());
        }
        if (!sectionIds.isEmpty()) fieldMapper.deleteBySectionIds(sectionIds);
        if (!subsectionIds.isEmpty()) fieldMapper.deleteBySubsectionIds(subsectionIds);
        if (!subsectionIds.isEmpty()) subsectionMapper.deleteBySectionIds(sectionIds);
        sectionMapper.deleteByTemplateId(templateId);

        // 2. 全量重建
        if (sections == null || sections.isEmpty()) {
            return;
        }
        int si = 0;
        for (SectionVO sv : sections) {
            FormSection sec = new FormSection();
            sec.setTemplateId(templateId);
            sec.setCode(sv.getCode());
            sec.setLabel(sv.getLabel());
            sec.setSortOrder(sv.getSortOrder() != null ? sv.getSortOrder() : si);
            sec.setSubdivisible(Boolean.TRUE.equals(sv.getSubdivisible()));
            sec.setShowWhen(toJson(sv.getShowWhen()));
            sec.setHighlight(Boolean.TRUE.equals(sv.getHighlight()));
            sectionMapper.insert(sec);

            List<SubsectionVO> subVOs = sv.getSubsections();
            if (Boolean.TRUE.equals(sv.getSubdivisible()) && subVOs != null && !subVOs.isEmpty()) {
                int subi = 0;
                for (SubsectionVO subVO : subVOs) {
                    FormSubsection sub = new FormSubsection();
                    sub.setSectionId(sec.getId());
                    sub.setCode(subVO.getCode());
                    sub.setLabel(subVO.getLabel());
                    sub.setSortOrder(subVO.getSortOrder() != null ? subVO.getSortOrder() : subi);
                    sub.setDescription(subVO.getDescription());
                    sub.setDescriptionTone(subVO.getDescriptionTone());
                    sub.setShowWhen(toJson(subVO.getShowWhen()));
                    subsectionMapper.insert(sub);
                    insertFields(subVO.getFields(), null, sub.getId());
                    subi++;
                }
            } else {
                insertFields(sv.getFields(), sec.getId(), null);
            }
            si++;
        }
    }

    private void insertFields(List<FieldVO> fields, Long sectionId, Long subsectionId) {
        if (fields == null || fields.isEmpty()) {
            return;
        }
        int fi = 0;
        for (FieldVO fv : fields) {
            FormField f = new FormField();
            f.setSectionId(sectionId);
            f.setSubsectionId(subsectionId);
            f.setFieldKey(fv.getFieldKey());
            f.setLabel(fv.getLabel());
            f.setDescription(fv.getDescription());
            f.setType(fv.getType());
            f.setOptions(toJson(fv.getOptions()));
            f.setDictKey(fv.getDictKey());
            f.setRequired(Boolean.TRUE.equals(fv.getRequired()));
            f.setShowWhen(toJson(fv.getShowWhen()));
            f.setSortOrder(fv.getSortOrder() != null ? fv.getSortOrder() : fi);
            f.setConfig(toJson(fv.getConfig()));
            fieldMapper.insert(f);
            fi++;
        }
    }

    /* ── 视图转换 ── */

    private List<FieldVO> toFieldVOs(List<FormField> fields) {
        if (fields == null || fields.isEmpty()) {
            return new ArrayList<>();
        }
        List<FieldVO> list = new ArrayList<>();
        for (FormField f : fields) {
            FieldVO fv = new FieldVO();
            fv.setId(f.getId());
            fv.setFieldKey(f.getFieldKey());
            fv.setLabel(f.getLabel());
            fv.setDescription(f.getDescription());
            fv.setType(f.getType());
            fv.setOptions(fromJson(f.getOptions()));
            fv.setDictKey(f.getDictKey());
            fv.setRequired(f.getRequired());
            fv.setShowWhen(fromJson(f.getShowWhen()));
            fv.setSortOrder(f.getSortOrder());
            fv.setConfig(fromJson(f.getConfig()));
            list.add(fv);
        }
        return list;
    }

    private TemplateVersionVO toVersionVO(FormTemplate t) {
        TemplateVersionVO v = new TemplateVersionVO();
        v.setId(t.getId());
        v.setFormKey(t.getFormKey());
        v.setKind(t.getKind());
        v.setFolderId(t.getFolderId());
        v.setName(t.getName());
        v.setDescription(t.getDescription());
        v.setVersion(t.getVersion());
        v.setStatus(t.getStatus());
        v.setPublishedAt(t.getPublishedAt());
        v.setSubmittedAt(t.getSubmittedAt());
        v.setReviewComment(t.getReviewComment());
        v.setUpdatedAt(t.getUpdatedAt());
        v.setUpdatedBy(t.getCreatedBy());
        return v;
    }

    private TemplateVersionBriefVO toBriefVO(FormTemplate t) {
        TemplateVersionBriefVO v = new TemplateVersionBriefVO();
        v.setId(t.getId());
        v.setKind(t.getKind());
        v.setVersion(t.getVersion());
        v.setStatus(t.getStatus());
        v.setPublishedAt(t.getPublishedAt());
        return v;
    }

    /* ── JSON 工具（JSON 列以 String 存储，Service 用 Jackson 转换） ── */

    private String toJson(Object o) {
        if (o == null) {
            return null;
        }
        if (o instanceof String s) {
            return s;
        }
        try {
            return objectMapper.writeValueAsString(o);
        } catch (Exception e) {
            return String.valueOf(o);
        }
    }

    private Object fromJson(String s) {
        if (s == null || s.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(s, Object.class);
        } catch (Exception e) {
            return s;
        }
    }

    private String normalizeFormKey(String formKey) {
        return isBlank(formKey) ? DEFAULT_FORM_KEY : formKey.trim();
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
