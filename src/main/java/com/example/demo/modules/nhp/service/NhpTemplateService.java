package com.example.demo.modules.nhp.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.entity.CrfCodelist;
import com.example.demo.modules.nhp.entity.CrfCompositeAtom;
import com.example.demo.modules.nhp.entity.CrfField;
import com.example.demo.modules.nhp.entity.CrfForm;
import com.example.demo.modules.nhp.entity.CrfStudy;
import com.example.demo.modules.nhp.entity.CrfTemplateField;
import com.example.demo.modules.nhp.entity.CrfTemplateSection;
import com.example.demo.modules.nhp.mapper.CrfCodelistMapper;
import com.example.demo.modules.nhp.mapper.CrfCompositeAtomMapper;
import com.example.demo.modules.nhp.mapper.CrfFieldMapper;
import com.example.demo.modules.nhp.mapper.CrfFormMapper;
import com.example.demo.modules.nhp.mapper.CrfRecordMapper;
import com.example.demo.modules.nhp.mapper.CrfStudyMapper;
import com.example.demo.modules.nhp.mapper.CrfTemplateFieldMapper;
import com.example.demo.modules.nhp.mapper.CrfTemplateSectionMapper;
import com.example.demo.modules.nhp.util.CodedIdOrder;
import com.example.demo.modules.nhp.util.NhpAtomFormKeys;
import com.example.demo.modules.nhp.util.NhpTemplateSectionLabels;
import com.example.demo.modules.nhp.util.NhpVersionAllocator;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * NHP 模板两层模型（发布模型保留「原子 / 组合」双通路）：
 * <ul>
 *   <li>原子模板（DOMAIN/MODULE）：归属某一数据域套；猪套存量码为裸 {@code D1}，其它套为 {@code monkey__D1}。
 *       可独立编辑、版本演进，也可<strong>发布为独立可填表单</strong>；被组合钉住的版本不可改。</li>
 *   <li>组合模板（TEMPLATE）：可选能力——钉住多个原子版本并快照后发布；与「单原子发布」并存。</li>
 * </ul>
 * 填写实例可挂已发布（FROZEN/PUBLISHED）的原子或组合。列表头为最新版，同时附带 publishedFormId 供开填。
 */
@Service
public class NhpTemplateService {

    public static final String KIND_ATOM = "ATOM";
    public static final String KIND_COMPOSITE = "COMPOSITE";
    public static final String TYPE_TEMPLATE = "TEMPLATE";
    /** 写入 crf_form.description，供 UI 标注版本来源（非用户手建） */
    public static final String ORIGIN_SEED = "[SEED]";
    public static final String ORIGIN_AUTO_COMPOSE = "[AUTO_COMPOSE]";

    private static final Map<String, String> DOMAIN_LABELS = Map.ofEntries(
            Map.entry("D1", "供体猪域"), Map.entry("D2", "受体NHP域"), Map.entry("D3", "配型与手术域"),
            Map.entry("D4", "样本与检测域"), Map.entry("D5", "随访与事件域"), Map.entry("D6", "免疫抑制用药域"),
            Map.entry("D7", "麻醉术中监护域"), Map.entry("D8", "病理诊断域"), Map.entry("D9", "心脏移植模块"),
            Map.entry("D10", "体外肝灌注模块"), Map.entry("D11", "公共数据层"), Map.entry("D12", "标准与版本域"),
            Map.entry("D13", "用户与权限域"));

    private static final Comparator<String> CODED_ID_ORDER = CodedIdOrder.COMPARATOR;

    private final CrfFormMapper formMapper;
    private final CrfFieldMapper fieldMapper;
    private final CrfCodelistMapper codelistMapper;
    private final CrfTemplateSectionMapper sectionMapper;
    private final CrfTemplateFieldMapper fieldTmplMapper;
    private final CrfCompositeAtomMapper compositeAtomMapper;
    private final CrfStudyMapper studyMapper;
    private final CrfRecordMapper recordMapper;
    private final NhpFieldDictionaryService dictionaryService;
    private final ObjectMapper objectMapper;

    public NhpTemplateService(CrfFormMapper formMapper, CrfFieldMapper fieldMapper,
                              CrfCodelistMapper codelistMapper, CrfTemplateSectionMapper sectionMapper,
                              CrfTemplateFieldMapper fieldTmplMapper, CrfCompositeAtomMapper compositeAtomMapper,
                              CrfStudyMapper studyMapper, CrfRecordMapper recordMapper,
                              NhpFieldDictionaryService dictionaryService,
                              ObjectMapper objectMapper) {
        this.formMapper = formMapper;
        this.fieldMapper = fieldMapper;
        this.codelistMapper = codelistMapper;
        this.sectionMapper = sectionMapper;
        this.fieldTmplMapper = fieldTmplMapper;
        this.compositeAtomMapper = compositeAtomMapper;
        this.studyMapper = studyMapper;
        this.recordMapper = recordMapper;
        this.dictionaryService = dictionaryService;
        this.objectMapper = objectMapper;
    }

    /** 列表。kind=ATOM|COMPOSITE|ALL；默认 COMPOSITE（实例侧只看组合）。每 formKey 一条「头」= 最新版。 */
    public List<Map<String, Object>> list(String kind) {
        return list(kind, null);
    }

    /**
     * @param dictKey 过滤数据域套：ATOM 按 formKey 归属；COMPOSITE 按是否钉住该套任一原子（空=全部）
     */
    public List<Map<String, Object>> list(String kind, String dictKey) {
        String k = kind == null || kind.isBlank() ? KIND_COMPOSITE : kind.trim().toUpperCase();
        List<CrfForm> forms = switch (k) {
            case KIND_ATOM, "STAGE", "DOMAIN" -> formMapper.listAtoms();
            case "ALL" -> formMapper.list();
            default -> formMapper.listComposites();
        };
        // 每 code 只保留最新 version
        Map<String, CrfForm> heads = new LinkedHashMap<>();
        for (CrfForm f : forms) {
            if ((KIND_ATOM.equals(k) || "STAGE".equals(k) || "DOMAIN".equals(k))
                    && dictKey != null && !dictKey.isBlank()
                    && !NhpAtomFormKeys.matchesDictKey(f.getCode(), dictKey)) {
                continue;
            }
            if ((KIND_COMPOSITE.equals(k) || "TEMPLATE".equals(k))
                    && dictKey != null && !dictKey.isBlank()
                    && !compositeMatchesDictKey(f, dictKey)) {
                continue;
            }
            heads.putIfAbsent(f.getCode(), f);
        }
        List<CrfForm> ordered = new ArrayList<>(heads.values());
        ordered.sort(Comparator.comparing(f -> f.getCode() == null ? "" : f.getCode(), CODED_ID_ORDER));
        List<Map<String, Object>> out = new ArrayList<>();
        for (CrfForm f : ordered) {
            // 二次门禁：SQL 与 kind 语义对齐，避免 nhp-crf 误入原子栏
            if ((KIND_ATOM.equals(k) || "STAGE".equals(k) || "DOMAIN".equals(k)) && !isAtom(f)) {
                continue;
            }
            if ((KIND_COMPOSITE.equals(k) || "TEMPLATE".equals(k)) && !isComposite(f)) {
                continue;
            }
            // 读路径自愈：组合码误标 DOMAIN 时写回 TEMPLATE，便于建实例与徽章一致
            if (isComposite(f) && !TYPE_TEMPLATE.equals(f.getFormType())) {
                f.setFormType(TYPE_TEMPLATE);
                formMapper.update(f);
            }
            out.add(toListItem(f));
        }
        return out;
    }

    /**
     * 归类到文件夹（folderId 为 null 即移出到「未分类」）。
     * 按 code 整组落库，同 formKey 的所有版本行归属一致。
     */
    @Transactional
    public Result<?> setFolder(String formKey, Long folderId) {
        if (formKey == null || formKey.isBlank()) {
            return Result.fail(400, "formKey 必填");
        }
        CrfForm head = formMapper.findByCode(formKey.trim());
        if (head == null) {
            return Result.error("表单不存在: " + formKey);
        }
        formMapper.updateFolderByCode(head.getCode(), folderId);
        return Result.success(toListItem(formMapper.findById(head.getId())));
    }

    public Result<Object> get(String formKey) {
        CrfForm form = resolveEditableOrLatest(formKey);
        if (form == null) {
            return Result.error("模板不存在");
        }
        return Result.success(buildTemplateJson(form));
    }

    public Result<Object> getById(Long formId) {
        CrfForm form = formMapper.findById(formId);
        if (form == null || !Boolean.TRUE.equals(form.getActive())) {
            return Result.error("模板不存在");
        }
        return Result.success(buildTemplateJson(form));
    }

    public List<Map<String, Object>> listVersions(String formKey) {
        List<CrfForm> rows = formMapper.listByCode(formKey);
        List<Map<String, Object>> out = new ArrayList<>();
        for (CrfForm f : rows) {
            out.add(toListItem(f));
        }
        return out;
    }

