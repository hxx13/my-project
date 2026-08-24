package com.example.demo.modules.cageshelf.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.cageshelf.entity.CageFormCompositeAtom;
import com.example.demo.modules.cageshelf.entity.CageFormField;
import com.example.demo.modules.cageshelf.entity.CageFormSection;
import com.example.demo.modules.cageshelf.entity.CageFormTemplate;
import com.example.demo.modules.cageshelf.entity.CageInfoField;
import com.example.demo.modules.cageshelf.entity.CageInfoFieldDictionary;
import com.example.demo.modules.cageshelf.mapper.CageFormCompositeAtomMapper;
import com.example.demo.modules.cageshelf.mapper.CageFormFieldMapper;
import com.example.demo.modules.cageshelf.mapper.CageFormSectionMapper;
import com.example.demo.modules.cageshelf.mapper.CageFormTemplateMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoFieldDictionaryMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoFieldMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 笼位表单模板（到原子层）—— 从字典套结构 + 已发布字段生成原子模板与组合模板。
 * 组合模板 form_key=cage_detail，钉住全部原子；原子模板 form_key=域码 Dn。
 */
@Service
public class CageInfoTemplateService {

    public static final String COMPOSITE_FORM_KEY = "cage_detail";
    public static final String COMPOSITE_TITLE = "笼位详情表单";

    /** 不进模板快照的字段：状态标记（用网格专用指示 STATUS_CHIPS）+ 本地存储（实验记录/照片/扩展数据，非表单字段）。数据层照存照迁移。 */
    private static final Set<String> HIDDEN_FROM_TEMPLATE_CANONICALS = Set.of(
            "needs_division", "needs_special_feeding", "needs_transfer", "has_health_abnormality", "needs_cohabitation",
            "experiment_desc", "images_json", "extra_data");

    private final CageFormTemplateMapper templateMapper;
    private final CageFormSectionMapper sectionMapper;
    private final CageFormFieldMapper formFieldMapper;
    private final CageFormCompositeAtomMapper compositeAtomMapper;
    private final CageInfoFieldDictionaryMapper dictionaryMapper;
    private final CageInfoFieldMapper fieldMapper;
    private final CageFormAuditService auditService;

    public CageInfoTemplateService(CageFormTemplateMapper templateMapper,
                                   CageFormSectionMapper sectionMapper,
                                   CageFormFieldMapper formFieldMapper,
                                   CageFormCompositeAtomMapper compositeAtomMapper,
                                   CageInfoFieldDictionaryMapper dictionaryMapper,
                                   CageInfoFieldMapper fieldMapper,
                                   CageFormAuditService auditService) {
        this.templateMapper = templateMapper;
        this.sectionMapper = sectionMapper;
        this.formFieldMapper = formFieldMapper;
        this.compositeAtomMapper = compositeAtomMapper;
        this.dictionaryMapper = dictionaryMapper;
        this.fieldMapper = fieldMapper;
        this.auditService = auditService;
    }

