package com.example.demo.modules.aup.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.aup.dto.AupFieldCreateRequest;
import com.example.demo.modules.aup.dto.AupFieldMoveRequest;
import com.example.demo.modules.aup.dto.AupFieldUpdateRequest;
import com.example.demo.modules.aup.dto.AupFieldVO;
import com.example.demo.modules.aup.dto.AupFieldTemplateRef;
import com.example.demo.modules.aup.dto.ExtractFromTemplateRequest;
import com.example.demo.modules.aup.dto.ExtractFromTemplateResponse;
import com.example.demo.modules.aup.entity.AupFieldDef;
import com.example.demo.modules.aup.entity.AupFolder;
import com.example.demo.modules.aup.entity.FormField;
import com.example.demo.modules.aup.entity.FormSection;
import com.example.demo.modules.aup.entity.FormSubsection;
import com.example.demo.modules.aup.entity.FormTemplate;
import com.example.demo.modules.aup.mapper.AupFieldDefMapper;
import com.example.demo.modules.aup.mapper.AupFolderMapper;
import com.example.demo.modules.aup.mapper.FormFieldMapper;
import com.example.demo.modules.aup.mapper.FormSectionMapper;
import com.example.demo.modules.aup.mapper.FormSubsectionMapper;
import com.example.demo.modules.aup.mapper.FormTemplateMapper;
import com.example.demo.modules.auth.entity.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** AUP 字段字典层：字段 CRUD + 状态机 + 从已发布模板反向抽取字段。 */
@Service
public class AupFieldService {

    /** 值域类题型：本质就是值域，必须选码表（checkbox/cascade 豁免）。 */
    private static final Set<String> VALUE_DOMAIN_TYPES = Set.of("choice", "select");

    private final AupFieldDefMapper fieldDefMapper;
    private final AupFolderMapper folderMapper;
    private final FormTemplateMapper templateMapper;
    private final FormSectionMapper sectionMapper;
    private final FormSubsectionMapper subsectionMapper;
    private final FormFieldMapper fieldMapper;
    private final AupConfigAuditService auditService;
    private final ObjectMapper objectMapper;

    public AupFieldService(AupFieldDefMapper fieldDefMapper, AupFolderMapper folderMapper,
                           FormTemplateMapper templateMapper, FormSectionMapper sectionMapper,
                           FormSubsectionMapper subsectionMapper, FormFieldMapper fieldMapper,
                           AupConfigAuditService auditService, ObjectMapper objectMapper) {
        this.fieldDefMapper = fieldDefMapper;
        this.folderMapper = folderMapper;
        this.templateMapper = templateMapper;
        this.sectionMapper = sectionMapper;
        this.subsectionMapper = subsectionMapper;
        this.fieldMapper = fieldMapper;
        this.auditService = auditService;
        this.objectMapper = objectMapper;
    }

    public List<AupFieldVO> list(Long folderId, String status, String keyword, int page, int size) {
        int offset = (page - 1) * size;
        return fieldDefMapper.listByFilter(folderId, status, keyword, size, offset).stream()
                .map(this::toVO).collect(Collectors.toList());
    }

    public int count(Long folderId, String status, String keyword) {
        return fieldDefMapper.countByFilter(folderId, status, keyword);
    }

