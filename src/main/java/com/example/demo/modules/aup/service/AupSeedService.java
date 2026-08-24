package com.example.demo.modules.aup.service;

import com.example.demo.modules.aup.entity.AupCompositeAtom;
import com.example.demo.modules.aup.entity.AupFieldDef;
import com.example.demo.modules.aup.entity.AupFolder;
import com.example.demo.modules.aup.entity.Dict;
import com.example.demo.modules.aup.entity.DictItem;
import com.example.demo.modules.aup.entity.FormField;
import com.example.demo.modules.aup.entity.FormSection;
import com.example.demo.modules.aup.entity.FormSubsection;
import com.example.demo.modules.aup.entity.FormTemplate;
import com.example.demo.modules.aup.mapper.AupCompositeAtomMapper;
import com.example.demo.modules.aup.mapper.AupFieldDefMapper;
import com.example.demo.modules.aup.mapper.AupFolderMapper;
import com.example.demo.modules.aup.mapper.DictItemMapper;
import com.example.demo.modules.aup.mapper.DictMapper;
import com.example.demo.modules.aup.mapper.FormFieldMapper;
import com.example.demo.modules.aup.mapper.FormSectionMapper;
import com.example.demo.modules.aup.mapper.FormSubsectionMapper;
import com.example.demo.modules.aup.mapper.FormTemplateMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * AUP 种子数据（幂等）：码表（dict/dict_item）+ 字段字典（aup_field_def）+ 原子域（form_template kind=ATOM）
 * + 组合域（form_template kind=COMPOSITE，钉住全部原子并发布）。
 * 数据源为 classpath:db/aup-seed.json。所有方法重复执行无副作用（先查后插 / 唯一键防重）。
 */
@Service
public class AupSeedService {

    private static final Logger log = LoggerFactory.getLogger(AupSeedService.class);
    private static final String SEED_RESOURCE = "db/aup-seed.json";
    private static final String COMPOSITE_FORM_KEY = "aup";
    private static final String COMPOSITE_NAME = "IACUC 实验动物研究及使用计划（AUP）";
    private static final String ATOM_PREFIX = "atom:";

    private final DictMapper dictMapper;
    private final DictItemMapper dictItemMapper;
    private final AupFieldDefMapper fieldDefMapper;
    private final AupFolderMapper folderMapper;
    private final FormTemplateMapper templateMapper;
    private final FormSectionMapper sectionMapper;
    private final FormSubsectionMapper subsectionMapper;
    private final FormFieldMapper fieldMapper;
    private final AupCompositeAtomMapper compositeAtomMapper;
    private final AupConfigAuditService auditService;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    /** 文件夹缓存：ownerType → 已加载/新插入的文件夹，避免逐条回查。 */
    private final Map<String, List<AupFolder>> folderCache = new HashMap<>();