    @Transactional
    public Result<Object> save(String formKey, Map<String, Object> template) {
        // 多草稿下按 body.formId 精确定位要保存的版本；缺省退回「最新草稿/最新版」兼容旧调用
        Long targetId = asLong(template == null ? null : template.get("formId"));
        CrfForm form = targetId != null ? formMapper.findById(targetId) : resolveEditableOrLatest(formKey);
        if (targetId != null) {
            if (form == null || !Boolean.TRUE.equals(form.getActive())) {
                return Result.error("模板版本不存在");
            }
            if (form.getCode() == null || !form.getCode().equals(formKey)) {
                return Result.fail(400, "formId 与 formKey 不匹配");
            }
        }
        String title = template == null ? null : str(template.get("title"));
        if (form == null) {
            boolean atom = looksLikeAtomCode(formKey);
            form = insertOrReactivate(newForm(formKey, title, atom ? atomTypeFor(formKey) : TYPE_TEMPLATE, 1, "DRAFT"));
            applyScheduleFields(form, template);
            if (template != null && (template.containsKey("captureForm") || template.containsKey("eventAnchor") || template.containsKey("frequency"))) {
                formMapper.update(form);
            }
        } else if (isAtom(form)) {
            // 原子：被组合钉住，或已发布/归档 → 须新建版本；草稿可改
            if (isAtomVersionPinned(form.getId())) {
                List<Map<String, Object>> pins = buildReferencedBy(form.getId());
                return Result.fail(409, "该原子版本已被组合模板引用锁定，请「新建版本」后再编辑。"
                        + formatPinBlockMessage(pins)
                        + " 可到「组合模板」页查找并删除钉住方（系统种子组合也可删，有填写实例的除外）。");
            }
            String st = form.getStatus() == null ? "" : form.getStatus().trim().toUpperCase();
            if (!"DRAFT".equals(st) && !"FREEZING".equals(st)) {
                return Result.fail(409, "已发布/归档的原子版本不可编辑，请先「新建版本」后再改（与组合一致）。当前 "
                        + (st.isEmpty() ? "未知" : st));
            }
            if (title != null) form.setName(title);
            applyScheduleFields(form, template);
            formMapper.update(form);
        } else {
            if (!"DRAFT".equals(form.getStatus()) && !"FREEZING".equals(form.getStatus())) {
                return Result.fail(409, "已发布/归档版本不可编辑，请先「新建草稿版本」");
            }
            if (title != null) form.setName(title);
            applyScheduleFields(form, template);
            formMapper.update(form);
        }
        persistSections(form.getId(), sectionsOf(template));
        // 组合：若 body 带 atoms，刷新钉版本引用（不重快照，结构以 sections 为准）
        if (isComposite(form) && template != null && template.get("atoms") instanceof List<?>) {
            persistAtomRefs(form.getId(), listOf(template.get("atoms")));
        }
        return Result.success(buildTemplateJson(formMapper.findById(form.getId())));
    }

    /**
     * 新建原子模板（数据域模块）。body: { formKey|domainCode, dictKey?, title, formType? }
     * 猪套存量为裸 D1；其它套为 dictKey__Dn。可随后发布为独立表单，或纳入组合。
     */
    @Transactional
    public Result<Object> createAtom(Map<String, Object> body) {
        String rawKey = str(body == null ? null : body.get("formKey"));
        if (rawKey == null) rawKey = str(body == null ? null : body.get("domainCode"));
        String title = str(body == null ? null : body.get("title"));
        String formType = str(body == null ? null : body.get("formType"));
        String dictKey = str(body == null ? null : body.get("dictKey"));
        String hostType = str(body == null ? null : body.get("hostType"));
        if (hostType != null && !"DONOR".equals(hostType) && !"RECIPIENT".equals(hostType)) {
            return Result.fail(400, "hostType 须为 DONOR/RECIPIENT");
        }
        if (rawKey == null) {
            return Result.fail(400, "formKey / domainCode 不能为空");
        }
        String domainCode = NhpAtomFormKeys.extractDomainCode(rawKey);
        if (domainCode == null) {
            return Result.fail(400, "原子编码须为数据域码（如 D1、DD1），不能与组合 formKey 混用");
        }
        NhpAtomFormKeys.Parsed parsedRaw = NhpAtomFormKeys.parse(rawKey);
        String effectiveDict = dictKey != null
                ? NhpAtomFormKeys.normalizeDictKey(dictKey)
                : (parsedRaw != null ? parsedRaw.dictKey() : NhpAtomFormKeys.DEFAULT_DICT_KEY);
        if (NhpAtomFormKeys.DEFAULT_DICT_KEY.equals(effectiveDict)) {
            String canon = NhpAtomFormKeys.canonicalPigDomainCode(domainCode);
            if (canon != null) {
                domainCode = canon;
            }
        }
        try {
            dictionaryService.requireByKey(effectiveDict);
        } catch (IllegalArgumentException ex) {
            return Result.fail(400, ex.getMessage());
        }
        String atomKey = NhpAtomFormKeys.atomFormKey(effectiveDict, domainCode);
        if (formMapper.findByCode(atomKey) != null) {
            return Result.fail(409, "原子模板已存在: " + atomKey);
        }
        String type = formType != null && ("MODULE".equalsIgnoreCase(formType) || "DOMAIN".equalsIgnoreCase(formType))
                ? formType.toUpperCase()
                : atomTypeFor(domainCode);
        String defaultTitle = DOMAIN_LABELS.getOrDefault(domainCode, domainCode);
        if (!NhpAtomFormKeys.DEFAULT_DICT_KEY.equals(effectiveDict)) {
            defaultTitle = effectiveDict + " · " + defaultTitle;
        }
        CrfForm form = insertOrReactivate(newForm(atomKey, title != null ? title : defaultTitle, type, 1, "DRAFT"));
        if (hostType != null) {
            form.setHostType(hostType);
            formMapper.update(form);
        }
        return Result.success(buildTemplateJson(formMapper.findById(form.getId())));
    }

    /**
     * 组合模板：按序钉住原子版本并快照其章节/字段到组合呈现层。
     * body: { formKey, title, atoms: [{ atomCode, atomFormId? }] }
     * atomFormId 缺省时取该原子最新版（草稿或已发布均可被钉住）。
     * 若当前组合最新版已发布，自动升草稿再组合（版号按活跃空缺补位；不再逼用户先点「新建草稿」）。
     */
    @Transactional
    public Result<Object> compose(Map<String, Object> body) {
        String formKey = str(body == null ? null : body.get("formKey"));
        String title = str(body == null ? null : body.get("title"));
        if (formKey == null) {
            return Result.fail(400, "formKey 不能为空");
        }
        if (looksLikeAtomCode(formKey)) {
            return Result.fail(400, "组合模板 formKey 不能使用数据域码（D1/DD1…）；原子请在「原子模板」中维护");
        }
        List<Map<String, Object>> atomSpecs = listOf(body == null ? null : body.get("atoms"));
        if (atomSpecs.isEmpty()) {
            return Result.fail(400, "请至少选择一个原子模板");
        }

        CrfForm existing = resolveEditableOrLatest(formKey);
        CrfForm form;
        if (existing == null) {
            form = insertOrReactivate(newForm(formKey, title != null ? title : formKey, TYPE_TEMPLATE, 1, "DRAFT"));
        } else if ("DRAFT".equals(existing.getStatus()) || "FREEZING".equals(existing.getStatus())) {
            form = existing;
            // 纠正存量：组合码曾被误标 DOMAIN/MODULE 时，组合后仍停在原子栏
            boolean dirty = false;
            if (!TYPE_TEMPLATE.equals(form.getFormType())) {
                form.setFormType(TYPE_TEMPLATE);
                dirty = true;
            }
            if (title != null) {
                form.setName(title);
                dirty = true;
            }
            if (dirty) {
                formMapper.update(form);
            }
        } else {
            // 已发布：先纠正 form_type，再自动升草稿（UI 须标注为「重组自动升版」，勿当成用户手建版本）
            if (!TYPE_TEMPLATE.equals(existing.getFormType())) {
                existing.setFormType(TYPE_TEMPLATE);
                formMapper.update(existing);
            }
            Result<Object> draftRes = createDraftVersion(formKey);
            if (!Boolean.TRUE.equals(draftRes.getSuccess())) {
                return draftRes;
            }
            form = resolveEditableOrLatest(formKey);
            if (form == null) {
                return Result.fail(500, "自动新建草稿失败");
            }
            form.setDescription(ORIGIN_AUTO_COMPOSE + "重组已发布组合时自动升版");
            form.setFormType(TYPE_TEMPLATE);
            if (title != null) {
                form.setName(title);
            }
            formMapper.update(form);
        }

        List<Map<String, Object>> resolvedAtoms = new ArrayList<>();
        List<Map<String, Object>> mergedSections = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        int order = 0;
        for (Map<String, Object> spec : atomSpecs) {
            String atomCode = str(spec.get("atomCode"));
            if (atomCode == null) atomCode = str(spec.get("formKey"));
            if (atomCode == null || !seen.add(atomCode)) {
                continue;
            }
            Long pinId = asLong(spec.get("atomFormId"));
            CrfForm atom = pinId != null ? formMapper.findById(pinId) : resolveLatestAtom(atomCode);
            if (atom == null || !isAtom(atom)) {
                return Result.fail(400, "原子模板不存在或不是原子: " + atomCode);
            }
            if (!atomCode.equals(atom.getCode())) {
                return Result.fail(400, "atomFormId 与 atomCode 不一致: " + atomCode);
            }
            Map<String, Object> ref = new LinkedHashMap<>();
            ref.put("atomCode", atom.getCode());
            ref.put("atomFormId", atom.getId());
            ref.put("sortOrder", order++);
            resolvedAtoms.add(ref);

            // 快照：把原子顶层 sections 拷进组合（作为章节）
            Map<String, Object> atomJson = buildTemplateJson(atom);
            for (Map<String, Object> sec : sectionsOf(atomJson)) {
                mergedSections.add(deepCopyMap(sec));
            }
        }
        if (resolvedAtoms.isEmpty()) {
            return Result.fail(400, "没有有效的原子模板");
        }
        persistSections(form.getId(), mergedSections);
        persistAtomRefs(form.getId(), resolvedAtoms);
        return Result.success(buildTemplateJson(formMapper.findById(form.getId())));
    }

    /** 从字段字典生成：原子码 → 只生成该原子；组合码 → 组合全部已有原子。 */
    @Transactional
    public Result<Object> generate(String formKey, String title) {
        return generate(formKey, title, null);
    }