    @Transactional
    public Result<AupFieldVO> create(AupFieldCreateRequest req, User operator) {
        if (isBlank(req.getFieldCode())) {
            return Result.fail(400, "fieldCode 不能为空");
        }
        String code = req.getFieldCode().trim();
        if (fieldDefMapper.findByFieldCode(code) != null) {
            return Result.fail(400, "字段编码已存在");
        }
        if (isBlank(req.getLabel())) {
            return Result.fail(400, "label 不能为空");
        }
        if (isBlank(req.getType())) {
            return Result.fail(400, "type 不能为空");
        }
        String type = req.getType().trim();
        if (VALUE_DOMAIN_TYPES.contains(type) && isBlank(req.getDictKey())) {
            return Result.fail(400, "该题型必须选择码表");
        }
        AupFieldDef f = new AupFieldDef();
        f.setFieldCode(code);
        f.setLabel(req.getLabel().trim());
        f.setType(type);
        f.setDictKey(req.getDictKey());
        f.setOptions(VALUE_DOMAIN_TYPES.contains(type) ? null : toJson(req.getOptions()));
        f.setRequired(Boolean.TRUE.equals(req.getRequired()));
        f.setDescription(req.getDescription());
        f.setConfig(toJson(req.getConfig()));
        f.setShowWhen(toJson(req.getShowWhen()));
        f.setFolderId(req.getFolderId());
        f.setStatus("DRAFT");
        f.setSortOrder(req.getSortOrder() != null ? req.getSortOrder() : 0);
        fieldDefMapper.insert(f);
        auditService.log("field", f.getId(), f.getFieldCode(), f.getLabel(), "CREATE", null, f, operator, null);
        return Result.success(toVO(f));
    }

    @Transactional
    public Result<AupFieldVO> update(Long id, AupFieldUpdateRequest req, User operator) {
        AupFieldDef f = fieldDefMapper.findById(id);
        if (f == null) {
            return Result.error("字段不存在");
        }
        if (!"DRAFT".equals(f.getStatus())) {
            return Result.fail(400, "仅草稿状态可修改");
        }
        AupFieldDef before = copy(f);
        if (req.getLabel() != null && !req.getLabel().isBlank()) {
            f.setLabel(req.getLabel().trim());
        }
        if (req.getType() != null && !req.getType().isBlank()) {
            f.setType(req.getType().trim());
        }
        if (req.getDictKey() != null) {
            f.setDictKey(req.getDictKey());
        }
        if (req.getOptions() != null) {
            f.setOptions(toJson(req.getOptions()));
        }
        if (req.getRequired() != null) {
            f.setRequired(req.getRequired());
        }
        if (req.getDescription() != null) {
            f.setDescription(req.getDescription());
        }
        if (req.getConfig() != null) {
            f.setConfig(toJson(req.getConfig()));
        }
        if (req.getShowWhen() != null) {
            f.setShowWhen(toJson(req.getShowWhen()));
        }
        if (req.getSortOrder() != null) {
            f.setSortOrder(req.getSortOrder());
        }
        if (f.getType() != null && VALUE_DOMAIN_TYPES.contains(f.getType()) && isBlank(f.getDictKey())) {
            return Result.fail(400, "该题型必须选择码表");
        }
        fieldDefMapper.update(f);
        auditService.log("field", f.getId(), f.getFieldCode(), f.getLabel(), "UPDATE", before, f, operator, null);
        return Result.success(toVO(fieldDefMapper.findById(id)));
    }

    @Transactional
    public Result<Void> move(Long id, AupFieldMoveRequest req, User operator) {
        AupFieldDef f = fieldDefMapper.findById(id);
        if (f == null) {
            return Result.error("字段不存在");
        }
        Long folderId = req.getFolderId();
        int sortOrder = req.getSortOrder() != null ? req.getSortOrder() : 0;
        Long beforeFolder = f.getFolderId();
        fieldDefMapper.updateFolder(id, folderId, sortOrder);
        auditService.log("field", f.getId(), f.getFieldCode(), f.getLabel(), "MOVE",
                Map.of("folderId", beforeFolder), Map.of("folderId", folderId), operator, null);
        return Result.success(null);
    }

    @Transactional
    public Result<Void> delete(Long id, User operator) {
        AupFieldDef f = fieldDefMapper.findById(id);
        if (f == null) {
            return Result.error("字段不存在");
        }
        int refs = fieldMapper.countRefByFieldCode(f.getFieldCode());
        if (refs > 0) {
            return Result.fail(400, "该字段被 " + refs + " 个原子域引用，无法删除");
        }
        fieldDefMapper.deleteById(id);
        auditService.log("field", id, f.getFieldCode(), f.getLabel(), "DELETE", f, null, operator, null);
        return Result.success(null);
    }

