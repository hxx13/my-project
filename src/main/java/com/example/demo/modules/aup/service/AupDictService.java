package com.example.demo.modules.aup.service;

import com.example.demo.common.dto.Result;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.aup.dto.*;
import com.example.demo.modules.aup.entity.Dict;
import com.example.demo.modules.aup.entity.DictItem;
import com.example.demo.modules.aup.mapper.AupFieldDefMapper;
import com.example.demo.modules.aup.mapper.DictItemMapper;
import com.example.demo.modules.aup.mapper.DictMapper;
import com.example.demo.modules.aup.mapper.FormFieldMapper;
import com.example.demo.modules.aup.util.AupVersionAllocator;
import com.example.demo.modules.auth.entity.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** AUP 公共字典：CRUD + 字典项排序 + 删字典前校验无字段引用 + 内置种子字典导入 + 版本状态机。 */
@Service
public class AupDictService {

    private static final Logger log = LoggerFactory.getLogger(AupDictService.class);
    private static final String BUILTIN_DICT_RESOURCE = "db/default-aup-dict.json";
    private static final Set<String> VERDICTS = Set.of("CONFIRM", "MODIFY", "DELETE", "QUESTION");

    private final DictMapper dictMapper;
    private final DictItemMapper dictItemMapper;
    private final FormFieldMapper fieldMapper;
    private final AupFieldDefMapper fieldDefMapper;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbcTemplate;
    private final AupConfigAuditService auditService;

    public AupDictService(DictMapper dictMapper, DictItemMapper dictItemMapper, FormFieldMapper fieldMapper,
                          AupFieldDefMapper fieldDefMapper, ObjectMapper objectMapper, JdbcTemplate jdbcTemplate,
                          AupConfigAuditService auditService) {
        this.dictMapper = dictMapper;
        this.dictItemMapper = dictItemMapper;
        this.fieldMapper = fieldMapper;
        this.fieldDefMapper = fieldDefMapper;
        this.objectMapper = objectMapper;
        this.jdbcTemplate = jdbcTemplate;
        this.auditService = auditService;
    }

    public Map<String, Object> listDicts(String keyword, String category, int page, int size) {
        int offset = (page - 1) * size;
        String cat = trimToNull(category);
        List<Dict> list = dictMapper.listByKeyword(keyword, cat, size, offset);
        int total = dictMapper.countByKeyword(keyword, cat);
        List<DictListItemVO> items = list.stream().map(d -> {
            DictListItemVO v = new DictListItemVO();
            v.setId(d.getId());
            v.setDictKey(d.getDictKey());
            v.setName(d.getName());
            v.setCategory(d.getCategory());
            v.setVersion(d.getVersion());
            v.setStatus(d.getStatus());
            v.setFolderId(d.getFolderId());
            v.setSource(d.getSource());
            v.setSourceRef(d.getSourceRef());
            v.setItemCount(dictItemMapper.countByDictId(d.getId()));
            v.setRefCount(fieldMapper.countByDictKey(d.getDictKey()) + fieldDefMapper.countByDictKey(d.getDictKey()));
            v.setVersionCount(dictMapper.listVersionsByKey(d.getDictKey()).size());
            return v;
        }).collect(Collectors.toList());
        Map<String, Object> result = new HashMap<>();
        result.put("total", total);
        result.put("items", items);
        return result;
    }

    @Transactional
    public Result<DictDetailVO> createDict(DictCreateRequest req, User operator) {
        String key = trim(req.getDictKey());
        if (key.isEmpty()) {
            return Result.fail(400, "dictKey 不能为空");
        }
        if (dictMapper.findByKey(key) != null) {
            return Result.fail(400, "字典键已存在");
        }
        Dict d = new Dict();
        d.setDictKey(key);
        d.setName(isBlank(req.getName()) ? key : req.getName().trim());
        d.setCategory(trimToNull(req.getCategory()));
        d.setVersion(1);
        d.setStatus("DRAFT");
        d.setSource("LOCAL");
        d.setFolderId(req.getFolderId());
        dictMapper.insert(d);
        auditService.log("codelist", d.getId(), d.getDictKey(), d.getName(), "CREATE", null, d, operator, null);

        return Result.success(toDetailVO(d));
    }

    public DictDetailVO getDict(String dictKey) {
        return getDict(dictKey, null);
    }