    /**
     * @param dictKey 数据域套（pig/monkey…）；生成原子时必填语义（空则默认猪套）；
     *                生成组合时用于只钉该套原子，避免猪猴混组
     */
    @Transactional
    public Result<Object> generate(String formKey, String title, String dictKey) {
        if (formKey == null || formKey.isBlank()) {
            return Result.fail(400, "formKey 不能为空");
        }
        if (looksLikeAtomCode(formKey) || NhpAtomFormKeys.extractDomainCode(formKey) != null) {
            String domainCode = NhpAtomFormKeys.extractDomainCode(formKey);
            if (domainCode == null) {
                return Result.fail(400, "无法解析数据域编码: " + formKey);
            }
            NhpAtomFormKeys.Parsed parsed = NhpAtomFormKeys.parse(formKey);
            String effectiveDict = dictKey != null && !dictKey.isBlank()
                    ? NhpAtomFormKeys.normalizeDictKey(dictKey)
                    : (parsed != null ? parsed.dictKey() : NhpAtomFormKeys.DEFAULT_DICT_KEY);
            // 猪套：DD1 → D1，与字段 D1.* 对齐，避免再生成空壳双 D 原子
            if (NhpAtomFormKeys.DEFAULT_DICT_KEY.equals(effectiveDict)) {
                String canon = NhpAtomFormKeys.canonicalPigDomainCode(domainCode);
                if (canon != null) {
                    domainCode = canon;
                }
            }
            final String resolvedDomain = domainCode;
            Long dictId;
            try {
                dictId = resolveDictionaryId(effectiveDict);
            } catch (IllegalArgumentException ex) {
                return Result.fail(400, ex.getMessage());
            }
            String atomKey = NhpAtomFormKeys.atomFormKey(effectiveDict, resolvedDomain);
            List<CrfField> all = dictId != null
                    ? fieldMapper.listByDictionary(dictId)
                    : List.of();
            // 按域段整段匹配：DD1 只取 DD1.*，绝不误收猪套 D1.*
            List<CrfField> domainFields = all.stream()
                    .filter(f -> NhpAtomFormKeys.fieldBelongsToDomain(f.getFieldCode(), resolvedDomain))
                    .toList();
            if (domainFields.isEmpty()) {
                return Result.fail(400, "数据域套「" + effectiveDict + "」中无 " + resolvedDomain
                        + " 域字段，请先在该套字段字典维护（勿误用其它套或其它域前缀，如 D1 ≠ DD1）");
            }
            // 硬门槛：仅 FROZEN 字段可进入原子；DRAFT/PENDING_REVIEW 不可用
            List<CrfField> fields = domainFields.stream()
                    .filter(f -> "FROZEN".equalsIgnoreCase(f.getStatus() == null ? "" : f.getStatus()))
                    .toList();
            if (fields.isEmpty()) {
                long draft = domainFields.stream()
                        .filter(f -> "DRAFT".equalsIgnoreCase(f.getStatus() == null ? "" : f.getStatus())).count();
                long pending = domainFields.stream()
                        .filter(f -> "PENDING_REVIEW".equalsIgnoreCase(f.getStatus() == null ? "" : f.getStatus())).count();
                return Result.fail(400, "域 " + resolvedDomain + " 无已冻结(FROZEN)字段，无法从字典生成原子。当前草稿 "
                        + draft + "、待校对 " + pending
                        + "。请到该套「字段字典」页用「待校对」筛选，对本页字段「通过并冻结」后再生成"
                        + "（或对猪套执行「重导入内置猪字典」以冻结种子字段）。");
            }
            if (fields.size() != domainFields.size()) {
                return Result.fail(400, "域 " + resolvedDomain + " 仍有 "
                        + (domainFields.size() - fields.size())
                        + " 个未冻结字段（DRAFT/PENDING_REVIEW）。从字典生成要求该域字段全部已冻结；"
                        + "请到该套「字段字典」页「待校对」筛选后「通过并冻结」。");
            }
            String defaultTitle = DOMAIN_LABELS.getOrDefault(resolvedDomain, resolvedDomain);
            if (!NhpAtomFormKeys.DEFAULT_DICT_KEY.equals(effectiveDict)) {
                defaultTitle = effectiveDict + " · " + defaultTitle;
            }
            Map<String, Object> template = new LinkedHashMap<>();
            template.put("formKey", atomKey);
            template.put("title", title == null ? defaultTitle : title);
            template.put("sections", buildSectionsFromDict(fields, effectiveDict));
            return save(atomKey, template);
        }
        // 组合：默认只钉指定套（或猪套）最新原子，避免跨套混组
        String suite = dictKey != null && !dictKey.isBlank()
                ? NhpAtomFormKeys.normalizeDictKey(dictKey)
                : NhpAtomFormKeys.DEFAULT_DICT_KEY;
        List<CrfForm> atoms = formMapper.listAtoms();
        Map<String, CrfForm> heads = new LinkedHashMap<>();
        for (CrfForm a : atoms) {
            if (!NhpAtomFormKeys.matchesDictKey(a.getCode(), suite)) continue;
            heads.putIfAbsent(a.getCode(), a);
        }
        if (heads.isEmpty()) {
            return Result.fail(400, "数据域套「" + suite + "」下尚无原子，请先从该套字典生成原子");
        }
        List<String> codes = new ArrayList<>(heads.keySet());
        codes.sort(CODED_ID_ORDER);
        List<Map<String, Object>> specs = new ArrayList<>();
        for (String code : codes) {
            CrfForm a = resolveLatestAtom(code);
            if (a == null) continue;
            Map<String, Object> spec = new LinkedHashMap<>();
            spec.put("atomCode", a.getCode());
            spec.put("atomFormId", a.getId());
            specs.add(spec);
        }
        String suiteName;
        try {
            var d = dictionaryService.requireByKey(suite);
            suiteName = d.getName() != null ? d.getName() : suite;
        } catch (IllegalArgumentException ex) {
            suiteName = suite;
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("formKey", formKey);
        body.put("title", title == null ? (suiteName + " · 组合模板") : title);
        body.put("atoms", specs);
        return compose(body);
    }

    /**
     * 将字段字典 structure 中的域/子模块显示名写回该套原子与组合模板的 crf_template_section.label。
     * 用于改名后填写侧大纲立即可读；也可手动触发「同步大纲名称到原子」。
     */
    @Transactional
    public Result<Map<String, Object>> syncOutlineNamesFromStructure(String dictKey) {
        String suite = NhpAtomFormKeys.normalizeDictKey(dictKey);
        dictionaryService.requireByKey(suite);
        Map<String, String> nameByCode = loadStructureNameMap(suite);
        if (nameByCode.isEmpty()) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("dictKey", suite);
            empty.put("formsTouched", 0);
            empty.put("sectionsUpdated", 0);
            return Result.success(empty, "大纲尚无可用中文名，未更新章节");
        }
        int formsTouched = 0;
        int sectionsUpdated = 0;
        Set<Long> seen = new LinkedHashSet<>();
        for (CrfForm atom : formMapper.listAtoms()) {
            if (atom == null || atom.getId() == null || !seen.add(atom.getId())) continue;
            if (!NhpAtomFormKeys.matchesDictKey(atom.getCode(), suite)) continue;
            int n = applyStructureNamesToFormSections(atom.getId(), nameByCode);
            if (n > 0) {
                formsTouched++;
                sectionsUpdated += n;
            }
            // 原子表单标题若仍是编码，一并换成域中文名
            NhpAtomFormKeys.Parsed p = NhpAtomFormKeys.parse(atom.getCode());
            if (p != null) {
                String domainLabel = resolveDomainLabel(p.domainCode(), nameByCode);
                String curName = atom.getName() == null ? "" : atom.getName().trim();
                if (domainLabel != null && !domainLabel.isBlank()
                        && (curName.isEmpty() || curName.equalsIgnoreCase(p.domainCode())
                        || curName.equalsIgnoreCase(atom.getCode()))) {
                    String titled = NhpAtomFormKeys.DEFAULT_DICT_KEY.equals(suite)
                            ? domainLabel
                            : suite + " · " + domainLabel;
                    atom.setName(titled);
                    formMapper.update(atom);
                }
            }
        }
        for (CrfForm comp : formMapper.listComposites()) {
            if (comp == null || comp.getId() == null || !seen.add(comp.getId())) continue;
            String compSuite = inferCompositeDictKeyFromForm(comp);
            if (compSuite == null || !suite.equals(compSuite)) continue;
            int n = applyStructureNamesToFormSections(comp.getId(), nameByCode);
            if (n > 0) {
                formsTouched++;
                sectionsUpdated += n;
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("dictKey", suite);
        out.put("formsTouched", formsTouched);
        out.put("sectionsUpdated", sectionsUpdated);
        return Result.success(out);
    }

    /** 按 code 匹配更新章节 label；无中文名映射的节点跳过。 */
    private int applyStructureNamesToFormSections(Long formId, Map<String, String> nameByCode) {
        if (formId == null || nameByCode == null || nameByCode.isEmpty()) return 0;
        List<CrfTemplateSection> sections = sectionMapper.listByFormId(formId);
        if (sections == null || sections.isEmpty()) return 0;
        int n = 0;
        for (CrfTemplateSection sec : sections) {
            if (sec == null || sec.getCode() == null) continue;
            String code = sec.getCode().trim();
            String upper = code.toUpperCase(Locale.ROOT);
            String label;
            if (upper.contains(".")) {
                label = resolveSubmoduleLabel(upper, nameByCode);
                // resolveSubmoduleLabel 无映射时退回 code 本身——勿用其覆盖已有中文
                if (label == null || label.isBlank() || label.equalsIgnoreCase(upper)) {
                    String fromMap = nameByCode.get(upper);
                    if (fromMap == null || fromMap.isBlank()) continue;
                    label = fromMap;
                }
            } else {
                label = resolveDomainLabel(upper, nameByCode);
            }
            if (label == null || label.isBlank()) continue;
            String cur = sec.getLabel() == null ? "" : sec.getLabel().trim();
            if (cur.equals(label)) continue;
            sectionMapper.updateLabel(sec.getId(), label);
            n++;
        }
        return n;
    }

    /**
     * 套内有 FROZEN 字段的域码集合（猪套折叠 DD*→D*），相对当前活跃原子，返回缺失域码列表。
     */
    public List<String> listMissingAtomDomains(String dictKey) {
        String suite = NhpAtomFormKeys.normalizeDictKey(dictKey);
        var dict = dictionaryService.requireByKey(suite);
        List<CrfField> fields = fieldMapper.listByDictionary(dict.getId());
        Set<String> domainsWithFrozen = new LinkedHashSet<>();
        if (fields != null) {
            for (CrfField f : fields) {
                if (f == null || f.getFieldCode() == null) continue;
                String st = f.getStatus() == null ? "" : f.getStatus().toUpperCase(Locale.ROOT);
                if (!"FROZEN".equals(st) && !"PUBLISHED".equals(st)) continue;
                String domain = NhpAtomFormKeys.domainOfFieldCode(f.getFieldCode());
                if (domain == null) continue;
                if (NhpAtomFormKeys.DEFAULT_DICT_KEY.equals(suite)) {
                    domain = NhpAtomFormKeys.canonicalPigDomainCode(domain);
                }
                if (domain != null) {
                    domainsWithFrozen.add(domain);
                }
            }
        }
        List<String> missing = new ArrayList<>();
        for (String domain : domainsWithFrozen) {
            String atomKey = NhpAtomFormKeys.atomFormKey(suite, domain);
            if (formMapper.findByCode(atomKey) == null) {
                missing.add(domain);
            }
        }
        missing.sort(CODED_ID_ORDER);
        return missing;
    }

    /**
     * 检测缺失原子；{@code generate=true} 时按字典 FROZEN 字段一键补生成。
     * 返回 missingAtomDomains / atomsRegenerated / atomsFailed（含原因）。
     */
    @Transactional
    public Result<Map<String, Object>> ensureMissingAtomsFromDict(String dictKey, boolean generate) {
        String suite = NhpAtomFormKeys.normalizeDictKey(dictKey);
        try {
            dictionaryService.requireByKey(suite);
        } catch (IllegalArgumentException ex) {
            return Result.fail(400, ex.getMessage());
        }
        List<String> missing = listMissingAtomDomains(suite);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("dictKey", suite);
        out.put("missingAtomDomains", missing);
        out.put("missingCount", missing.size());
        List<String> regenerated = new ArrayList<>();
        List<Map<String, String>> failed = new ArrayList<>();
        if (generate) {
            for (String domain : missing) {
                String title = DOMAIN_LABELS.getOrDefault(domain, domain);
                if (!NhpAtomFormKeys.DEFAULT_DICT_KEY.equals(suite)) {
                    title = suite + " · " + title;
                }
                Result<Object> r = generate(domain, title, suite);
                if (Boolean.TRUE.equals(r.getSuccess())) {
                    regenerated.add(domain);
                } else {
                    Map<String, String> err = new LinkedHashMap<>();
                    err.put("domain", domain);
                    err.put("message", r.getMessage() != null ? r.getMessage() : "生成失败");
                    failed.add(err);
                }
            }
        }
        out.put("atomsRegenerated", regenerated);
        out.put("atomsFailed", failed);
        out.put("generated", generate);
        return Result.success(out);
    }

    private Long resolveDictionaryId(String dictKey) {
        if (dictKey != null && !dictKey.isBlank()) {
            return dictionaryService.requireByKey(dictKey).getId();
        }
        var def = dictionaryService.resolveDefault();
        return def == null ? null : def.getId();
    }

    @Transactional
    public Result<?> publish(String formKey, String hostType) {
        CrfForm form = resolveEditableOrLatest(formKey);
        if (form == null) {
            return Result.error("模板不存在");
        }
        // 原子与组合均可发布：原子=独立可填表单；组合=多原子快照
        if (!"DRAFT".equals(form.getStatus()) && !"FREEZING".equals(form.getStatus())) {
            return Result.fail(400, "仅 DRAFT/FREEZING 状态可发布，当前 " + form.getStatus());
        }
        if (isAtom(form) && isAtomVersionPinned(form.getId())) {
            return Result.fail(409, "该原子版本已被组合钉住，请「新建版本」编辑后再发布独立表单。"
                    + formatPinBlockMessage(buildReferencedBy(form.getId())));
        }
        // 发布时确定「载体」（宿主）：原子须选供体/受体；组合（快照）不强制
        if (hostType != null && !hostType.isBlank()) {
            String ht = hostType.trim().toUpperCase();
            if (!"DONOR".equals(ht) && !"RECIPIENT".equals(ht)) {
                return Result.fail(400, "hostType 须为 DONOR/RECIPIENT");
            }
            if (!ht.equals(form.getHostType())) {
                form.setHostType(ht);
                formMapper.update(form);
            }
        }
        // 同 code 上一 FROZEN → ARCHIVED
        for (CrfForm v : formMapper.listByCode(formKey)) {
            if (!v.getId().equals(form.getId()) && "FROZEN".equals(v.getStatus())) {
                formMapper.updateStatus(v.getId(), "ARCHIVED");
            }
        }
        formMapper.updateStatus(form.getId(), "FROZEN");
        return Result.success(toListItem(formMapper.findById(form.getId())));
    }

    /**
     * 解冻：FROZEN/PUBLISHED → DRAFT。
     * 无活跃填写实例（软删不计）；原子另须无组合钉住。仍有占用时 409 并列出剩余引用。
     */
    @Transactional
    public Result<?> unfreeze(String formKey, String operator) {
        if (formKey == null || formKey.isBlank()) {
            return Result.fail(400, "formKey 不能为空");
        }
        CrfForm published = null;
        for (CrfForm v : formMapper.listByCode(formKey.trim())) {
            String st = v.getStatus() == null ? "" : v.getStatus().trim().toUpperCase();
            if ("FROZEN".equals(st) || "PUBLISHED".equals(st)) {
                published = v;
                break;
            }
        }
        if (published == null) {
            return Result.error("模板不存在或无可解冻的已发布版本");
        }
        long fills = recordMapper.countActiveByFormId(published.getId());
        List<Map<String, Object>> pins = List.of();
        if (isAtom(published)) {
            purgeOrphanCompositePins(published.getId());
            pins = buildReferencedBy(published.getId());
        }
        if (fills > 0 || !pins.isEmpty()) {
            List<String> parts = new ArrayList<>();
            if (fills > 0) {
                parts.add("活跃填写实例 " + fills + " 条（已软删不计）");
            }
            if (!pins.isEmpty()) {
                parts.add("组合钉住：" + formatPinBlockMessage(pins));
            }
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("activeFills", fills);
            data.put("referencedBy", pins);
            Result<Map<String, Object>> blocked = Result.fail(409,
                    "无法解冻「" + published.getCode() + "」@v" + published.getVersion()
                            + "——" + String.join("；", parts)
                            + "。清占用后再解冻，或「新建版本」演进。");
            blocked.setData(data);
            return blocked;
        }
        String before = published.getStatus();
        formMapper.updateStatus(published.getId(), "DRAFT");
        Map<String, Object> out = toListItem(formMapper.findById(published.getId()));
        out.put("unfrozenBy", operator == null || operator.isBlank() ? "unknown" : operator.trim());
        out.put("previousStatus", before);
        return Result.success(out, "已解冻为草稿，可直接编辑");
    }

    /**
     * 恢复已归档版本为已发布（ARCHIVED → FROZEN），不进入草稿编辑态。
     * 同 formKey 其它 FROZEN 归档，保证至多一个已发布版。
     */
    @Transactional
    public Result<?> restoreArchived(String formKey, String operator) {
        if (formKey == null || formKey.isBlank()) {
            return Result.fail(400, "formKey 不能为空");
        }
        CrfForm archived = null;
        for (CrfForm v : formMapper.listByCode(formKey.trim())) {
            String st = v.getStatus() == null ? "" : v.getStatus().trim().toUpperCase();
            if ("ARCHIVED".equals(st)) {
                archived = v;
                break;
            }
        }
        if (archived == null) {
            return Result.error("模板不存在或无可恢复的已归档版本");
        }
        for (CrfForm v : formMapper.listByCode(formKey.trim())) {
            String st = v.getStatus() == null ? "" : v.getStatus().trim().toUpperCase();
            if (!v.getId().equals(archived.getId()) && ("FROZEN".equals(st) || "PUBLISHED".equals(st))) {
                formMapper.updateStatus(v.getId(), "ARCHIVED");
            }
        }
        formMapper.updateStatus(archived.getId(), "FROZEN");
        return Result.success(toListItem(formMapper.findById(archived.getId())), "已恢复为已发布版本");
    }

    /**
     * 新建版本：原子/组合均优先从最新已发布版克隆；若尚无发布则用最新版。已有草稿则冲突。
     */
    @Transactional
    public Result<Object> createDraftVersion(String formKey) {
        CrfForm source = formMapper.findByCode(formKey);
        if (source == null) {
            return Result.error("模板不存在");
        }
        // 允许多个 DRAFT 并存：版号由 NhpVersionAllocator 补位，天然不冲突；
        // 每次从最新已发布版克隆，避免草稿之间互相污染。
        // 优先从最新 FROZEN/PUBLISHED 拷贝（原子独立发布后同样适用）
        CrfForm published = null;
        for (CrfForm v : formMapper.listByCode(formKey)) {
            if ("FROZEN".equals(v.getStatus()) || "PUBLISHED".equals(v.getStatus())) {
                published = v;
                break;
            }
        }
        if (published == null) {
            published = source;
        }
        int next = NhpVersionAllocator.nextAvailable(formMapper.listActiveVersionsByCode(formKey));
        // 组合升版强制 TEMPLATE，避免从误标 DOMAIN 的源行继续污染
        String nextType = isComposite(published) ? TYPE_TEMPLATE
                : (published.getFormType() != null ? published.getFormType() : atomTypeFor(published.getCode()));
        CrfForm neu = newForm(published.getCode(), published.getName(), nextType, next, "DRAFT");
        neu.setDescription(published.getDescription());
        // 补位到软删槽：复活同行，勿 INSERT（防 uk_crf_form_study_code_ver）
        neu = insertOrReactivate(neu);

        // 拷贝呈现层快照
        Map<String, Object> json = buildTemplateJson(published);
        persistSections(neu.getId(), sectionsOf(json));
        // 拷贝原子钉版本引用（组合码强制拷贝；源版本无钉时回退其它版本，避免升出版空壳）
        if (isComposite(published) || isComposite(neu)) {
            List<CrfCompositeAtom> refs = compositeAtomMapper.listByCompositeFormId(published.getId());
            if (refs == null || refs.isEmpty()) {
                for (CrfForm v : formMapper.listByCode(formKey)) {
                    if (v.getId().equals(neu.getId())) continue;
                    List<CrfCompositeAtom> cand = compositeAtomMapper.listByCompositeFormId(v.getId());
                    if (cand != null && !cand.isEmpty()) {
                        refs = cand;
                        break;
                    }
                }
            }
            if (refs != null && !refs.isEmpty()) {
                List<Map<String, Object>> atomSpecs = new ArrayList<>();
                for (CrfCompositeAtom r : refs) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("atomCode", r.getAtomCode());
                    m.put("atomFormId", r.getAtomFormId());
                    m.put("sortOrder", r.getSortOrder());
                    atomSpecs.add(m);
                }
                persistAtomRefs(neu.getId(), atomSpecs);
            }
        }
        return Result.success(buildTemplateJson(formMapper.findById(neu.getId())));
    }


    /**
     * Soft-delete one template version (atom or composite).
     * Blocked when fill instances still reference it, or an atom version is pinned by a composite.
     * 软删单个模板版本；填写实例引用或原子被组合钉住时拒绝。
     */
    @Transactional
    public Result<?> deleteVersion(Long formId) {
        if (formId == null) {
            return Result.fail(400, "formId 不能为空");
        }
        CrfForm form = formMapper.findById(formId);
        if (form == null || !Boolean.TRUE.equals(form.getActive())) {
            return Result.error("模板版本不存在或已删除");
        }
        long fills = recordMapper.countActiveByFormId(formId);
        if (fills > 0) {
            return Result.fail(409, "该版本仍有 " + fills + " 条填写实例引用，无法删除。请先处理填写实例。");
        }
        if (isAtom(form)) {
            purgeOrphanCompositePins(form.getId());
            List<Map<String, Object>> pins = buildReferencedBy(form.getId());
            if (!pins.isEmpty()) {
                return Result.fail(409, "该原子版本已被组合模板钉住引用，无法删除。"
                        + formatPinBlockMessage(pins)
                        + " 请先到「组合模板」页（可切「全部套」）删除相关组合版本；软删组合会解除钉住。无填写实例的系统种子/重组升版可用「强制清理无实例种子组合」。");
            }
        }
        // 组合（含误标 DOMAIN 的 nhp-crf）或仍有钉住行：清引用后再软删
        if (isComposite(form) || !compositeAtomMapper.listByCompositeFormId(formId).isEmpty()) {
            compositeAtomMapper.deleteByCompositeFormId(formId);
            if (!TYPE_TEMPLATE.equals(form.getFormType())) {
                form.setFormType(TYPE_TEMPLATE);
                formMapper.update(form);
            }
        }
        formMapper.softDelete(formId);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("formId", formId);
        data.put("formKey", form.getCode());
        data.put("version", form.getVersion());
        data.put("kind", isComposite(form) ? KIND_COMPOSITE : KIND_ATOM);
        data.put("deleted", true);
        return Result.success(data);
    }

    /**
     * Soft-delete all active versions under a formKey (cleanup messy versions).
     * Referenced versions are skipped and reported.
     * 软删某 formKey 下全部活跃版本；被引用的跳过并汇总原因。
     */
    @Transactional
    public Result<?> deleteAllVersions(String formKey) {
        if (formKey == null || formKey.isBlank()) {
            return Result.fail(400, "formKey 不能为空");
        }
        List<CrfForm> rows = formMapper.listByCode(formKey.trim());
        if (rows == null || rows.isEmpty()) {
            return Result.error("模板不存在: " + formKey);
        }
        int deleted = 0;
        List<String> blocked = new ArrayList<>();
        for (CrfForm f : new ArrayList<>(rows)) {
            Result<?> r = deleteVersion(f.getId());
            if (Boolean.TRUE.equals(r.getSuccess())) {
                deleted++;
            } else {
                blocked.add("v" + f.getVersion() + ": " + r.getMessage());
            }
        }
        if (deleted == 0) {
            return Result.fail(409, "无法删除「" + formKey + "」——" + String.join("；", blocked));
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("formKey", formKey.trim());
        data.put("deletedCount", deleted);
        data.put("blocked", blocked);
        String msg = blocked.isEmpty()
                ? ("已删除 " + deleted + " 个版本")
                : ("已删除 " + deleted + " 个版本；部分未删：" + String.join("；", blocked));
        return Result.success(data, msg);
    }

    /**
     * 批量软删模板：按 formKey 逐个删全部活跃版本（复用单 key 删除的占用校验）。
     * 被填写实例引用 / 被组合钉住的版本会跳过，汇总到 blocked。
     */
    @Transactional
    public Result<Map<String, Object>> batchDeleteAllVersions(List<String> formKeys) {
        if (formKeys == null || formKeys.isEmpty()) {
            return Result.fail(400, "请至少选择一个模板");
        }
        List<String> keys = formKeys.stream()
                .filter(k -> k != null && !k.isBlank())
                .map(String::trim)
                .distinct()
                .toList();
        if (keys.isEmpty()) {
            return Result.fail(400, "请至少选择一个模板");
        }
        int deletedCount = 0;
        List<String> deletedKeys = new ArrayList<>();
        List<String> blocked = new ArrayList<>();
        for (String key : keys) {
            Result<?> r = deleteAllVersions(key);
            if (Boolean.TRUE.equals(r.getSuccess())) {
                deletedKeys.add(key);
                if (r.getData() instanceof Map<?, ?> m && m.get("deletedCount") instanceof Number n) {
                    deletedCount += n.intValue();
                }
            } else {
                blocked.add(key + "：" + (r.getMessage() == null ? "无活跃版本可删或全部被引用" : r.getMessage()));
            }
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("deletedCount", deletedCount);
        data.put("deletedKeys", deletedKeys);
        data.put("blocked", blocked);
        if (deletedCount == 0) {
            return Result.fail(409, "批量删除未成功删除任何版本——" + String.join("；", blocked));
        }
        String msg = blocked.isEmpty()
                ? ("已批量删除 " + deletedKeys.size() + " 个模板（" + deletedCount + " 个版本）")
                : ("已批量删除 " + deletedKeys.size() + " 个模板（" + deletedCount + " 个版本）；部分未删：" + String.join("；", blocked));
        return Result.success(data, msg);
    }

    /**
     * Soft-delete SEED / AUTO_COMPOSE composites that have no fill instances.
     * Also soft-deletes sibling versions under the same formKey (e.g. early nhp-crf v1
     * without [SEED] description) so mislabeled stock is fully removed.
     * 强制清理无填写实例的种子/自动升版组合，解除对原子的钉住。
     */
    @Transactional
    public Result<?> cleanupUnusedSeedComposites() {
        List<CrfForm> composites = formMapper.listComposites();
        Set<String> seedKeys = new LinkedHashSet<>();
        for (CrfForm f : composites) {
            if (f == null) continue;
            String origin = originOf(f);
            if ("SEED".equals(origin) || "AUTO_COMPOSE".equals(origin)) {
                seedKeys.add(f.getCode());
            }
        }
        int deleted = 0;
        List<String> skipped = new ArrayList<>();
        Set<Long> seen = new LinkedHashSet<>();
        for (CrfForm f : composites) {
            if (f == null || f.getId() == null || !seen.add(f.getId())) continue;
            String origin = originOf(f);
            boolean seedFamily = seedKeys.contains(f.getCode())
                    || "SEED".equals(origin)
                    || "AUTO_COMPOSE".equals(origin);
            if (!seedFamily) continue;
            // 顺带纠正误标，便于列表/删除路径一致
            if (!TYPE_TEMPLATE.equals(f.getFormType()) && isComposite(f)) {
                f.setFormType(TYPE_TEMPLATE);
                formMapper.update(f);
            }
            long fills = recordMapper.countActiveByFormId(f.getId());
            if (fills > 0) {
                skipped.add(f.getCode() + "@v" + f.getVersion() + "（仍有 " + fills + " 条填写实例）");
                continue;
            }
            compositeAtomMapper.deleteByCompositeFormId(f.getId());
            formMapper.softDelete(f.getId());
            deleted++;
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("deletedCount", deleted);
        data.put("skipped", skipped);
        String msg = skipped.isEmpty()
                ? ("已软删 " + deleted + " 个无实例的种子/自动组合版本，原子钉住已解除")
                : ("已软删 " + deleted + " 个；跳过：" + String.join("；", skipped));
        return Result.success(data, msg);
    }

    /* ── JSON ↔ 关系表 ── */

    private void applyScheduleFields(CrfForm form, Map<String, Object> template) {
        if (form == null || template == null) return;
        if (template.containsKey("captureForm")) {
            Object v = template.get("captureForm");
            form.setCaptureForm(v == null || String.valueOf(v).isBlank() ? null : String.valueOf(v).trim());
        }
        if (template.containsKey("eventAnchor")) {
            Object v = template.get("eventAnchor");
            form.setEventAnchor(v == null || String.valueOf(v).isBlank() ? null : String.valueOf(v).trim());
        }
        if (template.containsKey("frequency")) {
            Object v = template.get("frequency");
            form.setFrequency(v == null || String.valueOf(v).isBlank() ? null : String.valueOf(v).trim());
        }
    }

    /** 归属挂在 formKey 上而非单个版本行：头行为新建版本时回退查同 code 的既有归属。 */
    private Long resolveFolderId(CrfForm f) {
        if (f.getFolderId() != null) {
            return f.getFolderId();
        }
        return f.getCode() == null ? null : formMapper.findFolderIdByCode(f.getCode());
    }

    private Map<String, Object> toListItem(CrfForm f) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("formId", f.getId());
        m.put("formKey", f.getCode());
        m.put("title", f.getName());
        m.put("status", normalizeStatus(f.getStatus()));
        m.put("version", f.getVersion());
        m.put("formType", f.getFormType());
        m.put("kind", isComposite(f) ? KIND_COMPOSITE : KIND_ATOM);
        m.put("description", f.getDescription());
        m.put("origin", originOf(f));
        m.put("updatedAt", f.getUpdatedAt());
        m.put("captureForm", f.getCaptureForm());
        m.put("eventAnchor", f.getEventAnchor());
        m.put("frequency", f.getFrequency());
        m.put("hostType", f.getHostType());
        m.put("folderId", resolveFolderId(f));
        // 列表头可能是更新后的草稿；附带最新已发布版，避免「看不到已发布表」
        attachPublishedMeta(m, f.getCode());
        if (isAtom(f)) {
            attachAtomSuiteMeta(m, f.getCode());
        }
        if (isComposite(f)) {
            List<Map<String, Object>> atoms = new ArrayList<>();
            for (CrfCompositeAtom r : compositeAtomMapper.listByCompositeFormId(f.getId())) {
                Map<String, Object> a = new LinkedHashMap<>();
                a.put("atomCode", r.getAtomCode());
                a.put("atomFormId", r.getAtomFormId());
                a.put("sortOrder", r.getSortOrder());
                CrfForm pin = formMapper.findById(r.getAtomFormId());
                if (pin != null) {
                    a.put("atomTitle", pin.getName());
                    a.put("atomVersion", pin.getVersion());
                    a.put("atomStatus", normalizeStatus(pin.getStatus()));
                }
                atoms.add(a);
            }
            m.put("atoms", atoms);
            m.put("atomCount", atoms.size());
            String suite = inferCompositeDictKey(atoms);
            if (suite != null) m.put("dictKey", suite);
        } else if (isAtom(f)) {
            m.put("referencedBy", buildReferencedBy(f.getId()));
            m.put("locked", isAtomVersionPinned(f.getId()));
        }
        return m;
    }

    /** 扫描同 formKey 版本（version DESC），挂上最新已发布版元数据。 */
    private void attachPublishedMeta(Map<String, Object> m, String formKey) {
        if (formKey == null || formKey.isBlank()) {
            m.put("hasPublished", false);
            return;
        }
        for (CrfForm v : formMapper.listByCode(formKey)) {
            String st = v.getStatus() == null ? "" : v.getStatus().trim().toUpperCase();
            if ("FROZEN".equals(st) || "PUBLISHED".equals(st)) {
                m.put("hasPublished", true);
                m.put("publishedFormId", v.getId());
                m.put("publishedVersion", v.getVersion());
                m.put("publishedStatus", normalizeStatus(v.getStatus()));
                return;
            }
        }
        m.put("hasPublished", false);
    }

    private Map<String, Object> buildTemplateJson(CrfForm form) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("formId", form.getId());
        out.put("formKey", form.getCode());
        out.put("title", form.getName());
        out.put("status", normalizeStatus(form.getStatus()));
        out.put("version", form.getVersion());
        out.put("formType", form.getFormType());
        out.put("kind", isComposite(form) ? KIND_COMPOSITE : KIND_ATOM);
        out.put("description", form.getDescription());
        out.put("origin", originOf(form));
        out.put("captureForm", form.getCaptureForm());
        out.put("eventAnchor", form.getEventAnchor());
        out.put("frequency", form.getFrequency());
        out.put("hostType", form.getHostType());
        if (isAtom(form)) {
            attachAtomSuiteMeta(out, form.getCode());
        }

        List<CrfTemplateSection> sections = sectionMapper.listByFormId(form.getId());
        List<CrfTemplateField> fields = fieldTmplMapper.listByFormId(form.getId());

        Map<Long, List<Map<String, Object>>> fieldsBySection = new LinkedHashMap<>();
        for (CrfTemplateField f : fields) {
            fieldsBySection.computeIfAbsent(f.getSectionId(), k -> new ArrayList<>()).add(toFieldJson(f));
        }

        List<Map<String, Object>> sectionJson = new ArrayList<>();
        for (CrfTemplateSection s : sections) {
            if (s.getParentId() != null) continue;
            Map<String, Object> sec = toSectionJson(s);
            List<Map<String, Object>> subs = new ArrayList<>();
            for (CrfTemplateSection sub : sections) {
                if (s.getId().equals(sub.getParentId())) {
                    Map<String, Object> subJson = toSectionJson(sub);
                    List<Map<String, Object>> subFields = new ArrayList<>(fieldsBySection.getOrDefault(sub.getId(), List.of()));
                    subFields.sort(Comparator.comparing(m -> String.valueOf(m.getOrDefault("fieldKey", "")), CODED_ID_ORDER));
                    subJson.put("fields", subFields);
                    subs.add(subJson);
                }
            }
            subs.sort(Comparator.comparing(m -> String.valueOf(m.getOrDefault("code", "")), CODED_ID_ORDER));
            sec.put("subsections", subs);
            List<Map<String, Object>> topFields = new ArrayList<>(fieldsBySection.getOrDefault(s.getId(), List.of()));
            topFields.sort(Comparator.comparing(m -> String.valueOf(m.getOrDefault("fieldKey", "")), CODED_ID_ORDER));
            sec.put("fields", topFields);
            sectionJson.add(sec);
        }
        sectionJson.sort(Comparator.comparing(m -> String.valueOf(m.getOrDefault("code", "")), CODED_ID_ORDER));
        out.put("sections", sectionJson);

        if (isComposite(form)) {
            List<Map<String, Object>> atoms = new ArrayList<>();
            for (CrfCompositeAtom r : compositeAtomMapper.listByCompositeFormId(form.getId())) {
                Map<String, Object> a = new LinkedHashMap<>();
                a.put("atomCode", r.getAtomCode());
                a.put("atomFormId", r.getAtomFormId());
                a.put("sortOrder", r.getSortOrder());
                CrfForm pin = formMapper.findById(r.getAtomFormId());
                if (pin != null) {
                    a.put("atomTitle", pin.getName());
                    a.put("atomVersion", pin.getVersion());
                    a.put("atomStatus", normalizeStatus(pin.getStatus()));
                }
                atoms.add(a);
            }
            out.put("atoms", atoms);
            String suite = inferCompositeDictKey(atoms);
            if (suite != null) out.put("dictKey", suite);
        }
        if (isAtom(form)) {
            out.put("referencedBy", buildReferencedBy(form.getId()));
            out.put("locked", isAtomVersionPinned(form.getId()));
        }
        return out;
    }

    private Map<String, Object> toSectionJson(CrfTemplateSection s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("code", s.getCode());
        m.put("label", s.getLabel());
        m.put("sortOrder", s.getSortOrder());
        m.put("subdivisible", Boolean.TRUE.equals(s.getSubdivisible()));
        if (s.getShowWhen() != null) m.put("showWhen", fromJson(s.getShowWhen()));
        if (s.getDescription() != null) m.put("description", s.getDescription());
        return m;
    }

    private Map<String, Object> toFieldJson(CrfTemplateField f) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("fieldKey", f.getFieldKey());
        m.put("label", f.getLabel());
        if (f.getDescription() != null) m.put("description", f.getDescription());
        m.put("type", f.getType());
        m.put("required", Boolean.TRUE.equals(f.getRequired()));
        if (f.getOptions() != null) m.put("options", fromJson(f.getOptions()));
        if (f.getDictKey() != null) m.put("dictKey", f.getDictKey());
        if (f.getRole() != null) m.put("role", f.getRole());
        if (f.getRoleMeta() != null) m.put("roleMeta", fromJson(f.getRoleMeta()));
        if (f.getShowWhen() != null) m.put("showWhen", fromJson(f.getShowWhen()));
        m.put("sortOrder", f.getSortOrder());
        if (f.getConfig() != null) m.put("config", fromJson(f.getConfig()));
        return m;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> sectionsOf(Map<String, Object> template) {
        if (template == null) return List.of();
        Object sections = template.get("sections");
        if (!(sections instanceof List<?> list)) return List.of();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object o : list) {
            if (o instanceof Map<?, ?> m) out.add((Map<String, Object>) m);
        }
        return out;
    }

    private void persistSections(Long formId, List<Map<String, Object>> sections) {
        sectionMapper.deleteByFormId(formId);
        fieldTmplMapper.deleteByFormId(formId);
        int secOrder = 0;
        for (Map<String, Object> sec : sections) {
            CrfTemplateSection secRow = new CrfTemplateSection();
            secRow.setFormId(formId);
            String secCode = str(sec.get("code"));
            secRow.setCode(secCode);
            secRow.setLabel(NhpTemplateSectionLabels.resolve(secCode, str(sec.get("label"))));
            secRow.setSortOrder(secOrder++);
            secRow.setSubdivisible(Boolean.TRUE.equals(sec.get("subdivisible")));
            secRow.setShowWhen(toJson(sec.get("showWhen")));
            secRow.setDescription(str(sec.get("description")));
            sectionMapper.insert(secRow);

            List<Map<String, Object>> subs = listOf(sec.get("subsections"));
            int subOrder = 0;
            for (Map<String, Object> sub : subs) {
                CrfTemplateSection subRow = new CrfTemplateSection();
                subRow.setFormId(formId);
                subRow.setParentId(secRow.getId());
                String subCode = str(sub.get("code"));
                subRow.setCode(subCode);
                subRow.setLabel(NhpTemplateSectionLabels.resolve(subCode, str(sub.get("label"))));
                subRow.setSortOrder(subOrder++);
                subRow.setSubdivisible(false);
                subRow.setShowWhen(toJson(sub.get("showWhen")));
                subRow.setDescription(str(sub.get("description")));
                sectionMapper.insert(subRow);
                persistFields(formId, subRow.getId(), listOf(sub.get("fields")));
            }
            persistFields(formId, secRow.getId(), listOf(sec.get("fields")));
        }
    }

    private void persistFields(Long formId, Long sectionId, List<Map<String, Object>> fields) {
        int order = 0;
        for (Map<String, Object> f : fields) {
            CrfTemplateField row = new CrfTemplateField();
            row.setFormId(formId);
            row.setSectionId(sectionId);
            row.setFieldKey(str(f.get("fieldKey")));
            row.setLabel(str(f.get("label")));
            row.setDescription(str(f.get("description")));
            row.setType(str(f.get("type")));
            row.setOptions(toJson(f.get("options")));
            row.setDictKey(str(f.get("dictKey")));
            row.setRole(str(f.get("role")));
            row.setRoleMeta(toJson(f.get("roleMeta")));
            row.setRequired(Boolean.TRUE.equals(f.get("required")));
            row.setShowWhen(toJson(f.get("showWhen")));
            row.setSortOrder(order++);
            row.setConfig(toJson(f.get("config")));
            fieldTmplMapper.insert(row);
        }
    }

    private void persistAtomRefs(Long compositeFormId, List<Map<String, Object>> atoms) {
        compositeAtomMapper.deleteByCompositeFormId(compositeFormId);
        int order = 0;
        for (Map<String, Object> a : atoms) {
            String atomCode = str(a.get("atomCode"));
            Long atomFormId = asLong(a.get("atomFormId"));
            if (atomCode == null || atomFormId == null) continue;
            CrfCompositeAtom row = new CrfCompositeAtom();
            row.setCompositeFormId(compositeFormId);
            row.setAtomCode(atomCode);
            row.setAtomFormId(atomFormId);
            Integer so = a.get("sortOrder") instanceof Number n ? n.intValue() : order;
            row.setSortOrder(so != null ? so : order);
            compositeAtomMapper.insert(row);
            order++;
        }
    }

    private List<Map<String, Object>> buildSectionsFromDict(List<CrfField> fields, String dictKey) {
        Map<String, String> nameByCode = loadStructureNameMap(dictKey);
        Map<String, Map<String, List<Map<String, Object>>>> grouped = new LinkedHashMap<>();
        List<CrfField> ordered = new ArrayList<>(fields);
        ordered.sort(Comparator.comparing(f -> f.getFieldCode() == null ? "" : f.getFieldCode(), CODED_ID_ORDER));
        for (CrfField f : ordered) {
            String[] seg = f.getFieldCode() == null ? new String[]{"D1", "00"} : f.getFieldCode().split("\\.");
            String domain = seg.length > 0 ? seg[0] : "D1";
            String sub = seg.length > 1 ? seg[0] + "." + seg[1] : domain + ".00";
            grouped.computeIfAbsent(domain, k -> new LinkedHashMap<>())
                    .computeIfAbsent(sub, k -> new ArrayList<>())
                    .add(toDictField(f));
        }
        List<String> domainKeys = new ArrayList<>(grouped.keySet());
        domainKeys.sort(CODED_ID_ORDER);
        List<Map<String, Object>> sections = new ArrayList<>();
        for (String domain : domainKeys) {
            Map<String, List<Map<String, Object>>> subs = grouped.get(domain);
            Map<String, Object> section = new LinkedHashMap<>();
            section.put("code", domain);
            section.put("label", resolveDomainLabel(domain, nameByCode));
            section.put("subdivisible", true);
            List<String> subKeys = new ArrayList<>(subs.keySet());
            subKeys.sort(CODED_ID_ORDER);
            List<Map<String, Object>> subsections = new ArrayList<>();
            for (String sub : subKeys) {
                Map<String, Object> ss = new LinkedHashMap<>();
                ss.put("code", sub);
                ss.put("label", resolveSubmoduleLabel(sub, nameByCode));
                ss.put("fields", subs.get(sub));
                subsections.add(ss);
            }
            section.put("subsections", subsections);
            sections.add(section);
        }
        return sections;
    }

    /** 字段字典大纲 code→中文名（域 + 子模块） */
    private Map<String, String> loadStructureNameMap(String dictKey) {
        Map<String, String> out = new LinkedHashMap<>();
        if (dictKey == null || dictKey.isBlank()) return out;
        try {
            var res = dictionaryService.getStructure(dictKey);
            if (res == null || !Boolean.TRUE.equals(res.getSuccess()) || res.getData() == null) return out;
            Object domains = res.getData().get("domains");
            if (!(domains instanceof List<?> list)) return out;
            for (Object o : list) {
                if (!(o instanceof Map<?, ?> dm)) continue;
                String code = str(dm.get("code"));
                String name = str(dm.get("name"));
                if (code != null && name != null && !name.isBlank() && !name.equalsIgnoreCase(code)) {
                    out.put(code.toUpperCase(Locale.ROOT), name);
                }
                Object subs = dm.get("submodules");
                if (!(subs instanceof List<?> sl)) continue;
                for (Object so : sl) {
                    if (!(so instanceof Map<?, ?> sm)) continue;
                    String sc = str(sm.get("code"));
                    String sn = str(sm.get("name"));
                    if (sc != null && sn != null && !sn.isBlank() && !sn.equalsIgnoreCase(sc)) {
                        out.put(sc.toUpperCase(Locale.ROOT), sn);
                    }
                }
            }
        } catch (Exception ignored) {
            // 结构缺失时退回 DOMAIN_LABELS
        }
        return out;
    }

    private String resolveDomainLabel(String domain, Map<String, String> nameByCode) {
        if (domain == null) return "数据域";
        String upper = domain.toUpperCase(Locale.ROOT);
        String fromStruct = nameByCode.get(upper);
        if (fromStruct != null && !fromStruct.isBlank() && !fromStruct.equalsIgnoreCase(upper)) {
            return fromStruct;
        }
        String canon = NhpAtomFormKeys.canonicalPigDomainCode(upper);
        if (canon != null) {
            fromStruct = nameByCode.get(canon);
            if (fromStruct != null && !fromStruct.isBlank() && !fromStruct.equalsIgnoreCase(canon)) {
                return fromStruct;
            }
            String fromDict = DOMAIN_LABELS.get(canon);
            if (fromDict != null) return fromDict;
        }
        String fromDict = DOMAIN_LABELS.get(upper);
        if (fromDict != null) return fromDict;
        return "数据域 " + domain;
    }

    private String resolveSubmoduleLabel(String sub, Map<String, String> nameByCode) {
        if (sub == null) return "";
        String upper = sub.toUpperCase(Locale.ROOT);
        String fromStruct = nameByCode.get(upper);
        if (fromStruct != null && !fromStruct.isBlank() && !fromStruct.equalsIgnoreCase(upper)) {
            return fromStruct;
        }
        // 无中文名时不要把 code 再写成 label（填写侧会只显示一次编码）
        return upper;
    }

    private Map<String, Object> toDictField(CrfField f) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("fieldKey", f.getFieldCode());
        m.put("label", f.getNameCn());
        m.put("type", defaultType(f.getDataType()));
        m.put("required", "YES".equals(f.getRequired()));
        if (f.getCodelistId() != null) {
            CrfCodelist cl = codelistMapper.findById(f.getCodelistId());
            if (cl != null) {
                m.put("dictKey", cl.getCode());
                // 带码表 = 枚举选择；dataType 可能误标 STRING，这里按码表强制题型（下拉/多选）
                m.put("type", "ENUM_MULTI".equals(f.getDataType()) ? "checkbox" : "select");
            }
        }
        if (f.getUnit() != null) m.put("config", Map.of("unit", f.getUnit()));
        if (f.getDescription() != null && !f.getDescription().isBlank()) m.put("description", f.getDescription());
        String role = resolveDictFieldRole(f);
        if (role != null) m.put("role", role);
        String idRule = f.getIdRuleType();
        if ("PK".equals(role) && idRule != null && !idRule.isBlank()) {
            m.put("roleMeta", Map.of("pkRule", idRule.trim().toUpperCase(Locale.ROOT)));
        }
        return m;
    }