    public Map<String, Object> usage(Long id) {
        AupFieldDef f = fieldDefMapper.findById(id);
        Map<String, Object> out = new HashMap<>();
        if (f == null) {
            return out;
        }
        List<AupFieldTemplateRef> refs = fieldMapper.listAtomRefsByFieldCode(f.getFieldCode());
        out.put("fieldCode", f.getFieldCode());
        out.put("label", f.getLabel());
        out.put("status", f.getStatus());
        out.put("refCount", refs.size());
        out.put("refs", refs);
        return out;
    }

    @Transactional
    public Result<?> submitReview(Long id, User operator) {
        AupFieldDef f = fieldDefMapper.findById(id);
        if (f == null) {
            return Result.error("字段不存在");
        }
        if (!"DRAFT".equals(f.getStatus())) {
            return Result.fail(400, "仅草稿状态可提交审核");
        }
        fieldDefMapper.updateStatus(id, "PENDING_REVIEW");
        auditService.log("field", id, f.getFieldCode(), f.getLabel(), "SUBMIT_REVIEW",
                Map.of("status", "DRAFT"), Map.of("status", "PENDING_REVIEW"), operator, null);
        return Result.success(null);
    }

    @Transactional
    public Result<?> approve(Long id, User operator) {
        AupFieldDef f = fieldDefMapper.findById(id);
        if (f == null) {
            return Result.error("字段不存在");
        }
        if (!"PENDING_REVIEW".equals(f.getStatus())) {
            return Result.fail(400, "仅待审核状态可发布");
        }
        String opName = operatorName(operator);
        fieldDefMapper.markPublished(id, LocalDateTime.now(), opName);
        auditService.log("field", id, f.getFieldCode(), f.getLabel(), "APPROVE",
                Map.of("status", "PENDING_REVIEW"), Map.of("status", "PUBLISHED"), operator, null);
        return Result.success(null);
    }

    @Transactional
    public Result<?> reject(Long id, String comment, User operator) {
        AupFieldDef f = fieldDefMapper.findById(id);
        if (f == null) {
            return Result.error("字段不存在");
        }
        if (!"PENDING_REVIEW".equals(f.getStatus())) {
            return Result.fail(400, "仅待审核状态可驳回");
        }
        if (comment == null || comment.isBlank()) {
            return Result.fail(400, "驳回意见必填");
        }
        fieldDefMapper.updateStatus(id, "DRAFT");
        auditService.log("field", id, f.getFieldCode(), f.getLabel(), "REJECT",
                Map.of("status", "PENDING_REVIEW"), Map.of("status", "DRAFT"), operator, comment);
        return Result.success(null);
    }

    @Transactional
    public Result<?> unfreeze(Long id, User operator) {
        AupFieldDef f = fieldDefMapper.findById(id);
        if (f == null) {
            return Result.error("字段不存在");
        }
        if (!"PUBLISHED".equals(f.getStatus())) {
            return Result.fail(400, "仅已发布状态可解冻");
        }
        int refs = fieldMapper.countRefByFieldCode(f.getFieldCode());
        if (refs > 0) {
            return Result.fail(400, "该字段被 " + refs + " 个原子域引用，无法解冻");
        }
        fieldDefMapper.updateStatus(id, "DRAFT");
        auditService.log("field", id, f.getFieldCode(), f.getLabel(), "UNFREEZE",
                Map.of("status", "PUBLISHED"), Map.of("status", "DRAFT"), operator, null);
        return Result.success(null);
    }