    public DictDetailVO getDict(String dictKey, Integer version) {
        Dict d = version == null ? dictMapper.findByKey(dictKey) : dictMapper.findByKeyAndVersion(dictKey, version);
        return d == null ? null : toDetailVO(d);
    }

    @Transactional
    public Result<?> renameDict(String dictKey, DictRenameRequest req, User operator) {
        Dict d = dictMapper.findLatestByKey(dictKey);
        if (d == null) {
            return Result.error("字典不存在");
        }
        Dict before = copyDict(d);
        if (req.getName() != null && !req.getName().isBlank()) {
            d.setName(req.getName().trim());
        }
        if (req.getCategory() != null) {
            d.setCategory(trimToNull(req.getCategory()));
        }
        if (req.getFolderId() != null) {
            d.setFolderId(req.getFolderId());
        }
        dictMapper.update(d);
        auditService.log("codelist", d.getId(), d.getDictKey(), d.getName(), "UPDATE", before, d, operator, null);
        return Result.success(null);
    }

    @Transactional
    public Result<?> deleteDict(String dictKey, User operator) {
        List<Dict> versions = dictMapper.listVersionsByKey(dictKey);
        if (versions.isEmpty()) {
            return Result.error("字典不存在");
        }
        for (Dict d : versions) {
            Result<?> ro = requireLocal(d);
            if (ro != null) {
                return ro;
            }
        }
        int refs = fieldMapper.countByDictKey(dictKey) + fieldDefMapper.countByDictKey(dictKey);
        if (refs > 0) {
            return Result.fail(400, "该字典被 " + refs + " 个字段引用，无法删除");
        }
        for (Dict d : versions) {
            dictItemMapper.deleteByDictId(d.getId());
            dictMapper.deleteById(d.getId());
            auditService.log("codelist", d.getId(), d.getDictKey(), d.getName(), "DELETE", d, null, operator, null);
        }
        return Result.success(null);
    }

    @Transactional
    public Result<DictItemVO> addItem(String dictKey, DictItemCreateRequest req, User operator) {
        Dict d = dictMapper.findLatestByKey(dictKey);
        if (d == null) {
            return Result.error("字典不存在");
        }
        Result<DictItemVO> ro = requireLocal(d);
        if (ro != null) {
            return ro;
        }
        String value = trim(req.getValue());
        if (value.isEmpty()) {
            return Result.fail(400, "value 不能为空");
        }
        if (dictItemMapper.countByDictIdAndValue(d.getId(), value) > 0) {
            return Result.fail(400, "字典项 value 已存在");
        }
        DictItem item = new DictItem();
        item.setDictId(d.getId());
        item.setValue(value);
        item.setLabel(isBlank(req.getLabel()) ? value : req.getLabel().trim());
        item.setSortOrder(req.getSortOrder() != null ? req.getSortOrder() : 0);
        dictItemMapper.insert(item);
        auditService.log("codelist_item", item.getId(), value, item.getLabel(), "CREATE", null, item, operator, null);
        return Result.success(toItemVO(item));
    }

    @Transactional
    public Result<?> updateItem(String dictKey, Long itemId, DictItemUpdateRequest req, User operator) {
        Dict d = dictMapper.findLatestByKey(dictKey);
        if (d == null) {
            return Result.error("字典不存在");
        }
        Result<?> ro = requireLocal(d);
        if (ro != null) {
            return ro;
        }
        DictItem item = dictItemMapper.findById(itemId);
        if (item == null || !d.getId().equals(item.getDictId())) {
            return Result.error("字典项不存在");
        }
        DictItem before = copyItem(item);
        // value 升格为稳定码，不允许修改；只允许改 label
        if (req.getLabel() != null) {
            item.setLabel(req.getLabel().trim());
        }
        dictItemMapper.update(item);
        auditService.log("codelist_item", item.getId(), item.getValue(), item.getLabel(), "UPDATE", before, item, operator, null);
        return Result.success(null);
    }

    @Transactional
    public Result<?> deleteItem(String dictKey, Long itemId, User operator) {
        Dict d = dictMapper.findLatestByKey(dictKey);
        if (d == null) {
            return Result.error("字典不存在");
        }
        Result<?> ro = requireLocal(d);
        if (ro != null) {
            return ro;
        }
        DictItem item = dictItemMapper.findById(itemId);
        if (item == null || !d.getId().equals(item.getDictId())) {
            return Result.error("字典项不存在");
        }
        dictItemMapper.deleteById(itemId);
        auditService.log("codelist_item", item.getId(), item.getValue(), item.getLabel(), "DELETE", item, null, operator, null);
        return Result.success(null);
    }