    /** 字段字典 crf_field.nature / id_rule_type → 模板 role（PK 取号 / FK / DERIVED / VALUE 采码）。 */
    private static String resolveDictFieldRole(CrfField f) {
        String nature = f.getNature() == null ? "" : f.getNature().trim().toUpperCase(Locale.ROOT);
        return switch (nature) {
            case "PK" -> "PK";
            case "FK" -> "FK";
            case "DERIVED" -> "DERIVED";
            case "DATA" -> "VALUE";
            default -> {
                String idRule = f.getIdRuleType();
                if (idRule != null && !idRule.isBlank()) yield "PK";
                yield "VALUE";
            }
        };
    }

    private String defaultType(String dataType) {
        if (dataType == null) return "text";
        return switch (dataType) {
            case "TEXT" -> "textarea";
            case "INTEGER", "DECIMAL" -> "number";
            case "DATE", "DATETIME" -> "date";
            case "ENUM" -> "select";
            case "ENUM_MULTI" -> "checkbox";
            case "BOOLEAN" -> "checkbox";
            case "FILE" -> "file";
            default -> "text";
        };
    }

    /* ── 解析 / 分类 ── */

    private CrfForm resolveEditableOrLatest(String formKey) {
        if (formKey == null) return null;
        CrfForm draft = formMapper.findDraftByCode(formKey);
        if (draft != null) return draft;
        return formMapper.findByCode(formKey);
    }

