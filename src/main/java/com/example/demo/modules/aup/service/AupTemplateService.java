package com.example.demo.modules.aup.service;

import com.example.demo.common.dto.Result;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.aup.dto.*;
import com.example.demo.modules.aup.entity.FormField;
import com.example.demo.modules.aup.entity.FormSection;
import com.example.demo.modules.aup.entity.FormSubsection;
import com.example.demo.modules.aup.entity.FormTemplate;
import com.example.demo.modules.aup.mapper.AupRecordMapper;
import com.example.demo.modules.aup.mapper.FormFieldMapper;
import com.example.demo.modules.aup.mapper.FormSectionMapper;
import com.example.demo.modules.aup.mapper.FormSubsectionMapper;
import com.example.demo.modules.aup.mapper.FormTemplateMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** AUP 模板版本管理：新建草稿（深拷贝）、整树快照保存、发布冻结。 */
@Service
public class AupTemplateService {

    public static final String STATUS_DRAFT = "DRAFT";
    public static final String STATUS_PUBLISHED = "PUBLISHED";
    public static final String STATUS_ARCHIVED = "ARCHIVED";
    public static final String DEFAULT_FORM_KEY = "aup";

    private final FormTemplateMapper templateMapper;
    private final FormSectionMapper sectionMapper;
    private final FormSubsectionMapper subsectionMapper;
    private final FormFieldMapper fieldMapper;
    private final AupRecordMapper recordMapper;
    private final ObjectProvider<AupDefaultTemplateSeeder> defaultSeederProvider;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final JdbcTemplate jdbc;

    public AupTemplateService(FormTemplateMapper templateMapper,
                              FormSectionMapper sectionMapper,
                              FormSubsectionMapper subsectionMapper,
                              FormFieldMapper fieldMapper,
                              AupRecordMapper recordMapper,
                              ObjectProvider<AupDefaultTemplateSeeder> defaultSeederProvider,
                              JdbcTemplate jdbc) {
        this.templateMapper = templateMapper;
        this.sectionMapper = sectionMapper;
        this.subsectionMapper = subsectionMapper;
        this.fieldMapper = fieldMapper;
        this.recordMapper = recordMapper;
        this.defaultSeederProvider = defaultSeederProvider;
        this.jdbc = jdbc;
    }

    /* ── 查询 ── */

    public List<TemplateVersionVO> listTemplates() {
        return templateMapper.listAll().stream().map(this::toVersionVO).collect(Collectors.toList());
    }