    @Transactional
    public Result<?> reorderItems(String dictKey, List<Long> itemIds, User operator) {
        Dict d = dictMapper.findLatestByKey(dictKey);
        if (d == null) {
            return Result.error("字典不存在");
        }
        Result<?> ro = requireLocal(d);
        if (ro != null) {
            return ro;
        }
        if (itemIds == null) {
            itemIds = List.of();
        }
        for (int i = 0; i < itemIds.size(); i++) {
            Long itemId = itemIds.get(i);
            DictItem item = dictItemMapper.findById(itemId);
            if (item == null || !d.getId().equals(item.getDictId())) {
                return Result.fail(400, "字典项不属于该字典: " + itemId);
            }
            dictItemMapper.updateSortOrder(itemId, i);
        }
        auditService.log("codelist", d.getId(), d.getDictKey(), d.getName(), "UPDATE", null, null, operator, "reorder items");
        return Result.success(null);
    }

    /**
     * 导入内置种子字典（db/default-aup-dict.json）。
     * 幂等：字典按 dictKey、字典项按 value 去重，已存在则不覆盖，只补充缺失项。
     * 新建种子字典落 version=1,status='PUBLISHED'（与存量回填一致）。
     */
    @Transactional
    public Map<String, Object> importBuiltinDicts() {
        int createdDicts = 0;
        int createdItems = 0;
        for (Map<String, Object> bd : loadBuiltinDicts()) {
            String dictKey = str(bd.get("dictKey"));
            if (dictKey == null) {
                continue;
            }
            Dict d = dictMapper.findByKey(dictKey);
            if (d == null) {
                d = new Dict();
                d.setDictKey(dictKey);
                String name = str(bd.get("name"));
                d.setName(name == null ? dictKey : name);
                d.setCategory(str(bd.get("category")));
                d.setVersion(1);
                d.setStatus("PUBLISHED");
                d.setPublishedAt(LocalDateTime.now());
                dictMapper.insert(d);
                createdDicts++;
                auditService.log("codelist", d.getId(), dictKey, d.getName(), "CREATE", null, d, null, "seed");
            }
            Object itemsObj = bd.get("items");
            if (!(itemsObj instanceof List<?> items)) {
                continue;
            }
            int order = 0;
            for (Object itemObj : items) {
                String itemName = str(itemObj);
                if (itemName == null || dictItemMapper.countByDictIdAndValue(d.getId(), itemName) > 0) {
                    continue;
                }
                DictItem item = new DictItem();
                item.setDictId(d.getId());
                item.setValue(itemName);
                item.setLabel(itemName);
                item.setSortOrder(order++);
                dictItemMapper.insert(item);
                createdItems++;
                auditService.log("codelist_item", item.getId(), itemName, itemName, "CREATE", null, item, null, "seed");
            }
        }
        Map<String, Object> out = new HashMap<>();
        out.put("createdDicts", createdDicts);
        out.put("createdItems", createdItems);
        return out;
    }

    /* ── 版本状态机 ── */

    public List<DictVersionVO> listVersions(String dictKey) {
        List<Dict> versions = dictMapper.listVersionsByKey(dictKey);
        return versions.stream().map(d -> {
            DictVersionVO v = new DictVersionVO();
            v.setId(d.getId());
            v.setDictKey(d.getDictKey());
            v.setName(d.getName());
            v.setVersion(d.getVersion());
            v.setStatus(d.getStatus());
            v.setFolderId(d.getFolderId());
            v.setPublishedAt(d.getPublishedAt());
            v.setPublishedBy(d.getPublishedBy());
            v.setReviewComment(d.getReviewComment());
            v.setItemCount(dictItemMapper.countByDictId(d.getId()));
            v.setCreatedAt(d.getCreatedAt());
            v.setUpdatedAt(d.getUpdatedAt());
            return v;
        }).collect(Collectors.toList());
    }