    public AupSeedService(DictMapper dictMapper, DictItemMapper dictItemMapper,
                          AupFieldDefMapper fieldDefMapper, AupFolderMapper folderMapper,
                          FormTemplateMapper templateMapper, FormSectionMapper sectionMapper,
                          FormSubsectionMapper subsectionMapper, FormFieldMapper fieldMapper,
                          AupCompositeAtomMapper compositeAtomMapper,
                          AupConfigAuditService auditService,
                          JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.dictMapper = dictMapper;
        this.dictItemMapper = dictItemMapper;
        this.fieldDefMapper = fieldDefMapper;
        this.folderMapper = folderMapper;
        this.templateMapper = templateMapper;
        this.sectionMapper = sectionMapper;
        this.subsectionMapper = subsectionMapper;
        this.fieldMapper = fieldMapper;
        this.compositeAtomMapper = compositeAtomMapper;
        this.auditService = auditService;
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    /** 全量种子（码表 + 字段 + 原子域 + 组合域）。 */
    @Transactional
    public Map<String, Integer> seedAll() {
        Map<String, Integer> stat = new LinkedHashMap<>();
        stat.put("codelists", seedCodelists());
        stat.put("fields", seedFields());
        stat.put("atoms", seedAtoms());
        stat.put("composite", seedComposite());
        log.info("[aup-seed] 完成: {}", stat);
        return stat;
    }

    /* ── 码表 ── */

    @Transactional
    public int seedCodelists() {
        List<Map<String, Object>> codelists = list(seedRoot().get("codelists"));
        int created = 0;
        for (Map<String, Object> cl : codelists) {
            String dictKey = str(cl.get("dictKey"));
            if (dictKey == null) {
                continue;
            }
            if (dictMapper.findByKey(dictKey) != null) {
                continue;
            }
            String name = str(cl.get("name"));
            String source = str(cl.get("source"));
            String sourceRef = str(cl.get("sourceRef"));
            Long folderId = ensureFolder("CODELIST", 0L, str(cl.get("folder")));

            Dict dict = new Dict();
            dict.setDictKey(dictKey);
            dict.setName(name);
            dict.setVersion(1);
            dict.setStatus("PUBLISHED");
            dict.setPublishedAt(LocalDateTime.now());
            dict.setFolderId(folderId);
            dict.setSource(source);
            dict.setSourceRef(sourceRef);
            dictMapper.insert(dict);

            // LOCAL 码表落条目；EXTERNAL 仅落表头，值域不在 AUP 管理
            if (!"EXTERNAL".equalsIgnoreCase(source)) {
                int order = 0;
                for (Map<String, Object> item : list(cl.get("items"))) {
                    String value = str(item.get("value"));
                    if (value == null) {
                        continue;
                    }
                    if (dictItemMapper.countByDictIdAndValue(dict.getId(), value) > 0) {
                        continue;
                    }
                    DictItem di = new DictItem();
                    di.setDictId(dict.getId());
                    di.setValue(value);
                    di.setLabel(str(item.get("label")));
                    di.setSortOrder(order);
                    dictItemMapper.insert(di);
                    order++;
                }
            }

            auditService.log("codelist", dict.getId(), dictKey, name, "CREATE", null, dict, null, "seed");
            created++;
        }
        return created;
    }

    /* ── 字段字典（仅顶层字段，不展开 config.fields / config.columns 嵌套） ── */

    @Transactional
    public int seedFields() {
        List<Map<String, Object>> sections = list(seedRoot().get("sections"));
        int created = 0;
        for (Map<String, Object> section : sections) {
            Long sectionFolderId = ensureFolder("FIELD", 0L, nameOrCode(section));
            // 直接挂在 section 下的字段
            created += seedFieldDefs(list(section.get("fields")), sectionFolderId);
            // subsection 下的字段
            for (Map<String, Object> sub : list(section.get("subsections"))) {
                Long subFolderId = ensureFolder("FIELD", sectionFolderId, nameOrCode(sub));
                created += seedFieldDefs(list(sub.get("fields")), subFolderId);
            }
        }
        return created;
    }

    private int seedFieldDefs(List<Map<String, Object>> fields, Long folderId) {
        int created = 0;
        int fallbackOrder = 0;
        for (Map<String, Object> f : fields) {
            String fieldCode = str(f.get("fieldKey"));
            if (fieldCode == null) {
                continue;
            }
            if (fieldDefMapper.findByFieldCode(fieldCode) != null) {
                continue;
            }
            AupFieldDef def = new AupFieldDef();
            def.setFieldCode(fieldCode);
            def.setLabel(str(f.get("label")));
            def.setType(str(f.get("type")));
            def.setDictKey(str(f.get("dictKey")));
            def.setOptions(null);
            def.setRequired(Boolean.TRUE.equals(f.get("required")));
            def.setDescription(str(f.get("description")));
            def.setConfig(toJson(f.get("config")));
            def.setShowWhen(toJson(f.get("showWhen")));
            def.setFolderId(folderId);
            def.setStatus("PUBLISHED");
            def.setFrozenAt(LocalDateTime.now());
            def.setSortOrder(intOf(f.get("sortOrder"), fallbackOrder));
            fieldDefMapper.insert(def);
            auditService.log("field", def.getId(), fieldCode, def.getLabel(), "CREATE", null, def, null, "seed");
            created++;
            fallbackOrder++;
        }
        return created;
    }

    /* ── 原子域：每个顶层 section 一个 atom:* ── */

    @Transactional
    public int seedAtoms() {
        List<Map<String, Object>> sections = list(seedRoot().get("sections"));
        int created = 0;
        for (Map<String, Object> section : sections) {
            String code = str(section.get("code"));
            if (code == null) {
                continue;
            }
            String formKey = ATOM_PREFIX + code;
            if (templateMapper.findByKindAndFormKey("ATOM", formKey) != null) {
                continue;
            }
            String name = str(section.get("label"));
            FormTemplate atom = new FormTemplate();
            atom.setFormKey(formKey);
            atom.setKind("ATOM");
            atom.setOrigin("SEED");
            atom.setName(name);
            atom.setVersion(1);
            atom.setStatus("DRAFT");
            templateMapper.insert(atom);

            insertSectionTree(atom.getId(), section, intOf(section.get("sortOrder"), 0));
            auditService.log("template", atom.getId(), formKey, name, "CREATE", null, atom, null, "seed");
            created++;
        }
        return created;
    }

    /* ── 组合域：钉住全部原子并发布 ── */

    @Transactional
    public int seedComposite() {
        List<Map<String, Object>> sections = list(seedRoot().get("sections"));
        FormTemplate existing = templateMapper.findByKindAndFormKey("COMPOSITE", COMPOSITE_FORM_KEY);
        if (existing != null) {
            boolean hasStructure = !sectionMapper.listByTemplateId(existing.getId()).isEmpty();
            if (hasStructure) {
                return ensurePublished(existing);
            }
            // 组合域壳已存在但无结构：仅当有原子可组装时才重建
            if (sections.isEmpty()) {
                return ensurePublished(existing);
            }
        } else if (sections.isEmpty()) {
            return 0;
        }

        // 归档旧 PROTOCOL 计划书模板（组合域取代之）
        jdbcTemplate.update("UPDATE form_template SET status='ARCHIVED' "
                + "WHERE form_key='" + COMPOSITE_FORM_KEY + "' AND kind='PROTOCOL' AND status IN ('PUBLISHED','DRAFT')");

        int version = templateMapper.findMaxVersionByFormKey(COMPOSITE_FORM_KEY) + 1;
        FormTemplate composite = new FormTemplate();
        composite.setFormKey(COMPOSITE_FORM_KEY);
        composite.setKind("COMPOSITE");
        composite.setOrigin("SEED");
        composite.setName(COMPOSITE_NAME);
        composite.setVersion(version);
        composite.setStatus("PUBLISHED");
        composite.setPublishedAt(LocalDateTime.now());
        templateMapper.insert(composite);

        // 深拷贝全部原子的 sections（sortOrder 按原子顺序累计递增，避免重号）
        int atomOrder = 0;
        for (Map<String, Object> section : sections) {
            String code = str(section.get("code"));
            FormTemplate atom = code == null ? null : templateMapper.findByKindAndFormKey("ATOM", ATOM_PREFIX + code);
            if (atom == null) {
                continue;
            }
            insertSectionTree(composite.getId(), section, atomOrder);

            AupCompositeAtom pin = new AupCompositeAtom();
            pin.setCompositeTemplateId(composite.getId());
            pin.setAtomFormKey(atom.getFormKey());
            pin.setAtomTemplateId(atom.getId());
            pin.setSortOrder(atomOrder);
            compositeAtomMapper.insert(pin);
            atomOrder++;
        }

        auditService.log("template", composite.getId(), composite.getFormKey(), composite.getName(),
                "CREATE", null, composite, null, "seed");
        return 1;
    }

    /** 已存在组合域只纠正发布态：非 PUBLISHED 置 PUBLISHED。 */
    private int ensurePublished(FormTemplate tpl) {
        String st = tpl.getStatus() == null ? "" : tpl.getStatus().toUpperCase();
        if (!"PUBLISHED".equals(st)) {
            templateMapper.publish(tpl.getId(), LocalDateTime.now());
            return 1;
        }
        return 0;
    }

    /* ── section / subsection / field 插入（原子域与组合域共用） ── */

    private void insertSectionTree(long templateId, Map<String, Object> section, int sectionOrder) {
        FormSection sec = new FormSection();
        sec.setTemplateId(templateId);
        sec.setCode(str(section.get("code")));
        sec.setLabel(str(section.get("label")));
        sec.setSortOrder(sectionOrder);
        sec.setSubdivisible(Boolean.TRUE.equals(section.get("subdivisible")));
        sec.setShowWhen(toJson(section.get("showWhen")));
        sec.setHighlight(section.get("highlight") == null ? null : Boolean.TRUE.equals(section.get("highlight")));
        sectionMapper.insert(sec);

        List<Map<String, Object>> subsections = list(section.get("subsections"));
        if (!subsections.isEmpty()) {
            int subOrder = 0;
            for (Map<String, Object> sub : subsections) {
                FormSubsection subRow = new FormSubsection();
                subRow.setSectionId(sec.getId());
                subRow.setCode(str(sub.get("code")));
                subRow.setLabel(str(sub.get("label")));
                subRow.setSortOrder(subOrder++);
                subRow.setDescription(str(sub.get("description")));
                subRow.setDescriptionTone(str(sub.get("descriptionTone")));
                subsectionMapper.insert(subRow);
                insertFormFields(templateId, null, subRow.getId(), list(sub.get("fields")));
            }
        } else {
            insertFormFields(templateId, sec.getId(), null, list(section.get("fields")));
        }
    }

    private void insertFormFields(long templateId, Long sectionId, Long subsectionId, List<Map<String, Object>> fields) {
        int fallbackOrder = 0;
        for (Map<String, Object> f : fields) {
            FormField ff = new FormField();
            ff.setSectionId(subsectionId == null ? sectionId : null);
            ff.setSubsectionId(subsectionId);
            ff.setFieldKey(str(f.get("fieldKey")));
            ff.setLabel(str(f.get("label")));
            ff.setDescription(str(f.get("description")));
            ff.setType(str(f.get("type")));
            ff.setOptions(null);
            ff.setDictKey(str(f.get("dictKey")));
            ff.setRequired(Boolean.TRUE.equals(f.get("required")));
            ff.setShowWhen(toJson(f.get("showWhen")));
            ff.setSortOrder(intOf(f.get("sortOrder"), fallbackOrder));
            ff.setConfig(toJson(f.get("config")));
            fieldMapper.insert(ff);
            fallbackOrder++;
        }
    }

    /* ── 文件夹（先按 name 找，找不到建） ── */

    private Long ensureFolder(String ownerType, Long parentId, String name) {
        if (name == null || name.isBlank()) {
            return null;
        }
        long pid = parentId == null ? 0L : parentId;
        List<AupFolder> folders = folderCache.computeIfAbsent(ownerType, folderMapper::listByOwnerType);
        for (AupFolder f : folders) {
            long fp = f.getParentId() == null ? 0L : f.getParentId();
            if (fp == pid && name.equals(f.getName())) {
                return f.getId();
            }
        }
        AupFolder folder = new AupFolder();
        folder.setOwnerType(ownerType);
        folder.setParentId(pid);
        folder.setName(name);
        folder.setSortOrder(0);
        folderMapper.insert(folder);
        folders.add(folder);
        return folder.getId();
    }

    private String nameOrCode(Map<String, Object> node) {
        String label = str(node.get("label"));
        return label != null ? label : str(node.get("code"));
    }

    /* ── JSON 加载与取值工具 ── */

    private Map<String, Object> seedRoot() {
        try {
            ClassPathResource res = new ClassPathResource(SEED_RESOURCE);
            if (!res.exists()) {
                log.warn("[aup-seed] 种子资源缺失: {}", SEED_RESOURCE);
                return Map.of();
            }
            String json = new String(res.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            log.warn("[aup-seed] 读取种子资源失败: {}", e.getMessage());
            return Map.of();
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> list(Object o) {
        if (!(o instanceof List<?> l)) {
            return List.of();
        }
        return (List<Map<String, Object>>) l;
    }

    private String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private int intOf(Object v, int def) {
        if (v instanceof Number n) {
            return n.intValue();
        }
        if (v != null) {
            try {
                return Integer.parseInt(String.valueOf(v).trim());
            } catch (NumberFormatException ignored) {
                // fallthrough
            }
        }
        return def;
    }

    private String toJson(Object o) {
        if (o == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(o);
        } catch (Exception e) {
            return null;
        }
    }
}