    public TemplateDetailVO getPublished(String formKey) {
        String key = normalizeFormKey(formKey);
        FormTemplate t = templateMapper.findPublishedByFormKey(key);
        return t == null ? null : buildDetail(t);
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
     * 拷贝源为空 / 不存在时回退内置种子——保证「新建草稿」不丢失初始默认配置。
     */
    @Transactional
    public TemplateVersionBriefVO createDraft(TemplateCreateRequest req, String userId) {
        String formKey = normalizeFormKey(req.getFormKey());
        FormTemplate source = templateMapper.findPublishedByFormKey(formKey);
        if (source == null) {
            source = templateMapper.findLatestByFormKey(formKey);
        }
        boolean sourceEmpty = source == null || loadTree(source.getId()).isEmpty();

        TemplateSaveRequest seed = null;
        if (sourceEmpty) {
            AupDefaultTemplateSeeder seeder = defaultSeederProvider.getIfAvailable();
            if (seeder != null) {
                seed = seeder.loadSeedRequest();
            }
        }

        int nextVersion = templateMapper.findMaxVersionByFormKey(formKey) + 1;

        FormTemplate t = new FormTemplate();
        t.setFormKey(formKey);
        if (isBlank(req.getName())) {
            String fromSeed = seed != null ? seed.getName() : null;
            t.setName(isBlank(fromSeed) ? (source != null ? source.getName() : formKey) : fromSeed.trim());
        } else {
            t.setName(req.getName().trim());
        }
        t.setVersion(nextVersion);
        t.setStatus(STATUS_DRAFT);
        t.setDescription(sourceEmpty && seed != null ? seed.getDescription() : (source != null ? source.getDescription() : null));
        t.setCreatedBy(userId);
        templateMapper.insert(t);

        List<SectionVO> copyTree;
        if (!sourceEmpty && source != null) {
            copyTree = loadTree(source.getId());
        } else if (seed != null) {
            copyTree = seed.getSections();
        } else {
            copyTree = null;
        }
        if (copyTree != null && !copyTree.isEmpty()) {
            rebuildTree(t.getId(), copyTree);
        }
        return toBriefVO(t);
    }

    /** 整树快照式保存：后端全量重建 sections/subsections/fields。仅 DRAFT 可改（发布冻结）。 */
    @Transactional
    public Result<TemplateDetailVO> saveTree(Long id, TemplateSaveRequest req) {
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
    public Result<Void> deleteDraft(Long id) {
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
    public Result<Void> archive(Long id) {
        FormTemplate t = templateMapper.findById(id);
        if (t == null) {
            return Result.error("模板不存在");
        }
        if (!STATUS_PUBLISHED.equals(t.getStatus())) {
            return Result.fail(400, "仅已发布版本可归档");
        }
        templateMapper.archive(id);
        return Result.success(null);
    }

    /** 复制版本为新的 DRAFT（深拷贝整树结构，名称加「副本」后缀）。 */
    @Transactional
    public Result<TemplateVersionBriefVO> copy(Long id, String userId) {
        FormTemplate source = templateMapper.findById(id);
        if (source == null) {
            return Result.error("模板不存在");
        }
        String formKey = source.getFormKey();
        int nextVersion = templateMapper.findMaxVersionByFormKey(formKey) + 1;

        FormTemplate t = new FormTemplate();
        t.setFormKey(formKey);
        t.setName((source.getName() == null ? "未命名" : source.getName()) + "（副本）");
        t.setVersion(nextVersion);
        t.setStatus(STATUS_DRAFT);
        t.setDescription(source.getDescription());
        t.setCreatedBy(userId);
        templateMapper.insert(t);

        List<SectionVO> copyTree = loadTree(source.getId());
        if (copyTree != null && !copyTree.isEmpty()) {
            rebuildTree(t.getId(), copyTree);
        }
        return Result.success(toBriefVO(t));
    }

    /** 仅更新名称/描述（不触碰结构树）。 */
    @Transactional
    public Result<TemplateDetailVO> updateMeta(Long id, String name, String description) {
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

    /**
     * 环境变量/默认资源种子：仅当该 formKey 尚无任何版本时写入一个 v1 DRAFT。
     * 幂等——已在调用侧（AupDefaultTemplateSeeder）与这里双重校验。
     * @return true 表示本次执行了种子写入
     */
    @Transactional
    public boolean seedDefault(String formKey, String name, String description, List<SectionVO> sections) {
        String key = normalizeFormKey(formKey);
        if (templateMapper.findMaxVersionByFormKey(key) > 0) {
            return false;
        }
        if (sections == null || sections.isEmpty()) {
            return false;
        }
        FormTemplate t = new FormTemplate();
        t.setFormKey(key);
        t.setName(isBlank(name) ? "IACUC 动物实验方案（默认）" : name.trim());
        t.setVersion(1);
        t.setStatus(STATUS_DRAFT);
        t.setDescription(description);
        t.setCreatedBy("system");
        templateMapper.insert(t);

        rebuildTree(t.getId(), sections);
        return true;
    }

    /**
     * 保证内置种子作为初始默认配置存在：
     * 已有已发布版本或任意非空版本 → 不动；无任何版本 → 写 v1；只剩空草稿 → 就地重建最新草稿为种子内容。
     * 幂等，供启动链与手动重填共用。
     * @return true 表示本次写入/刷新了种子内容
     */
    @Transactional
    public boolean ensureSeedDraft(String formKey, String name, String description, List<SectionVO> sections) {
        if (sections == null || sections.isEmpty()) {
            return false;
        }
        String key = normalizeFormKey(formKey);
        if (templateMapper.findPublishedByFormKey(key) != null) {
            return false; // 已有已发布基线，不干扰
        }
        List<FormTemplate> list = templateMapper.listByFormKey(key);
        for (FormTemplate t : list) {
            if (!loadTree(t.getId()).isEmpty()) {
                return false; // 已有非空版本，视为已有内容
            }
        }
        if (list.isEmpty()) {
            return seedDefault(key, name, description, sections);
        }
        FormTemplate latest = list.get(0); // listByFormKey 按 version DESC
        if (STATUS_DRAFT.equals(latest.getStatus())) {
            if (!isBlank(name)) {
                latest.setName(name.trim());
            }
            if (description != null) {
                latest.setDescription(description);
            }
            templateMapper.update(latest);
            rebuildTree(latest.getId(), sections);
            return true;
        }
        int next = templateMapper.findMaxVersionByFormKey(key) + 1;
        FormTemplate t = new FormTemplate();
        t.setFormKey(key);
        t.setName(isBlank(name) ? "IACUC 动物实验方案（默认）" : name.trim());
        t.setVersion(next);
        t.setStatus(STATUS_DRAFT);
        t.setDescription(description);
        t.setCreatedBy("system");
        templateMapper.insert(t);
        rebuildTree(t.getId(), sections);
        return true;
    }

    /** 发布：本版本置 PUBLISHED + published_at，同 form_key 上一 PUBLISHED 置 ARCHIVED。 */
    @Transactional
    public Result<TemplateVersionBriefVO> publish(Long id) {
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
        LocalDateTime now = LocalDateTime.now();
        templateMapper.publish(id, now);
        templateMapper.archivePublished(t.getFormKey(), id);

        t.setStatus(STATUS_PUBLISHED);
        t.setPublishedAt(now);
        return Result.success(toBriefVO(t));
    }

    /* ── 树加载 / 重建 ── */

    private TemplateDetailVO buildDetail(FormTemplate t) {
        TemplateDetailVO vo = new TemplateDetailVO();
        vo.setId(t.getId());
        vo.setFormKey(t.getFormKey());
        vo.setName(t.getName());
        vo.setVersion(t.getVersion());
        vo.setStatus(t.getStatus());
        vo.setDescription(t.getDescription());
        vo.setPublishedAt(t.getPublishedAt());
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
        v.setName(t.getName());
        v.setDescription(t.getDescription());
        v.setVersion(t.getVersion());
        v.setStatus(t.getStatus());
        v.setPublishedAt(t.getPublishedAt());
        v.setUpdatedAt(t.getUpdatedAt());
        v.setUpdatedBy(t.getCreatedBy());
        return v;
    }

    private TemplateVersionBriefVO toBriefVO(FormTemplate t) {
        TemplateVersionBriefVO v = new TemplateVersionBriefVO();
        v.setId(t.getId());
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