    public DictUsageVO getUsage(String dictKey) {
        DictUsageVO vo = new DictUsageVO();
        vo.setDictKey(dictKey);
        List<DictUsageRef> refs = new ArrayList<>();

        List<Map<String, Object>> tRefs = jdbcTemplate.queryForList(
                "SELECT f.field_key AS fieldKey, f.label AS fieldLabel, f.dict_version AS dictVersion, "
                        + "t.id AS templateId, t.form_key AS formKey, t.name AS templateName, t.version AS templateVersion "
                        + "FROM form_field f "
                        + "LEFT JOIN form_section s ON f.section_id = s.id "
                        + "LEFT JOIN form_subsection ss ON f.subsection_id = ss.id "
                        + "LEFT JOIN form_section s2 ON ss.section_id = s2.id "
                        + "JOIN form_template t ON t.id = COALESCE(s.template_id, s2.template_id) "
                        + "WHERE f.dict_key = ?", dictKey);
        for (Map<String, Object> m : tRefs) {
            refs.add(mapToRef(m, "TEMPLATE_FIELD"));
        }

        List<Map<String, Object>> fRefs = jdbcTemplate.queryForList(
                "SELECT fd.field_code AS fieldKey, fd.label AS fieldLabel, fd.id AS fieldDefId "
                        + "FROM aup_field_def fd WHERE fd.dict_key = ?", dictKey);
        for (Map<String, Object> m : fRefs) {
            refs.add(mapToRef(m, "FIELD_DEF"));
        }

        vo.setRefCount(refs.size());
        vo.setRefs(refs);
        return vo;
    }

    @Transactional
    public Result<?> submitReview(String dictKey, User operator) {
        Dict d = dictMapper.findLatestByKey(dictKey);
        if (d == null) {
            return Result.error("字典不存在");
        }
        Result<?> ro = requireLocal(d);
        if (ro != null) {
            return ro;
        }
        if (!"DRAFT".equals(d.getStatus())) {
            return Result.fail(400, "仅草稿状态可提交审核");
        }
        if (dictItemMapper.countByDictId(d.getId()) == 0) {
            return Result.fail(400, "字典至少需要一个选项项才能提交审核");
        }
        dictMapper.updateStatus(d.getId(), "PENDING_REVIEW");
        auditService.log("codelist", d.getId(), d.getDictKey(), d.getName(), "SUBMIT_REVIEW",
                Map.of("status", "DRAFT"), Map.of("status", "PENDING_REVIEW"), operator, null);
        return Result.success(null);
    }

    @Transactional
    public Result<?> approve(String dictKey, String comment, User operator) {
        Dict d = dictMapper.findLatestByKey(dictKey);
        if (d == null) {
            return Result.error("字典不存在");
        }
        Result<?> ro = requireLocal(d);
        if (ro != null) {
            return ro;
        }
        if (!"PENDING_REVIEW".equals(d.getStatus())) {
            return Result.fail(400, "仅待审核状态可发布");
        }
        if (dictItemMapper.countByDictId(d.getId()) == 0) {
            return Result.fail(400, "字典至少需要一个选项项才能发布");
        }
        LocalDateTime now = LocalDateTime.now();
        String opName = operatorName(operator);
        d.setStatus("PUBLISHED");
        d.setPublishedAt(now);
        d.setPublishedBy(opName);
        if (comment != null && !comment.isBlank()) {
            d.setReviewComment(comment.trim());
        }
        dictMapper.update(d);
        dictMapper.archivePublished(dictKey, d.getId());
        auditService.log("codelist", d.getId(), d.getDictKey(), d.getName(), "APPROVE",
                Map.of("status", "PENDING_REVIEW"), Map.of("status", "PUBLISHED"), operator, comment);
        return Result.success(null);
    }

    @Transactional
    public Result<?> reject(String dictKey, String comment, User operator) {
        Dict d = dictMapper.findLatestByKey(dictKey);
        if (d == null) {
            return Result.error("字典不存在");
        }
        Result<?> ro = requireLocal(d);
        if (ro != null) {
            return ro;
        }
        if (!"PENDING_REVIEW".equals(d.getStatus())) {
            return Result.fail(400, "仅待审核状态可驳回");
        }
        if (comment == null || comment.isBlank()) {
            return Result.fail(400, "驳回意见必填");
        }
        d.setStatus("DRAFT");
        d.setReviewComment(comment.trim());
        dictMapper.update(d);
        auditService.log("codelist", d.getId(), d.getDictKey(), d.getName(), "REJECT",
                Map.of("status", "PENDING_REVIEW"), Map.of("status", "DRAFT"), operator, comment);
        return Result.success(null);
    }

