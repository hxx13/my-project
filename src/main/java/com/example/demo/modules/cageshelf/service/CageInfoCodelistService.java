package com.example.demo.modules.cageshelf.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.cageshelf.entity.CageFormCompositeAtom;
import com.example.demo.modules.cageshelf.entity.CageFormField;
import com.example.demo.modules.cageshelf.entity.CageFormTemplate;
import com.example.demo.modules.cageshelf.entity.CageInfoCodelist;
import com.example.demo.modules.cageshelf.entity.CageInfoCodelistItem;
import com.example.demo.modules.cageshelf.entity.CageInfoCodelistLink;
import com.example.demo.modules.cageshelf.entity.CageInfoField;
import com.example.demo.modules.cageshelf.mapper.CageFormCompositeAtomMapper;
import com.example.demo.modules.cageshelf.mapper.CageFormFieldMapper;
import com.example.demo.modules.cageshelf.mapper.CageFormTemplateMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoCodelistItemMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoCodelistLinkMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoCodelistMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoFieldMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 笼位域码表 CRUD + 版本状态机 + 引用链 + 子字典联动。
 * 数据存 cage_info_codelist / cage_info_codelist_item / cage_info_codelist_link。
 */
@Service
public class CageInfoCodelistService {

    private static final int MAX_FOLDER_LEN = 64;

    private final CageInfoCodelistMapper codelistMapper;
    private final CageInfoCodelistItemMapper itemMapper;
    private final CageInfoCodelistLinkMapper linkMapper;
    private final CageInfoFieldMapper fieldMapper;
    private final CageFormTemplateMapper templateMapper;
    private final CageFormFieldMapper formFieldMapper;
    private final CageFormCompositeAtomMapper compositeAtomMapper;
    private final CageFormAuditService auditService;

    public CageInfoCodelistService(CageInfoCodelistMapper codelistMapper,
                                   CageInfoCodelistItemMapper itemMapper,
                                   CageInfoCodelistLinkMapper linkMapper,
                                   CageInfoFieldMapper fieldMapper,
                                   CageFormTemplateMapper templateMapper,
                                   CageFormFieldMapper formFieldMapper,
                                   CageFormCompositeAtomMapper compositeAtomMapper,
                                   CageFormAuditService auditService) {
        this.codelistMapper = codelistMapper;
        this.itemMapper = itemMapper;
        this.linkMapper = linkMapper;
        this.fieldMapper = fieldMapper;
        this.templateMapper = templateMapper;
        this.formFieldMapper = formFieldMapper;
        this.compositeAtomMapper = compositeAtomMapper;
        this.auditService = auditService;
    }