    public List<Map<String, Object>> list() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (CageFormTemplate t : templateMapper.selectAll()) {
            out.add(toListItem(t));
        }
        return out;
    }

    public Map<String, Object> detail(String formKey) {
        CageFormTemplate t = templateMapper.selectByFormKey(formKey);
        if (t == null) {
            throw new TwinBusinessException(404, "模板不存在: " + formKey);
        }
        Map<String, Object> m = toListItem(t);
        if ("COMPOSITE".equals(t.getKind())) {
            // 组合模板自身无 sections，sections 建在钉住的原子模板上——合并所有原子的 sections 供填表渲染。
            List<Map<String, Object>> atoms = new ArrayList<>();
            List<Map<String, Object>> mergedSections = new ArrayList<>();
            for (CageFormCompositeAtom ref : compositeAtomMapper.selectByCompositeId(t.getId())) {
                CageFormTemplate atom = templateMapper.selectById(ref.getAtomTemplateId());
                if (atom != null) {
                    mergedSections.addAll(buildSections(atom.getId()));
                }
                Map<String, Object> am = new LinkedHashMap<>();
                am.put("atomCode", ref.getAtomCode());
                am.put("atomFormKey", atom == null ? ref.getAtomCode() : atom.getFormKey());
                am.put("atomTitle", atom == null ? ref.getAtomCode() : atom.getTitle());
                am.put("atomStatus", atom == null ? null : atom.getStatus());
                am.put("sortOrder", ref.getSortOrder());
                atoms.add(am);
            }
            m.put("sections", mergedSections);
            m.put("atoms", atoms);
        } else {
            m.put("sections", buildSections(t.getId()));
        }
        return m;
    }

    /** 从字典套结构 + 已发布字段重建原子/组合模板（幂等：先清后建）。 */
    @Transactional
    public Map<String, Object> regenerate(String operatorId) {
        CageInfoFieldDictionary dict = resolveDefaultDictionary();
        List<CageInfoField> published = fieldMapper.selectPublished();

        // 清旧模板
        for (CageFormTemplate t : templateMapper.selectAll()) {
            sectionMapper.deleteByTemplateId(t.getId());
            formFieldMapper.deleteByTemplateId(t.getId());
            compositeAtomMapper.deleteByCompositeId(t.getId());
            templateMapper.deleteById(t.getId());
        }

        // 建原子模板（每域一个）
        Map<String, Long> atomByDomain = new LinkedHashMap<>();
        Map<String, List<CageInfoField>> fieldsByDomain = groupPublishedByDomain(published);
        for (String domain : fieldsByDomain.keySet()) {
            CageFormTemplate atom = upsertTemplate(domain, domainTitle(domain), "ATOM", dict.getDictKey());
            atomByDomain.put(domain, atom.getId());
            buildAtomSections(atom.getId(), domain, fieldsByDomain.get(domain));
        }

        // 建组合模板，钉住全部原子
        CageFormTemplate composite = upsertTemplate(COMPOSITE_FORM_KEY, COMPOSITE_TITLE, "COMPOSITE", dict.getDictKey());
        int sort = 0;
        for (Map.Entry<String, Long> e : atomByDomain.entrySet()) {
            CageFormCompositeAtom ref = new CageFormCompositeAtom();
            ref.setCompositeTemplateId(composite.getId());
            ref.setAtomTemplateId(e.getValue());
            ref.setAtomCode(e.getKey());
            ref.setSortOrder(sort += 10);
            compositeAtomMapper.insert(ref);
        }

        auditService.logDictChange("PUBLISH", "form", composite.getId(), COMPOSITE_FORM_KEY, COMPOSITE_TITLE,
                null, Map.of("atomCount", atomByDomain.size()), operatorId);
        return Map.of("atomCount", atomByDomain.size(), "compositeFormKey", COMPOSITE_FORM_KEY);
    }

    /** 组合原子域：新建组合模板，钉住指定原子域（formKey 列表），返回详情。 */
    @Transactional
    public Map<String, Object> compose(String formKey, String title, List<String> atomFormKeys, String operatorId) {
        if (formKey == null || formKey.isBlank()) {
            throw new TwinBusinessException(400, "组合表单键 formKey 不能为空");
        }
        formKey = formKey.trim();
        if (title == null || title.isBlank()) {
            title = formKey;
        }
        if (atomFormKeys == null || atomFormKeys.isEmpty()) {
            throw new TwinBusinessException(400, "至少选择一个原子域");
        }
        if (templateMapper.selectByFormKey(formKey) != null) {
            throw new TwinBusinessException(409, "模板键「" + formKey + "」已存在");
        }

        // 校验原子存在且为 ATOM，去重保序
        List<CageFormTemplate> atoms = new ArrayList<>();
        java.util.LinkedHashSet<String> seen = new java.util.LinkedHashSet<>();
        for (String ak : atomFormKeys) {
            if (ak == null || ak.isBlank()) continue;
            if (!seen.add(ak.trim())) continue;
            CageFormTemplate atom = templateMapper.selectByFormKey(ak.trim());
            if (atom == null || !"ATOM".equals(atom.getKind())) {
                throw new TwinBusinessException(400, "原子域不存在: " + ak);
            }
            atoms.add(atom);
        }
        if (atoms.isEmpty()) {
            throw new TwinBusinessException(400, "至少选择一个有效原子域");
        }

        CageFormTemplate composite = new CageFormTemplate();
        composite.setFormKey(formKey);
        composite.setTitle(title.trim());
        composite.setKind("COMPOSITE");
        composite.setStatus("DRAFT");
        composite.setVersion(1);
        templateMapper.insert(composite);

        int sort = 0;
        for (CageFormTemplate atom : atoms) {
            CageFormCompositeAtom ref = new CageFormCompositeAtom();
            ref.setCompositeTemplateId(composite.getId());
            ref.setAtomTemplateId(atom.getId());
            ref.setAtomCode(atom.getFormKey());
            ref.setSortOrder(sort += 10);
            compositeAtomMapper.insert(ref);
        }

        auditService.logDictChange("COMPOSE", "form", composite.getId(), formKey, title.trim(),
                null, Map.of("atomCount", atoms.size()), operatorId);
        return detail(formKey);
    }

    @Transactional
    public Map<String, Object> publish(String formKey, String operatorId) {
        CageFormTemplate t = templateMapper.selectByFormKey(formKey);
        if (t == null) {
            throw new TwinBusinessException(404, "模板不存在: " + formKey);
        }
        // 发布 = 冻结当前版本；单版本模型下 version 不变（草稿 vN 与已发布 vN 是同一版本，仅状态不同）。
        t.setStatus("FROZEN");
        templateMapper.update(t);
        auditService.logDictChange("PUBLISH", "form", t.getId(), t.getFormKey(), t.getTitle(),
                Map.of("status", "DRAFT"), Map.of("status", "FROZEN", "version", t.getVersion()), operatorId);
        return detail(formKey);
    }

    @Transactional
    public Map<String, Object> unfreeze(String formKey, String operatorId) {
        CageFormTemplate t = templateMapper.selectByFormKey(formKey);
        if (t == null) {
            throw new TwinBusinessException(404, "模板不存在: " + formKey);
        }
        t.setStatus("DRAFT");
        templateMapper.update(t);
        auditService.logDictChange("UNFREEZE", "form", t.getId(), t.getFormKey(), t.getTitle(),
                Map.of("status", "FROZEN"), Map.of("status", "DRAFT"), operatorId);
        return detail(formKey);
    }

    /** 删除模板（单版本）：原子被组合钉住时拒绝；组合先清复合引用再删。 */
    @Transactional
    public void delete(String formKey, String operatorId) {
        CageFormTemplate t = templateMapper.selectByFormKey(formKey);
        if (t == null) {
            throw new TwinBusinessException(404, "模板不存在: " + formKey);
        }
        if ("ATOM".equals(t.getKind())) {
            List<CageFormCompositeAtom> refs = compositeAtomMapper.selectByAtomId(t.getId());
            if (!refs.isEmpty()) {
                throw new TwinBusinessException(409, "原子域「" + formKey + "」被 " + refs.size() + " 个组合钉住，请先删除对应组合");
            }
        }
        compositeAtomMapper.deleteByCompositeId(t.getId());
        sectionMapper.deleteByTemplateId(t.getId());
        formFieldMapper.deleteByTemplateId(t.getId());
        templateMapper.deleteById(t.getId());
        auditService.logDictChange("DELETE", "form", t.getId(), t.getFormKey(), t.getTitle(), null, null, operatorId);
    }

    // ── 私有 ──

    private CageInfoFieldDictionary resolveDefaultDictionary() {
        List<CageInfoFieldDictionary> all = dictionaryMapper.selectAllActive();
        if (all.isEmpty()) {
            throw new TwinBusinessException(500, "字段字典套未初始化");
        }
        return all.get(0);
    }

    private CageFormTemplate upsertTemplate(String formKey, String title, String kind, String dictKey) {
        CageFormTemplate t = templateMapper.selectByFormKey(formKey);
        if (t == null) {
            t = new CageFormTemplate();
            t.setFormKey(formKey);
            t.setTitle(title);
            t.setKind(kind);
            t.setDictKey(dictKey);
            t.setStatus("DRAFT");
            t.setVersion(1);
            templateMapper.insert(t);
        } else {
            t.setTitle(title);
            t.setKind(kind);
            t.setDictKey(dictKey);
            templateMapper.update(t);
            // 清旧结构
            sectionMapper.deleteByTemplateId(t.getId());
            formFieldMapper.deleteByTemplateId(t.getId());
        }
        return t;
    }

    private Map<String, List<CageInfoField>> groupPublishedByDomain(List<CageInfoField> published) {
        Map<String, List<CageInfoField>> m = new LinkedHashMap<>();
        for (CageInfoField f : published) {
            if (f == null || f.getCanonical() == null || HIDDEN_FROM_TEMPLATE_CANONICALS.contains(f.getCanonical())) {
                continue; // 状态标记不渲染，数据层照存
            }
            String domain = f.getDomainCode();
            if (domain == null || domain.isBlank()) {
                domain = f.getFolder() != null && !f.getFolder().isBlank() ? "D5" : "D5";
            }
            domain = domain.toUpperCase(Locale.ROOT);
            m.computeIfAbsent(domain, k -> new ArrayList<>()).add(f);
        }
        return m;
    }

    private void buildAtomSections(Long templateId, String domainCode, List<CageInfoField> fields) {
        // 域章节（parent NULL）
        CageFormSection domainSection = new CageFormSection();
        domainSection.setTemplateId(templateId);
        domainSection.setParentId(null);
        domainSection.setCode(domainCode);
        domainSection.setLabel(domainTitle(domainCode));
        domainSection.setSortOrder(0);
        sectionMapper.insert(domainSection);

        // 按子模块分组（无子模块的字段直接挂域章节）
        Map<String, List<CageInfoField>> bySub = new LinkedHashMap<>();
        for (CageInfoField f : fields) {
            String sub = f.getSubmoduleCode();
            bySub.computeIfAbsent(sub == null || sub.isBlank() ? "" : sub, k -> new ArrayList<>()).add(f);
        }

        int sort = 0;
        for (Map.Entry<String, List<CageInfoField>> e : bySub.entrySet()) {
            Long sectionId = domainSection.getId();
            if (!e.getKey().isEmpty()) {
                CageFormSection sub = new CageFormSection();
                sub.setTemplateId(templateId);
                sub.setParentId(domainSection.getId());
                sub.setCode(e.getKey());
                sub.setLabel(e.getKey());
                sub.setSortOrder(sort += 10);
                sectionMapper.insert(sub);
                sectionId = sub.getId();
            }
            for (CageInfoField f : e.getValue()) {
                CageFormField ff = new CageFormField();
                ff.setTemplateId(templateId);
                ff.setSectionId(sectionId);
                ff.setFieldId(f.getId());
                ff.setCanonical(f.getCanonical());
                ff.setLabel(f.getLabel());
                ff.setDataType(f.getDataType());
                ff.setFieldType(f.getFieldType());
                ff.setDictKey(f.getDictKey());
                ff.setRole(f.getRole());
                ff.setRequired(f.getRequired());
                ff.setSortOrder(f.getSort() == null ? 0 : f.getSort());
                formFieldMapper.insert(ff);
            }
        }
    }

    private List<Map<String, Object>> buildSections(Long templateId) {
        List<CageFormSection> sections = sectionMapper.selectByTemplateId(templateId);
        List<CageFormField> fields = formFieldMapper.selectByTemplateId(templateId);
        Map<Long, List<Map<String, Object>>> fieldBySection = new LinkedHashMap<>();
        for (CageFormField f : fields) {
            Long sid = f.getSectionId() == null ? -1L : f.getSectionId();
            fieldBySection.computeIfAbsent(sid, k -> new ArrayList<>()).add(toFieldMap(f));
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (CageFormSection s : sections) {
            if (s.getParentId() != null) continue; // 子模块在父章节内展开
            Map<String, Object> sm = new LinkedHashMap<>();
            sm.put("code", s.getCode());
            sm.put("label", s.getLabel());
            sm.put("sortOrder", s.getSortOrder());
            List<Map<String, Object>> subs = new ArrayList<>();
            for (CageFormSection child : sections) {
                if (s.getId().equals(child.getParentId())) {
                    Map<String, Object> cm = new LinkedHashMap<>();
                    cm.put("code", child.getCode());
                    cm.put("label", child.getLabel());
                    cm.put("sortOrder", child.getSortOrder());
                    cm.put("fields", fieldBySection.getOrDefault(child.getId(), List.of()));
                    subs.add(cm);
                }
            }
            sm.put("subsections", subs);
            sm.put("fields", fieldBySection.getOrDefault(s.getId(), List.of()));
            out.add(sm);
        }
        return out;
    }

    private Map<String, Object> toFieldMap(CageFormField f) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("fieldId", f.getFieldId());
        m.put("canonical", f.getCanonical());
        m.put("label", f.getLabel());
        m.put("dataType", f.getDataType());
        m.put("fieldType", f.getFieldType());
        m.put("dictKey", f.getDictKey());
        m.put("role", f.getRole());
        m.put("required", f.getRequired());
        m.put("sortOrder", f.getSortOrder());
        return m;
    }

    private Map<String, Object> toListItem(CageFormTemplate t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", t.getId());
        m.put("formKey", t.getFormKey());
        m.put("title", t.getTitle());
        m.put("kind", t.getKind());
        m.put("dictKey", t.getDictKey());
        m.put("hostType", t.getHostType());
        m.put("status", t.getStatus());
        m.put("version", t.getVersion());
        m.put("updatedAt", t.getUpdatedAt());
        int atomCount = compositeAtomMapper.selectByCompositeId(t.getId()).size();
        m.put("atomCount", atomCount);
        return m;
    }

    private static String domainTitle(String domainCode) {
        switch (domainCode.toUpperCase(Locale.ROOT)) {
            case "D1": return "笼位身份";
            case "D2": return "项目信息";
            case "D3": return "动物信息";
            case "D4": return "状态标记";
            case "D5": return "未分类";
            default: return "数据域 " + domainCode;
        }
    }
}