    @Transactional
    public Result<?> unfreeze(String dictKey, User operator) {
        Dict d = dictMapper.findLatestByKey(dictKey);
        if (d == null) {
            return Result.error("字典不存在");
        }
        Result<?> ro = requireLocal(d);
        if (ro != null) {
            return ro;
        }
        if (!"PUBLISHED".equals(d.getStatus())) {
            return Result.fail(400, "仅已发布状态可解冻");
        }
        int refs = fieldMapper.countByDictKey(dictKey) + fieldDefMapper.countByDictKey(dictKey);
        if (refs > 0) {
            return Result.fail(400, "该版本被 " + refs + " 个字段引用，无法解冻");
        }
        dictMapper.updateStatus(d.getId(), "DRAFT");
        auditService.log("codelist", d.getId(), d.getDictKey(), d.getName(), "UNFREEZE",
                Map.of("status", "PUBLISHED"), Map.of("status", "DRAFT"), operator, null);
        return Result.success(null);
    }

    @Transactional
    public Result<DictVersionVO> draft(String dictKey, User operator) {
        Dict published = dictMapper.findPublishedByKey(dictKey);
        if (published == null) {
            return Result.fail(400, "无已发布版本可克隆草稿");
        }
        Result<DictVersionVO> ro = requireLocal(published);
        if (ro != null) {
            return ro;
        }
        List<Integer> used = dictMapper.listVersionsByKey(dictKey).stream()
                .map(Dict::getVersion).collect(Collectors.toList());
        int nextVersion = AupVersionAllocator.nextAvailable(used);

        Dict d = new Dict();
        d.setDictKey(published.getDictKey());
        d.setName(published.getName());
        d.setCategory(published.getCategory());
        d.setVersion(nextVersion);
        d.setStatus("DRAFT");
        d.setFolderId(published.getFolderId());
        dictMapper.insert(d);

        int order = 0;
        for (DictItem item : dictItemMapper.listByDictId(published.getId())) {
            DictItem copy = new DictItem();
            copy.setDictId(d.getId());
            copy.setValue(item.getValue());
            copy.setLabel(item.getLabel());
            copy.setSortOrder(item.getSortOrder() != null ? item.getSortOrder() : order++);
            dictItemMapper.insert(copy);
        }
        auditService.log("codelist", d.getId(), d.getDictKey(), d.getName(), "NEW_VERSION",
                Map.of("fromVersion", published.getVersion()), Map.of("version", nextVersion), operator, null);

        DictVersionVO vo = new DictVersionVO();
        vo.setId(d.getId());
        vo.setDictKey(d.getDictKey());
        vo.setName(d.getName());
        vo.setVersion(d.getVersion());
        vo.setStatus(d.getStatus());
        vo.setFolderId(d.getFolderId());
        vo.setItemCount(dictItemMapper.countByDictId(d.getId()));
        return Result.success(vo);
    }

    @Transactional
    public Result<?> setVerdict(String dictKey, Long itemId, DictVerdictRequest req, User operator) {
        DictItem item = dictItemMapper.findById(itemId);
        if (item == null) {
            return Result.error("字典项不存在");
        }
        Dict owner = dictMapper.findById(item.getDictId());
        if (owner == null || !dictKey.equals(owner.getDictKey())) {
            return Result.error("字典项不属于该字典");
        }
        Result<?> ro = requireLocal(owner);
        if (ro != null) {
            return ro;
        }
        String verdict = trimToNull(req.getVerdict());
        if (verdict != null) {
            verdict = verdict.toUpperCase();
            if (!VERDICTS.contains(verdict)) {
                return Result.fail(400, "verdict 必须为 CONFIRM/MODIFY/DELETE/QUESTION");
            }
        }
        dictItemMapper.updateVerdict(itemId, verdict, req.getVerdictNote());
        auditService.log("codelist_item", itemId, item.getValue(), item.getLabel(), "UPDATE",
                Map.of("verdict", item.getVerdict()), Map.of("verdict", verdict), operator, req.getVerdictNote());
        return Result.success(null);
    }