    @Transactional
    public Result<ExtractFromTemplateResponse> extractFromTemplate(ExtractFromTemplateRequest req, User operator) {
        FormTemplate t = resolveProtocolPublished(req);
        if (t == null) {
            return Result.error("未找到已发布的 PROTOCOL 模板");
        }

        List<FormSection> sections = sectionMapper.listByTemplateId(t.getId());
        List<Long> sectionIds = sections.stream().map(FormSection::getId).collect(Collectors.toList());
        List<Long> subsectionIds = subsectionIds(sectionIds);
        List<FormSubsection> subsections = subsectionIds.isEmpty()
                ? new ArrayList<>() : subsectionMapper.listBySectionIds(sectionIds);
        Map<Long, List<FormSubsection>> subsBySection = subsections.stream()
                .collect(Collectors.groupingBy(FormSubsection::getSectionId));
        List<FormField> directFields = sectionIds.isEmpty() ? new ArrayList<>() : fieldMapper.listBySectionIds(sectionIds);
        List<FormField> subFields = subsectionIds.isEmpty() ? new ArrayList<>() : fieldMapper.listBySubsectionIds(subsectionIds);
        Map<Long, List<FormField>> fieldsBySection = directFields.stream()
                .collect(Collectors.groupingBy(FormField::getSectionId));
        Map<Long, List<FormField>> fieldsBySub = subFields.stream()
                .collect(Collectors.groupingBy(FormField::getSubsectionId));

        // 现有 FIELD 文件夹按 (parentId|name) 建索引，创建时增量加入
        Map<String, Long> folderIndex = new HashMap<>();
        for (AupFolder f : folderMapper.listByOwnerType("FIELD")) {
            folderIndex.put(folderKey(f.getParentId(), f.getName()), f.getId());
        }

        int created = 0;
        int skipped = 0;
        LocalDateTime now = LocalDateTime.now();
        for (FormSection s : sections) {
            Long sectionFolderId = findOrCreateFolder(0L, sectionName(s), folderIndex, operator);
            List<FormField> direct = fieldsBySection.get(s.getId());
            if (direct != null) {
                for (FormField f : direct) {
                    if (insertFieldDef(f, sectionFolderId, now, operator)) created++; else skipped++;
                }
            }
            List<FormSubsection> subList = subsBySection.get(s.getId());
            if (subList != null) {
                for (FormSubsection sub : subList) {
                    Long subFolderId = findOrCreateFolder(sectionFolderId, subName(sub), folderIndex, operator);
                    List<FormField> sf = fieldsBySub.get(sub.getId());
                    if (sf != null) {
                        for (FormField f : sf) {
                            if (insertFieldDef(f, subFolderId, now, operator)) created++; else skipped++;
                        }
                    }
                }
            }
        }
        ExtractFromTemplateResponse resp = new ExtractFromTemplateResponse();
        resp.setCreated(created);
        resp.setSkipped(skipped);
        return Result.success(resp);
    }

    private boolean insertFieldDef(FormField f, Long folderId, LocalDateTime now, User operator) {
        if (isBlank(f.getFieldKey())) {
            return false;
        }
        String code = f.getFieldKey().trim();
        if (fieldDefMapper.findByFieldCode(code) != null) {
            return false; // 已存在 → skipped
        }
        AupFieldDef def = new AupFieldDef();
        def.setFieldCode(code);
        def.setLabel(f.getLabel());
        def.setType(f.getType());
        def.setDictKey(f.getDictKey());
        def.setOptions(f.getOptions());
        def.setRequired(Boolean.TRUE.equals(f.getRequired()));
        def.setDescription(f.getDescription());
        def.setConfig(f.getConfig());
        def.setShowWhen(f.getShowWhen());
        def.setFolderId(folderId);
        def.setStatus("PUBLISHED"); // 来自已发布模板，天然可信
        def.setFrozenAt(now);
        def.setSortOrder(f.getSortOrder() != null ? f.getSortOrder() : 0);
        fieldDefMapper.insert(def);
        auditService.log("field", def.getId(), def.getFieldCode(), def.getLabel(), "CREATE", null, def, operator, "extract-from-template");
        return true;
    }