    /** 原子取最新版（无需已发布）。 */
    private CrfForm resolveLatestAtom(String atomCode) {
        List<CrfForm> versions = formMapper.listByCode(atomCode);
        for (CrfForm v : versions) {
            if (isAtom(v)) return v;
        }
        return null;
    }


    /**
     * 组合是否应出现在某数据域套过滤下：
     * <ul>
     *   <li>当前版本任一钉住原子属于该套 → 显示</li>
     *   <li>当前版本无钉（空壳 HEAD）时，回看同 code 其它活跃版本的钉住 → 显示
     *       （避免 v3 空草稿把仍钉原子的 nhp-crf@v2 从「猪」过滤里藏掉）</li>
     *   <li>全程无钉：默认归猪套，保证种子/空壳在「全部套」与「猪」可见，不致只剩幻影钉住</li>
     * </ul>
     */
    private boolean compositeMatchesDictKey(CrfForm composite, String dictKey) {
        if (dictKey == null || dictKey.isBlank()) return true;
        if (refsMatchDictKey(composite.getId(), dictKey)) return true;
        boolean anyRefs = false;
        for (CrfForm v : formMapper.listByCode(composite.getCode())) {
            List<CrfCompositeAtom> refs = compositeAtomMapper.listByCompositeFormId(v.getId());
            if (refs != null && !refs.isEmpty()) {
                anyRefs = true;
                if (!v.getId().equals(composite.getId()) && refsMatchDictKey(v.getId(), dictKey)) {
                    return true;
                }
            }
        }
        if (!anyRefs) {
            return NhpAtomFormKeys.DEFAULT_DICT_KEY.equals(NhpAtomFormKeys.normalizeDictKey(dictKey));
        }
        return false;
    }