    /** EXTERNAL 码表头只读：值域由源模块维护，拒绝一切写操作。放行（null）或返回失败结果。 */
    private <T> Result<T> requireLocal(Dict d) {
        if ("EXTERNAL".equalsIgnoreCase(d.getSource())) {
            return Result.fail(400, "外部引用码表只读，请到源模块编辑");
        }
        return null;
    }

    /* ── 视图转换 / 工具 ── */

    private DictDetailVO toDetailVO(Dict d) {
        DictDetailVO vo = new DictDetailVO();
        vo.setId(d.getId());
        vo.setDictKey(d.getDictKey());
        vo.setName(d.getName());
        vo.setCategory(d.getCategory());
        vo.setVersion(d.getVersion());
        vo.setStatus(d.getStatus());
        vo.setFolderId(d.getFolderId());
        vo.setPublishedAt(d.getPublishedAt());
        vo.setPublishedBy(d.getPublishedBy());
        vo.setReviewComment(d.getReviewComment());
        vo.setSource(d.getSource());
        vo.setSourceRef(d.getSourceRef());
        vo.setItems(dictItemMapper.listByDictId(d.getId()).stream()
                .map(this::toItemVO).collect(Collectors.toList()));
        return vo;
    }

    private DictItemVO toItemVO(DictItem item) {
        DictItemVO vo = new DictItemVO();
        vo.setItemId(item.getId());
        vo.setValue(item.getValue());
        vo.setLabel(item.getLabel());
        vo.setSortOrder(item.getSortOrder());
        vo.setVerdict(item.getVerdict());
        vo.setVerdictNote(item.getVerdictNote());
        return vo;
    }

    private Dict copyDict(Dict d) {
        Dict c = new Dict();
        c.setId(d.getId());
        c.setDictKey(d.getDictKey());
        c.setName(d.getName());
        c.setCategory(d.getCategory());
        c.setVersion(d.getVersion());
        c.setStatus(d.getStatus());
        c.setFolderId(d.getFolderId());
        c.setPublishedAt(d.getPublishedAt());
        c.setPublishedBy(d.getPublishedBy());
        c.setReviewComment(d.getReviewComment());
        return c;
    }

    private DictItem copyItem(DictItem item) {
        DictItem c = new DictItem();
        c.setId(item.getId());
        c.setDictId(item.getDictId());
        c.setValue(item.getValue());
        c.setLabel(item.getLabel());
        c.setSortOrder(item.getSortOrder());
        c.setVerdict(item.getVerdict());
        c.setVerdictNote(item.getVerdictNote());
        return c;
    }

    private DictUsageRef mapToRef(Map<String, Object> m, String refType) {
        DictUsageRef r = new DictUsageRef();
        r.setRefType(refType);
        r.setFieldKey(str(m.get("fieldKey")));
        r.setFieldLabel(str(m.get("fieldLabel")));
        r.setTemplateId(longOrNull(m.get("templateId")));
        r.setFormKey(str(m.get("formKey")));
        r.setTemplateName(str(m.get("templateName")));
        r.setTemplateVersion(intOrNull(m.get("templateVersion")));
        r.setDictVersion(intOrNull(m.get("dictVersion")));
        r.setFieldDefId(longOrNull(m.get("fieldDefId")));
        return r;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> loadBuiltinDicts() {
        try {
            ClassPathResource res = new ClassPathResource(BUILTIN_DICT_RESOURCE);
            if (!res.exists()) {
                return List.of();
            }
            String json = new String(res.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            Map<String, Object> root = objectMapper.readValue(json, Map.class);
            Object dictsObj = root.get("dicts");
            if (!(dictsObj instanceof List<?> list)) {
                return List.of();
            }
            List<Map<String, Object>> out = new ArrayList<>();
            for (Object o : list) {
                if (o instanceof Map<?, ?> m) {
                    out.add((Map<String, Object>) m);
                }
            }
            return out;
        } catch (Exception e) {
            log.warn("[aup-dict] 读取内置字典种子失败: {}", e.getMessage());
            return List.of();
        }
    }

    private String operatorName(User user) {
        if (user == null) {
            return null;
        }
        return isBlank(user.getName()) ? user.getUsername() : user.getName();
    }

    private String trim(String s) {
        return s == null ? "" : s.trim();
    }

    private String trimToNull(String s) {
        if (s == null || s.isBlank()) {
            return null;
        }
        return s.trim();
    }

    private String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isBlank() ? null : s;
    }

    private Long longOrNull(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Integer intOrNull(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