    private Long findOrCreateFolder(Long parentId, String name, Map<String, Long> folderIndex, User operator) {
        String key = folderKey(parentId, name);
        Long existing = folderIndex.get(key);
        if (existing != null) {
            return existing;
        }
        AupFolder folder = new AupFolder();
        folder.setOwnerType("FIELD");
        folder.setParentId(parentId);
        folder.setName(name);
        folder.setSortOrder(0);
        folderMapper.insert(folder);
        folderIndex.put(key, folder.getId());
        auditService.log("folder", folder.getId(), null, name, "CREATE", null, folder, operator, "extract-from-template");
        return folder.getId();
    }

    private String folderKey(Long parentId, String name) {
        return (parentId == null ? 0L : parentId) + "|" + name;
    }

    private List<Long> subsectionIds(List<Long> sectionIds) {
        if (sectionIds == null || sectionIds.isEmpty()) {
            return new ArrayList<>();
        }
        return subsectionMapper.listBySectionIds(sectionIds).stream()
                .map(FormSubsection::getId).collect(Collectors.toList());
    }

    private FormTemplate resolveProtocolPublished(ExtractFromTemplateRequest req) {
        FormTemplate t = null;
        if (req.getTemplateId() != null) {
            t = templateMapper.findById(req.getTemplateId());
        } else if (StringUtils.hasText(req.getFormKey())) {
            t = templateMapper.findPublishedByFormKey(req.getFormKey().trim());
        }
        if (t == null) {
            return null;
        }
        if (!"PROTOCOL".equals(t.getKind()) || !"PUBLISHED".equals(t.getStatus())) {
            return null;
        }
        return t;
    }

    private String sectionName(FormSection s) {
        return isBlank(s.getCode()) ? (isBlank(s.getLabel()) ? "未命名" : s.getLabel()) : s.getCode();
    }

    private String subName(FormSubsection sub) {
        return isBlank(sub.getCode()) ? (isBlank(sub.getLabel()) ? "未命名" : sub.getLabel()) : sub.getCode();
    }

    private AupFieldVO toVO(AupFieldDef f) {
        AupFieldVO v = new AupFieldVO();
        v.setId(f.getId());
        v.setFieldCode(f.getFieldCode());
        v.setLabel(f.getLabel());
        v.setType(f.getType());
        v.setDictKey(f.getDictKey());
        v.setOptions(fromJson(f.getOptions()));
        v.setRequired(f.getRequired());
        v.setDescription(f.getDescription());
        v.setConfig(fromJson(f.getConfig()));
        v.setShowWhen(fromJson(f.getShowWhen()));
        v.setFolderId(f.getFolderId());
        v.setStatus(f.getStatus());
        v.setFrozenAt(f.getFrozenAt());
        v.setFrozenBy(f.getFrozenBy());
        v.setSortOrder(f.getSortOrder());
        v.setRefCount(fieldMapper.countRefByFieldCode(f.getFieldCode()));
        return v;
    }

    private AupFieldDef copy(AupFieldDef f) {
        AupFieldDef c = new AupFieldDef();
        c.setId(f.getId());
        c.setFieldCode(f.getFieldCode());
        c.setLabel(f.getLabel());
        c.setType(f.getType());
        c.setDictKey(f.getDictKey());
        c.setOptions(f.getOptions());
        c.setRequired(f.getRequired());
        c.setDescription(f.getDescription());
        c.setConfig(f.getConfig());
        c.setShowWhen(f.getShowWhen());
        c.setFolderId(f.getFolderId());
        c.setStatus(f.getStatus());
        c.setSortOrder(f.getSortOrder());
        return c;
    }

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

    private String operatorName(User user) {
        if (user == null) {
            return null;
        }
        return isBlank(user.getName()) ? user.getUsername() : user.getName();
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