    private boolean refsMatchDictKey(Long compositeFormId, String dictKey) {
        if (compositeFormId == null) return false;
        List<CrfCompositeAtom> refs = compositeAtomMapper.listByCompositeFormId(compositeFormId);
        if (refs == null || refs.isEmpty()) return false;
        for (CrfCompositeAtom r : refs) {
            if (NhpAtomFormKeys.matchesDictKey(r.getAtomCode(), dictKey)) return true;
        }
        return false;
    }

    private String inferCompositeDictKey(List<Map<String, Object>> atoms) {
        String suite = null;
        for (Map<String, Object> a : atoms) {
            Object code = a.get("atomCode");
            NhpAtomFormKeys.Parsed p = NhpAtomFormKeys.parse(code == null ? null : String.valueOf(code));
            if (p == null) continue;
            if (suite == null) suite = p.dictKey();
            else if (!suite.equals(p.dictKey())) return "mixed";
        }
        return suite;
    }

    /** 仅活跃组合算钉住；顺带清理已软删组合残留的 orphan 引用（避免误报）。 */
    private boolean isAtomVersionPinned(Long atomFormId) {
        if (atomFormId == null) return false;
        purgeOrphanCompositePins(atomFormId);
        return !buildReferencedBy(atomFormId).isEmpty();
    }