    public List<Map<String, Object>> list() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (CageInfoCodelist cl : codelistMapper.selectAll()) {
            out.add(toSummary(cl, fieldMapper.countByDictKey(cl.getCode())));
        }
        return out;
    }

    public Map<String, Object> detail(String code) {
        CageInfoCodelist cl = requireByCode(code);
        List<CageInfoCodelistItem> items = itemMapper.selectByCodelistId(cl.getId());
        Map<String, Object> m = toSummary(cl, fieldMapper.countByDictKey(cl.getCode()));
        List<Map<String, Object>> itemList = new ArrayList<>();
        for (CageInfoCodelistItem item : items) {
            itemList.add(toItemMap(item));
        }
        m.put("items", itemList);
        return m;
    }

    @Transactional
    public Map<String, Object> create(Map<String, Object> body, String operatorId) {
        String code = normalizeCode(str(body, "code"));
        String name = str(body, "name");
        String folder = normalizeFolder(str(body, "folder"));

        if (code == null || code.isBlank()) {
            throw new TwinBusinessException(400, "code 不能为空");
        }
        if (!code.matches("[A-Z][A-Z0-9_]{0,31}")) {
            throw new TwinBusinessException(400, "code 须为大写字母开头，仅含 A-Z、0-9、下划线，最长 32 字符");
        }
        if (name == null || name.isBlank()) {
            throw new TwinBusinessException(400, "name 不能为空");
        }
        if (codelistMapper.countByCode(code) > 0) {
            throw new TwinBusinessException(409, "码表编码「" + code + "」已存在");
        }

        CageInfoCodelist row = new CageInfoCodelist();
        row.setCode(code);
        row.setName(name.trim());
        row.setFolder(folder);
        row.setVersion(1);
        row.setStatus("DRAFT");
        codelistMapper.insert(row);
        auditService.logDictChange("CREATE", "codelist", row.getId(), row.getCode(), row.getName(),
                null, Map.of("code", row.getCode(), "name", row.getName()), operatorId);
        return detail(code);
    }

    @Transactional
    public Map<String, Object> updateMeta(String code, Map<String, Object> body, String operatorId) {
        CageInfoCodelist cl = requireByCode(code);
        Map<String, Object> before = Map.of("name", cl.getName(), "folder", cl.getFolder());
        if (body == null) {
            return detail(code);
        }
        if (body.containsKey("name")) {
            String name = str(body, "name");
            if (name == null || name.isBlank()) {
                throw new TwinBusinessException(400, "name 不能为空");
            }
            cl.setName(name.trim());
        }
        if (body.containsKey("folder")) {
            cl.setFolder(normalizeFolder(str(body, "folder")));
        }
        codelistMapper.updateMeta(cl);
        auditService.logDictChange("UPDATE", "codelist", cl.getId(), cl.getCode(), cl.getName(),
                before, Map.of("name", cl.getName(), "folder", cl.getFolder()), operatorId);
        return detail(code);
    }

    @Transactional
    public void delete(String code, String operatorId) {
        CageInfoCodelist cl = requireByCode(code);
        int refCount = fieldMapper.countByDictKey(code);
        if (refCount > 0) {
            throw new TwinBusinessException(409, "码表「" + code + "」仍被 " + refCount + " 个字段引用，无法删除");
        }
        auditService.logDictChange("DELETE", "codelist", cl.getId(), cl.getCode(), cl.getName(),
                Map.of("code", cl.getCode(), "name", cl.getName()), null, operatorId);
        itemMapper.deleteByCodelistId(cl.getId());
        codelistMapper.deleteById(cl.getId());
    }

    // ── 状态机 ──

    @Transactional
    public Map<String, Object> submitReview(String code, String operatorId) {
        CageInfoCodelist cl = requireByCode(code);
        if (!isEditable(cl.getStatus())) {
            throw new TwinBusinessException(409, "仅草稿/在用码表可提交校对");
        }
        cl.setStatus("PENDING_REVIEW");
        codelistMapper.updateStatus(cl);
        auditService.logDictChange("SUBMIT_REVIEW", "codelist", cl.getId(), cl.getCode(), cl.getName(),
                null, Map.of("status", "PENDING_REVIEW"), operatorId);
        return detail(code);
    }

    @Transactional
    public Map<String, Object> approve(String code, String operatorId) {
        CageInfoCodelist cl = requireByCode(code);
        if (!"PENDING_REVIEW".equals(cl.getStatus())) {
            throw new TwinBusinessException(409, "仅待校对码表可通过");
        }
        cl.setStatus("FROZEN");
        cl.setVersion((cl.getVersion() == null ? 0 : cl.getVersion()) + 1);
        codelistMapper.updateStatus(cl);
        auditService.logDictChange("APPROVE", "codelist", cl.getId(), cl.getCode(), cl.getName(),
                Map.of("status", "PENDING_REVIEW"), Map.of("status", "FROZEN", "version", cl.getVersion()), operatorId);
        return detail(code);
    }

    @Transactional
    public Map<String, Object> reject(String code, String operatorId) {
        CageInfoCodelist cl = requireByCode(code);
        if (!"PENDING_REVIEW".equals(cl.getStatus())) {
            throw new TwinBusinessException(409, "仅待校对码表可驳回");
        }
        cl.setStatus("DRAFT");
        codelistMapper.updateStatus(cl);
        auditService.logDictChange("REJECT", "codelist", cl.getId(), cl.getCode(), cl.getName(),
                Map.of("status", "PENDING_REVIEW"), Map.of("status", "DRAFT"), operatorId);
        return detail(code);
    }

    @Transactional
    public Map<String, Object> unfreeze(String code, String operatorId) {
        CageInfoCodelist cl = requireByCode(code);
        if (!isPublished(cl.getStatus())) {
            throw new TwinBusinessException(409, "仅已发布码表可解冻");
        }
        int refCount = fieldMapper.countByDictKey(code);
        if (refCount > 0) {
            throw new TwinBusinessException(409, "码表「" + code + "」仍被 " + refCount + " 个字段引用，无法解冻");
        }
        cl.setStatus("DRAFT");
        codelistMapper.updateStatus(cl);
        auditService.logDictChange("UNFREEZE", "codelist", cl.getId(), cl.getCode(), cl.getName(),
                Map.of("status", "FROZEN"), Map.of("status", "DRAFT"), operatorId);
        return detail(code);
    }

    @Transactional
    public Map<String, Object> unfreezeUnused(String operatorId) {
        int unfrozen = 0;
        for (CageInfoCodelist cl : codelistMapper.selectAll()) {
            if (isPublished(cl.getStatus()) && fieldMapper.countByDictKey(cl.getCode()) == 0) {
                cl.setStatus("DRAFT");
                codelistMapper.updateStatus(cl);
                unfrozen++;
            }
        }
        if (unfrozen > 0) {
            auditService.logDictChange("BATCH_UNFREEZE", "codelist", null, null, null,
                    null, Map.of("count", unfrozen), operatorId);
        }
        return Map.of("unfrozenCount", unfrozen);
    }

    // ── 引用链（字段 → 字典套 → 原子 → 组合） ──

    public Map<String, Object> usage(String code) {
        CageInfoCodelist cl = requireByCode(code);
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("code", code);
        root.put("name", cl.getName());
        root.put("refCount", fieldMapper.countByDictKey(code));
        List<Map<String, Object>> fields = new ArrayList<>();
        for (CageInfoField f : fieldMapper.selectByDictKey(code)) {
            fields.add(fieldUsageChain(f));
        }
        root.put("fields", fields);
        return root;
    }

    private Map<String, Object> fieldUsageChain(CageInfoField f) {
        Map<String, Object> fm = new LinkedHashMap<>();
        fm.put("fieldId", f.getId());
        fm.put("canonical", f.getCanonical());
        fm.put("label", f.getLabel());
        fm.put("domainCode", f.getDomainCode());
        fm.put("submoduleCode", f.getSubmoduleCode());
        fm.put("status", f.getStatus());
        // 原子模板（含该字段）
        List<Map<String, Object>> atoms = new ArrayList<>();
        Set<Long> seenAtom = new LinkedHashSet<>();
        for (CageFormField tf : formFieldMapper.selectByFieldId(f.getId())) {
            if (tf.getTemplateId() == null || !seenAtom.add(tf.getTemplateId())) continue;
            CageFormTemplate atom = templateMapper.selectById(tf.getTemplateId());
            if (atom == null || !"ATOM".equals(atom.getKind())) continue;
            Map<String, Object> am = new LinkedHashMap<>();
            am.put("templateId", atom.getId());
            am.put("formKey", atom.getFormKey());
            am.put("title", atom.getTitle());
            am.put("status", atom.getStatus());
            am.put("version", atom.getVersion());
            am.put("composites", compositesPinningAtom(atom.getId()));
            atoms.add(am);
        }
        fm.put("atoms", atoms);
        return fm;
    }

    private List<Map<String, Object>> compositesPinningAtom(Long atomTemplateId) {
        List<Map<String, Object>> out = new ArrayList<>();
        Set<Long> seen = new LinkedHashSet<>();
        for (CageFormCompositeAtom ref : compositeAtomMapper.selectByAtomId(atomTemplateId)) {
            if (ref.getCompositeTemplateId() == null || !seen.add(ref.getCompositeTemplateId())) continue;
            CageFormTemplate c = templateMapper.selectById(ref.getCompositeTemplateId());
            if (c == null) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("templateId", c.getId());
            m.put("formKey", c.getFormKey());
            m.put("title", c.getTitle());
            m.put("status", c.getStatus());
            m.put("version", c.getVersion());
            out.add(m);
        }
        return out;
    }

    // ── 码表项 CRUD + 子字典联动 ──

    @Transactional
    public Map<String, Object> addItem(String code, Map<String, Object> body, String operatorId) {
        CageInfoCodelist cl = requireByCode(code);
        requireEditable(cl);
        String itemCode = str(body, "itemCode");
        String itemLabel = str(body, "itemLabel");
        if (itemCode == null || itemCode.isBlank()) {
            throw new TwinBusinessException(400, "itemCode 不能为空");
        }
        itemCode = itemCode.trim();
        if (itemLabel == null || itemLabel.isBlank()) {
            itemLabel = itemCode;
        } else {
            itemLabel = itemLabel.trim();
        }
        if (itemMapper.countByCodelistIdAndItemCode(cl.getId(), itemCode) > 0) {
            throw new TwinBusinessException(409, "内部值「" + itemCode + "」已存在");
        }
        Integer maxSort = itemMapper.selectMaxSortOrder(cl.getId());
        int nextSort = (maxSort == null ? 0 : maxSort) + 10;

        CageInfoCodelistItem item = new CageInfoCodelistItem();
        item.setCodelistId(cl.getId());
        item.setItemCode(itemCode);
        item.setItemLabel(itemLabel);
        item.setSortOrder(nextSort);
        itemMapper.insert(item);
        auditService.logDictChange("CREATE", "codelist", cl.getId(), cl.getCode(),
                cl.getName() + "/" + item.getItemCode(),
                null, toItemMap(item), operatorId);
        return toItemMap(item);
    }

    @Transactional
    public void updateItem(String code, Long itemId, Map<String, Object> body, String operatorId) {
        CageInfoCodelist cl = requireByCode(code);
        requireEditable(cl);
        CageInfoCodelistItem item = requireItem(cl.getId(), itemId);
        Map<String, Object> before = toItemMap(item);
        if (body == null) {
            return;
        }
        if (body.containsKey("itemLabel")) {
            String label = str(body, "itemLabel");
            if (label == null || label.isBlank()) {
                throw new TwinBusinessException(400, "itemLabel 不能为空");
            }
            item.setItemLabel(label.trim());
        }
        if (body.containsKey("sortOrder")) {
            Integer sort = toInt(body.get("sortOrder"));
            if (sort == null) {
                throw new TwinBusinessException(400, "sortOrder 无效");
            }
            item.setSortOrder(sort);
        }
        itemMapper.update(item);
        auditService.logDictChange("UPDATE", "codelist", cl.getId(), cl.getCode(),
                cl.getName() + "/" + item.getItemCode(),
                before, toItemMap(item), operatorId);
    }

    @Transactional
    public void deleteItem(String code, Long itemId, String operatorId) {
        CageInfoCodelist cl = requireByCode(code);
        requireEditable(cl);
        CageInfoCodelistItem item = requireItem(cl.getId(), itemId);
        auditService.logDictChange("DELETE", "codelist", cl.getId(), cl.getCode(),
                cl.getName() + "/" + item.getItemCode(),
                toItemMap(item), null, operatorId);
        itemMapper.deleteById(item.getId());
    }

    @Transactional
    public Map<String, Object> addLink(String code, Long itemId, String childCodelistCode, String operatorId) {
        CageInfoCodelist cl = requireByCode(code);
        CageInfoCodelistItem item = requireItem(cl.getId(), itemId);
        CageInfoCodelist child = requireByCode(childCodelistCode);
        if (child.getId().equals(cl.getId())) {
            throw new TwinBusinessException(400, "不能联动到自身");
        }
        CageInfoCodelistLink link = new CageInfoCodelistLink();
        link.setItemId(item.getId());
        link.setChildCodelistId(child.getId());
        link.setSortOrder(0);
        linkMapper.insert(link);
        auditService.logDictChange("ADD_LINK", "codelist", cl.getId(), cl.getCode(),
                cl.getName() + "/" + item.getItemCode() + " → " + child.getCode(),
                null, Map.of("childCodelistCode", child.getCode()), operatorId);
        return toLinkMap(link, child);
    }

    @Transactional
    public void removeLink(String code, Long itemId, Long linkId, String operatorId) {
        CageInfoCodelist cl = requireByCode(code);
        CageInfoCodelistItem item = requireItem(cl.getId(), itemId);
        for (CageInfoCodelistLink link : linkMapper.selectByItemId(item.getId())) {
            if (link.getId().equals(linkId)) {
                linkMapper.deleteById(linkId);
                auditService.logDictChange("REMOVE_LINK", "codelist", cl.getId(), cl.getCode(),
                        cl.getName() + "/" + item.getItemCode(), null, null, operatorId);
                return;
            }
        }
        throw new TwinBusinessException(404, "联动不存在");
    }

    // ── helpers ──

    private CageInfoCodelist requireByCode(String code) {
        if (code == null || code.isBlank()) {
            throw new TwinBusinessException(400, "code 不能为空");
        }
        CageInfoCodelist cl = codelistMapper.selectByCode(code.trim());
        if (cl == null) {
            throw new TwinBusinessException(404, "码表不存在：" + code);
        }
        return cl;
    }

    private void requireEditable(CageInfoCodelist cl) {
        if (!isEditable(cl.getStatus())) {
            throw new TwinBusinessException(409, "码表已冻结（" + cl.getStatus() + "），不可编辑项，请先解冻");
        }
    }

    private CageInfoCodelistItem requireItem(Long codelistId, Long itemId) {
        if (itemId == null) {
            throw new TwinBusinessException(400, "itemId 不能为空");
        }
        CageInfoCodelistItem item = itemMapper.selectById(itemId);
        if (item == null || !codelistId.equals(item.getCodelistId())) {
            throw new TwinBusinessException(404, "码表项不存在");
        }
        return item;
    }

    private Map<String, Object> toSummary(CageInfoCodelist cl, int refCount) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", cl.getId());
        m.put("code", cl.getCode());
        m.put("name", cl.getName());
        m.put("folder", cl.getFolder());
        m.put("version", cl.getVersion());
        m.put("status", cl.getStatus());
        m.put("itemCount", cl.getItemCount() != null ? cl.getItemCount() : itemMapper.countByCodelistId(cl.getId()));
        m.put("refCount", refCount);
        return m;
    }

    private Map<String, Object> toItemMap(CageInfoCodelistItem item) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", item.getId());
        m.put("itemCode", item.getItemCode());
        m.put("itemLabel", item.getItemLabel());
        m.put("sortOrder", item.getSortOrder());
        List<Map<String, Object>> childLinks = new ArrayList<>();
        for (CageInfoCodelistLink link : linkMapper.selectByItemId(item.getId())) {
            CageInfoCodelist child = codelistMapper.selectById(link.getChildCodelistId());
            childLinks.add(toLinkMap(link, child));
        }
        m.put("childLinks", childLinks);
        return m;
    }

    private Map<String, Object> toLinkMap(CageInfoCodelistLink link, CageInfoCodelist child) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("linkId", link.getId());
        m.put("childCodelistId", link.getChildCodelistId());
        m.put("childCodelistCode", child == null ? null : child.getCode());
        m.put("childCodelistName", child == null ? null : child.getName());
        return m;
    }

    private static boolean isEditable(String status) {
        String s = status == null ? "" : status.toUpperCase();
        return "DRAFT".equals(s) || "ACTIVE".equals(s);
    }

    private static boolean isPublished(String status) {
        String s = status == null ? "" : status.toUpperCase();
        return "FROZEN".equals(s) || "PUBLISHED".equals(s);
    }

    private static String normalizeCode(String code) {
        return code == null ? null : code.trim().toUpperCase();
    }

    private static String normalizeFolder(String folder) {
        if (folder == null) {
            return null;
        }
        String t = folder.trim();
        if (t.isEmpty()) {
            return null;
        }
        if (t.length() > MAX_FOLDER_LEN) {
            throw new TwinBusinessException(400, "文件夹路径不能超过 " + MAX_FOLDER_LEN + " 个字符");
        }
        return t;
    }

    private static String str(Map<String, Object> m, String k) {
        if (m == null) return null;
        Object v = m.get(k);
        return v == null ? null : String.valueOf(v).trim();
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