    private void purgeOrphanCompositePins(Long atomFormId) {
        if (atomFormId == null) return;
        for (CrfCompositeAtom r : compositeAtomMapper.listByAtomFormId(atomFormId)) {
            CrfForm comp = formMapper.findById(r.getCompositeFormId());
            if (comp == null || !Boolean.TRUE.equals(comp.getActive())) {
                // 整表按组合删；orphan 单行则删该组合下全部残留（幂等）
                if (r.getCompositeFormId() != null) {
                    compositeAtomMapper.deleteByCompositeFormId(r.getCompositeFormId());
                }
            }
        }
    }

    private List<Map<String, Object>> buildReferencedBy(Long atomFormId) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (atomFormId == null) return out;
        for (CrfCompositeAtom r : compositeAtomMapper.listByAtomFormId(atomFormId)) {
            CrfForm comp = formMapper.findById(r.getCompositeFormId());
            if (comp == null || !Boolean.TRUE.equals(comp.getActive())) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("compositeFormId", comp.getId());
            m.put("formKey", comp.getCode());
            m.put("title", comp.getName());
            m.put("version", comp.getVersion());
            m.put("status", normalizeStatus(comp.getStatus()));
            m.put("origin", originOf(comp));
            String suite = inferCompositeDictKeyFromForm(comp);
            if (suite != null) m.put("dictKey", suite);
            out.add(m);
        }
        return out;
    }

    private String inferCompositeDictKeyFromForm(CrfForm composite) {
        List<Map<String, Object>> atoms = new ArrayList<>();
        for (CrfCompositeAtom r : compositeAtomMapper.listByCompositeFormId(composite.getId())) {
            Map<String, Object> a = new LinkedHashMap<>();
            a.put("atomCode", r.getAtomCode());
            atoms.add(a);
        }
        return inferCompositeDictKey(atoms);
    }

    private static String formatPinBlockMessage(List<Map<String, Object>> pins) {
        if (pins == null || pins.isEmpty()) return "";
        List<String> parts = new ArrayList<>();
        for (Map<String, Object> p : pins) {
            String key = String.valueOf(p.getOrDefault("formKey", "?"));
            Object ver = p.get("version");
            Object id = p.get("compositeFormId");
            String origin = String.valueOf(p.getOrDefault("origin", "USER"));
            String originHint = switch (origin) {
                case "SEED" -> "系统种子";
                case "AUTO_COMPOSE" -> "重组升版";
                default -> "用户组合";
            };
            parts.add(key + "@v" + (ver == null ? "?" : ver) + "（" + originHint + "，id=" + id + "）");
        }
        return "钉住方：" + String.join("、", parts) + "。";
    }

    private CrfForm newForm(String code, String name, String formType, int version, String status) {
        CrfStudy study = studyMapper.findByCode("NHP-XENO");
        CrfForm form = new CrfForm();
        form.setStudyId(study == null ? null : study.getId());
        form.setCode(code);
        form.setName(name == null ? code : name);
        form.setFormType(formType);
        form.setVersion(version);
        form.setStatus(status);
        form.setActive(true);
        return form;
    }

    /**
     * 写入草稿行：若同 code+version 已有软删行则复活并清空呈现层/钉住，否则 INSERT。
     * 与 {@link NhpVersionAllocator} 补位配套，避免 DuplicateKey。
     */
    private CrfForm insertOrReactivate(CrfForm draft) {
        if (draft == null || draft.getCode() == null || draft.getVersion() == null) {
            throw new IllegalArgumentException("draft code/version 不能为空");
        }
        CrfForm any = formMapper.findAnyByCodeAndVersion(draft.getCode(), draft.getVersion());
        if (any != null) {
            if (Boolean.TRUE.equals(any.getActive())) {
                throw new IllegalStateException("版号 v" + draft.getVersion()
                        + " 仍被活跃行占用（code=" + draft.getCode() + "），无法补位写入");
            }
            any.setName(draft.getName());
            any.setFormType(draft.getFormType());
            any.setStatus(draft.getStatus() != null ? draft.getStatus() : "DRAFT");
            any.setDescription(draft.getDescription());
            any.setActive(true);
            formMapper.reactivateAndUpdate(any);
            sectionMapper.deleteByFormId(any.getId());
            fieldTmplMapper.deleteByFormId(any.getId());
            compositeAtomMapper.deleteByCompositeFormId(any.getId());
            return formMapper.findById(any.getId());
        }
        formMapper.insert(draft);
        return draft;
    }

    /** 数据域原子码：裸 D1，或套作用域 monkey__D1。 */
    private static boolean looksLikeAtomCode(String code) {
        return NhpAtomFormKeys.looksLikeAtomCode(code);
    }

    /** 版本来源：SEED=系统种子；AUTO_COMPOSE=重组已发布组合时自动升版；USER=用户手建/新建版本 */
    private static String originOf(CrfForm f) {
        if (f == null) return "USER";
        String d = f.getDescription();
        if (d != null && d.contains(ORIGIN_SEED)) return "SEED";
        if (d != null && d.contains(ORIGIN_AUTO_COMPOSE)) return "AUTO_COMPOSE";
        return "USER";
    }

    /** 兼容旧调用；同 {@link #looksLikeAtomCode} */
    @Deprecated
    private static boolean isAtomCode(String code) {
        return looksLikeAtomCode(code);
    }

    private static String atomTypeFor(String code) {
        if (code == null) return "DOMAIN";
        String domain = NhpAtomFormKeys.extractDomainCode(code);
        String u = domain != null ? domain : code.toUpperCase(Locale.ROOT);
        return "D9".equals(u) || "D10".equals(u) ? "MODULE" : "DOMAIN";
    }

    private static boolean isAtomFormType(String formType) {
        return "DOMAIN".equals(formType) || "MODULE".equals(formType)
                || "ATOM".equals(formType) || "PUBLIC".equals(formType);
    }

    private static boolean isAtom(CrfForm f) {
        if (f == null) return false;
        if (TYPE_TEMPLATE.equals(f.getFormType()) || "COMPOSITE".equals(f.getFormType())) return false;
        if (NhpAtomFormKeys.looksLikeCompositeTemplateCode(f.getCode())) return false;
        if (isAtomFormType(f.getFormType())) return true;
        return looksLikeAtomCode(f.getCode());
    }

    /**
     * 组合：form_type=TEMPLATE，或 code 不是原子（纠正 nhp-crf 等存量误标）。
     */
    private static boolean isComposite(CrfForm f) {
        if (f == null) return false;
        if (TYPE_TEMPLATE.equals(f.getFormType()) || "COMPOSITE".equals(f.getFormType())) return true;
        if (isAtom(f)) return false;
        return !looksLikeAtomCode(f.getCode());
    }

    /** 列表/详情：域码原子与语义码原子（donor_profile）的套与展示码。 */
    private static void attachAtomSuiteMeta(Map<String, Object> m, String formKey) {
        NhpAtomFormKeys.Parsed p = NhpAtomFormKeys.parse(formKey);
        if (p != null) {
            m.put("dictKey", p.dictKey());
            m.put("domainCode", p.domainCode());
            return;
        }
        if (formKey != null && !formKey.isBlank() && !NhpAtomFormKeys.looksLikeCompositeTemplateCode(formKey)) {
            m.put("dictKey", NhpAtomFormKeys.DEFAULT_DICT_KEY);
            m.put("domainCode", formKey);
        }
    }

    private static String normalizeStatus(String status) {
        if (status == null) return "DRAFT";
        String s = status.toUpperCase();
        if ("FROZEN".equals(s)) return "PUBLISHED";
        return s;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> listOf(Object o) {
        if (!(o instanceof List<?> list)) return List.of();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> m) out.add((Map<String, Object>) m);
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> deepCopyMap(Map<String, Object> src) {
        try {
            return objectMapper.readValue(objectMapper.writeValueAsString(src), Map.class);
        } catch (Exception e) {
            return new LinkedHashMap<>(src);
        }
    }

    private String toJson(Object o) {
        if (o == null) return null;
        try {
            return objectMapper.writeValueAsString(o);
        } catch (Exception e) {
            return null;
        }
    }

    private Object fromJson(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return objectMapper.readValue(s, Object.class);
        } catch (Exception e) {
            return null;
        }
    }

    private String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private Long asLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(String.valueOf(v).trim());
        } catch (Exception e) {
            return null;
        }
    }
}
