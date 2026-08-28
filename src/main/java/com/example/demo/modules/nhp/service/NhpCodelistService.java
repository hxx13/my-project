package com.example.demo.modules.nhp.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.entity.CrfCodelist;
import com.example.demo.modules.nhp.entity.CrfCodelistItem;
import com.example.demo.modules.nhp.entity.CrfCodelistLink;
import com.example.demo.modules.nhp.entity.CrfCompositeAtom;
import com.example.demo.modules.nhp.entity.CrfDictChangeLog;
import com.example.demo.modules.nhp.entity.CrfField;
import com.example.demo.modules.nhp.entity.CrfFieldDictionary;
import com.example.demo.modules.nhp.entity.CrfForm;
import com.example.demo.modules.nhp.entity.CrfTemplateField;
import com.example.demo.modules.nhp.mapper.CrfCodelistItemMapper;
import com.example.demo.modules.nhp.mapper.CrfCodelistLinkMapper;
import com.example.demo.modules.nhp.mapper.CrfCodelistMapper;
import com.example.demo.modules.nhp.mapper.CrfCompositeAtomMapper;
import com.example.demo.modules.nhp.mapper.CrfDictChangeLogMapper;
import com.example.demo.modules.nhp.mapper.CrfFieldDictionaryMapper;
import com.example.demo.modules.nhp.mapper.CrfFieldMapper;
import com.example.demo.modules.nhp.mapper.CrfFormMapper;
import com.example.demo.modules.nhp.mapper.CrfTemplateFieldMapper;
import com.example.demo.modules.nhp.util.NhpVersionAllocator;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * NHP 码表：整表版本 + 校对流（DRAFT→PENDING_REVIEW→FROZEN）。
 * <p>变更规则：仅 DRAFT/ACTIVE 可改项；已冻结默认可「新建版本」克隆后再改。
 * 无活跃字段引用时可「解冻」回草稿（软删字段不计占用）。
 * 发布新版时保留仍被字段引用的历史 FROZEN 版本。
 */
@Service
public class NhpCodelistService {

    private final CrfCodelistMapper codelistMapper;
    private final CrfCodelistItemMapper itemMapper;
    private final CrfCodelistLinkMapper linkMapper;
    private final CrfFieldMapper fieldMapper;
    private final CrfFieldDictionaryMapper dictionaryMapper;
    private final CrfTemplateFieldMapper templateFieldMapper;
    private final CrfFormMapper formMapper;
    private final CrfCompositeAtomMapper compositeAtomMapper;
    private final CrfDictChangeLogMapper changeLogMapper;
    private final ObjectMapper objectMapper;

    public NhpCodelistService(CrfCodelistMapper codelistMapper, CrfCodelistItemMapper itemMapper,
                              CrfCodelistLinkMapper linkMapper, CrfFieldMapper fieldMapper,
                              CrfFieldDictionaryMapper dictionaryMapper,
                              CrfTemplateFieldMapper templateFieldMapper,
                              CrfFormMapper formMapper,
                              CrfCompositeAtomMapper compositeAtomMapper,
                              CrfDictChangeLogMapper changeLogMapper,
                              ObjectMapper objectMapper) {
        this.codelistMapper = codelistMapper;
        this.itemMapper = itemMapper;
        this.linkMapper = linkMapper;
        this.fieldMapper = fieldMapper;
        this.dictionaryMapper = dictionaryMapper;
        this.templateFieldMapper = templateFieldMapper;
        this.formMapper = formMapper;
        this.compositeAtomMapper = compositeAtomMapper;
        this.changeLogMapper = changeLogMapper;
        this.objectMapper = objectMapper;
    }

    /** 码表列表头：每 code 一条最新版（附带 refCount、versionCount）。 */
    public List<Map<String, Object>> list() {
        Map<Long, Integer> refCounts = loadRefCounts();
        Map<String, Integer> versionCounts = new LinkedHashMap<>();
        Map<String, CrfCodelist> heads = new LinkedHashMap<>();
        for (CrfCodelist cl : codelistMapper.list()) {
            versionCounts.merge(cl.getCode(), 1, Integer::sum);
            heads.putIfAbsent(cl.getCode(), cl); // list 已按 version DESC
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (CrfCodelist cl : heads.values()) {
            Map<String, Object> m = toListItem(cl, refCounts);
            m.put("versionCount", versionCounts.getOrDefault(cl.getCode(), 1));
            out.add(m);
        }
        return out;
    }

    /**
     * 字段挂接选项：每 code 优先最新 FROZEN；尚无冻结版时回退最新草稿（种子期可绑）。
     */
    public List<Map<String, Object>> listPublishedOptions() {
        Map<Long, Integer> refCounts = loadRefCounts();
        Map<String, CrfCodelist> frozen = new LinkedHashMap<>();
        Map<String, CrfCodelist> draftFallback = new LinkedHashMap<>();
        for (CrfCodelist cl : codelistMapper.list()) {
            String st = cl.getStatus() == null ? "" : cl.getStatus().toUpperCase();
            if ("FROZEN".equals(st) || "PUBLISHED".equals(st)) {
                frozen.putIfAbsent(cl.getCode(), cl);
            } else if (isEditable(st)) {
                draftFallback.putIfAbsent(cl.getCode(), cl);
            }
        }
        List<Map<String, Object>> out = new ArrayList<>();
        java.util.TreeSet<String> codes = new java.util.TreeSet<>();
        codes.addAll(frozen.keySet());
        codes.addAll(draftFallback.keySet());
        for (String code : codes) {
            CrfCodelist cl = frozen.containsKey(code) ? frozen.get(code) : draftFallback.get(code);
            if (cl != null) out.add(toListItem(cl, refCounts));
        }
        return out;
    }

    public List<Map<String, Object>> listVersions(String code) {
        List<Map<String, Object>> out = new ArrayList<>();
        Map<Long, Integer> refCounts = loadRefCounts();
        for (CrfCodelist cl : codelistMapper.listByCode(code)) {
            out.add(toListItem(cl, refCounts));
        }
        return out;
    }

    /**
     * 新建码表（首版 v1 草稿，无选项项）。
     * code 全局唯一；已软删过的 code 不可复活（与种子策略一致）。
     */
    @Transactional
    public Result<Map<String, Object>> createCodelist(String code, String name, String folder) {
        if (code == null || code.isBlank()) {
            return Result.fail(400, "code 不能为空");
        }
        String normalized = code.trim().toUpperCase();
        if (!normalized.matches("[A-Z][A-Z0-9_]{0,31}")) {
            return Result.fail(400, "code 须为大写字母开头，仅含 A-Z、0-9、下划线，最长 32 字符");
        }
        if (name == null || name.isBlank()) {
            return Result.fail(400, "name 不能为空");
        }
        if (codelistMapper.countAnyByCode(normalized) > 0) {
            return Result.fail(409, "码表编码「" + normalized + "」已存在（含曾软删记录，不可复用）");
        }
        String folderNorm = normalizeFolder(folder);
        CrfCodelist neu = new CrfCodelist();
        neu.setCode(normalized);
        neu.setName(name.trim());
        neu.setFolder(folderNorm);
        neu.setVersion(1);
        neu.setStatus("DRAFT");
        neu.setActive(true);
        codelistMapper.insert(neu);
        logChange(neu.getId(), "CREATE", null, Map.of("code", normalized, "version", 1), null, null);
        return detailById(neu.getId());
    }

    /**
     * 更新码表定义元数据（name / folder），同步到同 code 全部活跃版本。
     */
    @Transactional
    public Result<Map<String, Object>> updateCodelistMeta(String code, String name, String folder) {
        if (code == null || code.isBlank()) {
            return Result.fail(400, "code 不能为空");
        }
        List<CrfCodelist> rows = codelistMapper.listByCode(code.trim());
        if (rows == null || rows.isEmpty()) {
            return Result.error("码表不存在");
        }
        CrfCodelist head = rows.get(0);
        String newName = name != null && !name.isBlank() ? name.trim() : head.getName();
        String newFolder = folder != null ? normalizeFolder(folder) : head.getFolder();
        if (newName == null || newName.isBlank()) {
            return Result.fail(400, "name 不能为空");
        }
        codelistMapper.updateMetaByCode(code.trim(), newName, newFolder);
        return detail(code.trim(), null);
    }

    public Result<Map<String, Object>> detail(String code) {
        return detail(code, null);
    }

    public Result<Map<String, Object>> detail(String code, Integer version) {
        CrfCodelist cl = version == null
                ? resolveEditableOrLatest(code)
                : codelistMapper.findByCodeAndVersion(code, version);
        if (cl == null || Boolean.FALSE.equals(cl.getActive())) {
            return Result.error("码表不存在");
        }
        return Result.success(buildDetail(cl));
    }

    public Result<Map<String, Object>> detailById(Long id) {
        CrfCodelist cl = codelistMapper.findById(id);
        if (cl == null || Boolean.FALSE.equals(cl.getActive())) {
            return Result.error("码表不存在");
        }
        return Result.success(buildDetail(cl));
    }

    /**
     * 完整引用链（按版本）：码表版本 → 字段 → 字典套 → 原子模板 → 组合模板。
     */
    public Map<String, Object> usageGraph(String code) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("code", code);
        List<Map<String, Object>> versions = new ArrayList<>();
        for (CrfCodelist cl : codelistMapper.listByCode(code)) {
            versions.add(usageNodeForVersion(cl));
        }
        root.put("versions", versions);
        return root;
    }

    public Result<Map<String, Object>> usageGraphById(Long id) {
        CrfCodelist cl = codelistMapper.findById(id);
        if (cl == null || Boolean.FALSE.equals(cl.getActive())) {
            return Result.error("码表不存在");
        }
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("code", cl.getCode());
        root.put("versions", List.of(usageNodeForVersion(cl)));
        return Result.success(root);
    }

    /** DRAFT → PENDING_REVIEW */
    @Transactional
    public Result<?> submitReview(String code) {
        CrfCodelist form = requireEditable(code);
        if (form == null) {
            CrfCodelist any = resolveEditableOrLatest(code);
            if (any == null) return Result.error("码表不存在");
            return Result.fail(400, "仅草稿可提交校对，当前 " + any.getStatus());
        }
        if (itemMapper.listByCodelistId(form.getId()).isEmpty()) {
            return Result.fail(400, "码表无选项项，无法提交校对");
        }
        codelistMapper.updateStatus(form.getId(), "PENDING_REVIEW");
        logChange(form.getId(), "SUBMIT_REVIEW", "DRAFT", "PENDING_REVIEW", null, null);
        return Result.success(toListItem(codelistMapper.findById(form.getId()), loadRefCounts()));
    }

    /**
     * 校对通过并冻结发布：PENDING_REVIEW → FROZEN。
     * 同 code 其它 FROZEN：无字段引用则 ARCHIVED；有引用则保留（占用版本不可丢）。
     */
    @Transactional
    public Result<?> approveReview(String code, String operator, String comment) {
        CrfCodelist form = findOpenVersion(code);
        if (form == null) {
            return Result.error("码表不存在");
        }
        if (!"PENDING_REVIEW".equalsIgnoreCase(nullToEmpty(form.getStatus()))) {
            return Result.fail(400, "仅待校对可冻结发布，当前 " + form.getStatus());
        }
        String op = blankToUnknown(operator);
        String note = comment == null ? "" : comment.trim();
        Map<Long, Integer> refCounts = loadRefCounts();
        List<Map<String, Object>> retained = new ArrayList<>();
        List<Map<String, Object>> archived = new ArrayList<>();
        for (CrfCodelist v : codelistMapper.listByCode(code)) {
            if (v.getId().equals(form.getId())) continue;
            if (!isPublished(v.getStatus())) continue;
            int refs = refCounts.getOrDefault(v.getId(), 0);
            if (refs > 0) {
                Map<String, Object> keep = toListItem(v, refCounts);
                keep.put("retainReason", "仍被 " + refs + " 个字段引用");
                retained.add(keep);
            } else {
                codelistMapper.updateStatus(v.getId(), "ARCHIVED");
                archived.add(toListItem(codelistMapper.findById(v.getId()), refCounts));
            }
        }
        codelistMapper.updateStatus(form.getId(), "FROZEN");
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("status", "FROZEN");
        after.put("retainedVersions", retained);
        after.put("archivedVersions", archived);
        after.put("comment", note);
        logChange(form.getId(), "APPROVE_REVIEW", "PENDING_REVIEW", after, op, note);
        Map<String, Object> out = toListItem(codelistMapper.findById(form.getId()), loadRefCounts());
        out.put("retainedVersions", retained);
        out.put("archivedVersions", archived);
        return Result.success(out);
    }

    /** PENDING_REVIEW → DRAFT（须意见） */
    @Transactional
    public Result<?> rejectReview(String code, String operator, String comment) {
        CrfCodelist form = findOpenVersion(code);
        if (form == null) {
            return Result.error("码表不存在");
        }
        if (!"PENDING_REVIEW".equalsIgnoreCase(nullToEmpty(form.getStatus()))) {
            return Result.fail(400, "仅待校对可驳回，当前 " + form.getStatus());
        }
        String note = comment == null ? "" : comment.trim();
        if (note.isEmpty()) {
            return Result.fail(400, "驳回须填写校对意见");
        }
        String op = blankToUnknown(operator);
        codelistMapper.updateStatus(form.getId(), "DRAFT");
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("status", "DRAFT");
        after.put("comment", note);
        logChange(form.getId(), "REJECT_REVIEW", "PENDING_REVIEW", after, op, note);
        return Result.success(toListItem(codelistMapper.findById(form.getId()), loadRefCounts()));
    }

    /**
     * 解冻：FROZEN/PUBLISHED → DRAFT。无活跃字段绑定本版时可解冻（软删字段不计）。
     * 同 code 已有草稿/待校对则 409。仍有引用时列出字段名。
     */
    @Transactional
    public Result<?> unfreeze(String code, String operator) {
        if (code == null || code.isBlank()) {
            return Result.fail(400, "code 不能为空");
        }
        CrfCodelist open = findOpenVersion(code.trim());
        if (open != null) {
            return Result.fail(409, "已有未发布版本 v" + open.getVersion()
                    + "（" + open.getStatus() + "），请先编辑该草稿，无需解冻冻结版");
        }
        CrfCodelist form = null;
        for (CrfCodelist v : codelistMapper.listByCode(code.trim())) {
            if (isPublished(v.getStatus())) {
                form = v;
                break;
            }
        }
        if (form == null) {
            return Result.error("码表不存在或无可解冻的已冻结版本");
        }
        List<CrfField> refs = fieldMapper.listByCodelistId(form.getId());
        if (refs != null && !refs.isEmpty()) {
            String names = refs.stream()
                    .map(f -> {
                        String fc = f.getFieldCode() == null ? "?" : f.getFieldCode();
                        String cn = f.getNameCn() == null ? "" : f.getNameCn().trim();
                        return cn.isEmpty() ? fc : (cn + "(" + fc + ")");
                    })
                    .collect(Collectors.joining("、"));
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("refCount", refs.size());
            data.put("fields", refs.stream().map(f -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("fieldId", f.getId());
                m.put("fieldCode", f.getFieldCode());
                m.put("nameCn", f.getNameCn());
                m.put("status", f.getStatus());
                return m;
            }).toList());
            Result<Map<String, Object>> blocked = Result.fail(409,
                    "无法解冻码表「" + form.getCode() + "」@v" + form.getVersion()
                            + "——仍被 " + refs.size() + " 个活跃字段引用：" + names
                            + "。请先解冻/改挂这些字段，或「新建版本」在草稿上改项。软删字段不计占用。");
            blocked.setData(data);
            return blocked;
        }
        String op = blankToUnknown(operator);
        String before = form.getStatus();
        codelistMapper.updateStatus(form.getId(), "DRAFT");
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("status", "DRAFT");
        logChange(form.getId(), "UNFREEZE", before, after, op, null);
        return Result.success(toListItem(codelistMapper.findById(form.getId()), loadRefCounts()),
                "已解冻为草稿，可直接改项");
    }

    /**
     * 恢复已归档版本为已发布（ARCHIVED → FROZEN），不进入草稿编辑态。
     * 同 code 其它 FROZEN 归档，保证至多一个已发布版。
     */
    @Transactional
    public Result<?> restoreArchived(String code, String operator) {
        if (code == null || code.isBlank()) {
            return Result.fail(400, "code 不能为空");
        }
        CrfCodelist archived = null;
        for (CrfCodelist v : codelistMapper.listByCode(code.trim())) {
            if (isArchived(v.getStatus())) {
                archived = v;
                break;
            }
        }
        if (archived == null) {
            return Result.error("码表不存在或无可恢复的已归档版本");
        }
        for (CrfCodelist v : codelistMapper.listByCode(code.trim())) {
            if (!v.getId().equals(archived.getId()) && isPublished(v.getStatus())) {
                codelistMapper.updateStatus(v.getId(), "ARCHIVED");
            }
        }
        String op = blankToUnknown(operator);
        String before = archived.getStatus();
        codelistMapper.updateStatus(archived.getId(), "FROZEN");
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("status", "FROZEN");
        logChange(archived.getId(), "RESTORE_ARCHIVED", before, after, op, null);
        return Result.success(toListItem(codelistMapper.findById(archived.getId()), loadRefCounts()),
                "已恢复为已发布版本");
    }

    /**
     * 批量解冻：所有「无活跃字段引用」的已冻结码表版本 → DRAFT。
     * 有引用的跳过并汇总；用于种子/重导入后批量回草稿。
     */
    @Transactional
    public Result<?> unfreezeUnused(String operator) {
        String op = blankToUnknown(operator);
        Map<Long, Integer> refCounts = loadRefCounts();
        int thawed = 0;
        List<String> skipped = new ArrayList<>();
        Set<String> seenCode = new LinkedHashSet<>();
        for (CrfCodelist cl : codelistMapper.list()) {
            if (cl == null || !Boolean.TRUE.equals(cl.getActive())) continue;
            if (!isPublished(cl.getStatus())) continue;
            // 每 code 只尝试最新已发布版（list 通常按 code/version；仍用 find 保证）
            if (!seenCode.add(cl.getCode())) continue;
            CrfCodelist head = null;
            for (CrfCodelist v : codelistMapper.listByCode(cl.getCode())) {
                if (isPublished(v.getStatus())) {
                    head = v;
                    break;
                }
            }
            if (head == null) continue;
            if (findOpenVersion(head.getCode()) != null) {
                skipped.add(head.getCode() + "@v" + head.getVersion() + ": 已有草稿/待校对");
                continue;
            }
            int refs = refCounts.getOrDefault(head.getId(), 0);
            if (refs > 0) {
                skipped.add(head.getCode() + "@v" + head.getVersion() + ": 仍被 " + refs + " 个字段引用");
                continue;
            }
            String before = head.getStatus();
            codelistMapper.updateStatus(head.getId(), "DRAFT");
            Map<String, Object> after = new LinkedHashMap<>();
            after.put("status", "DRAFT");
            logChange(head.getId(), "UNFREEZE", before, after, op, "batch-unused");
            thawed++;
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("unfrozenCount", thawed);
        data.put("skipped", skipped);
        String msg = skipped.isEmpty()
                ? ("已解冻 " + thawed + " 个无引用码表")
                : ("已解冻 " + thawed + " 个；跳过：" + String.join("；", skipped));
        return Result.success(data, msg);
    }

    /**
     * 兼容旧「直接发布」：仅 DRAFT 可走；内部等同提交+通过（无中间校对）。
     * 新 UI 请用 submit-review / approve。
     */
    @Transactional
    public Result<?> publish(String code) {
        CrfCodelist form = resolveEditableOrLatest(code);
        if (form == null) {
            return Result.error("码表不存在");
        }
        String st = nullToEmpty(form.getStatus()).toUpperCase();
        if ("PENDING_REVIEW".equals(st)) {
            return approveReview(code, "publish-compat", "兼容 publish 接口");
        }
        if (!isEditable(form.getStatus())) {
            return Result.fail(400, "仅草稿可冻结，当前 " + form.getStatus() + "；请先新建版本");
        }
        Result<?> submitted = submitReview(code);
        if (!Boolean.TRUE.equals(submitted.getSuccess())) {
            return submitted;
        }
        return approveReview(code, "publish-compat", "兼容 publish 接口");
    }

    /**
     * 新建草稿版本：从最新 FROZEN（无则最新）克隆项与联动；已有草稿/待校对则 409。
     * 版号取当前活跃最小空缺（软删可补位）。
     */
    @Transactional
    public Result<Map<String, Object>> createDraftVersion(String code) {
        CrfCodelist existingOpen = findOpenVersion(code);
        if (existingOpen != null) {
            return Result.fail(409, "已有未发布版本 v" + existingOpen.getVersion()
                    + "（" + existingOpen.getStatus() + "），请先编辑、提交校对或冻结/驳回");
        }
        CrfCodelist source = null;
        for (CrfCodelist v : codelistMapper.listByCode(code)) {
            if (isPublished(v.getStatus())) {
                source = v;
                break;
            }
        }
        if (source == null) {
            source = codelistMapper.findByCode(code);
        }
        if (source == null) {
            return Result.error("码表不存在");
        }
        int next = NhpVersionAllocator.nextAvailable(codelistMapper.listActiveVersionsByCode(code));
        CrfCodelist neu = new CrfCodelist();
        neu.setCode(source.getCode());
        neu.setName(source.getName());
        neu.setFolder(source.getFolder());
        neu.setVersion(next);
        neu.setStatus("DRAFT");
        neu.setActive(true);
        // 补位到软删槽：复活同行，勿 INSERT（防 uk_crf_codelist_code_ver）
        neu = insertOrReactivateCodelist(neu);

        Map<Long, Long> itemIdMap = new HashMap<>();
        for (CrfCodelistItem old : itemMapper.listByCodelistId(source.getId())) {
            CrfCodelistItem copy = new CrfCodelistItem();
            copy.setCodelistId(neu.getId());
            copy.setItemCode(old.getItemCode());
            copy.setItemLabel(old.getItemLabel());
            copy.setSortOrder(old.getSortOrder());
            copy.setActive(old.getActive() == null || Boolean.TRUE.equals(old.getActive()));
            itemMapper.insert(copy);
            itemIdMap.put(old.getId(), copy.getId());
        }
        for (Map.Entry<Long, Long> e : itemIdMap.entrySet()) {
            for (CrfCodelistLink link : linkMapper.listByItemId(e.getKey())) {
                CrfCodelistLink nl = new CrfCodelistLink();
                nl.setItemId(e.getValue());
                nl.setChildCodelistId(link.getChildCodelistId());
                nl.setSortOrder(link.getSortOrder() == null ? 0 : link.getSortOrder());
                linkMapper.insert(nl);
            }
        }
        logChange(neu.getId(), "CREATE_DRAFT", source.getVersion(), neu.getVersion(), null, null);
        return detailById(neu.getId());
    }

    @Transactional
    public Result<CrfCodelistItem> addItem(String code, CrfCodelistItem item) {
        CrfCodelist cl = requireEditable(code);
        if (cl == null) {
            return Result.error("码表不存在或不可编辑（请新建版本后再改）");
        }
        if (item.getItemCode() == null || item.getItemCode().isBlank()) {
            return Result.fail(400, "itemCode 不能为空");
        }
        if (itemMapper.countByCodelistIdAndItemCode(cl.getId(), item.getItemCode()) > 0) {
            return Result.fail(400, "码表项 itemCode 已存在");
        }
        item.setCodelistId(cl.getId());
        if (item.getItemLabel() == null || item.getItemLabel().isBlank()) {
            item.setItemLabel(item.getItemCode());
        }
        if (item.getSortOrder() == null) {
            item.setSortOrder(0);
        }
        if (item.getActive() == null) {
            item.setActive(true);
        }
        itemMapper.insert(item);
        return Result.success(item);
    }

    @Transactional
    public Result<?> updateItem(String code, Long itemId, CrfCodelistItem patch) {
        CrfCodelist cl = requireEditable(code);
        if (cl == null) {
            return Result.error("码表不存在或不可编辑（请新建版本后再改）");
        }
        CrfCodelistItem item = itemMapper.findById(itemId);
        if (item == null || !cl.getId().equals(item.getCodelistId())) {
            return Result.error("码表项不存在");
        }
        if (patch.getItemLabel() != null) item.setItemLabel(patch.getItemLabel());
        if (patch.getSortOrder() != null) item.setSortOrder(patch.getSortOrder());
        if (patch.getActive() != null) item.setActive(patch.getActive());
        if (patch.getVerdict() != null) item.setVerdict(patch.getVerdict());
        if (patch.getVerdictNote() != null) item.setVerdictNote(patch.getVerdictNote());
        itemMapper.update(item);
        return Result.success(item);
    }

    /** 码表项审核列表（带 verdict）。 */
    public Result<List<Map<String, Object>>> listReviewItems(String code) {
        CrfCodelist cl = resolveEditableOrLatest(code);
        if (cl == null) {
            return Result.error("码表不存在");
        }
        List<Map<String, Object>> items = new ArrayList<>();
        for (CrfCodelistItem item : itemMapper.listByCodelistId(cl.getId())) {
            Map<String, Object> im = new LinkedHashMap<>();
            im.put("id", item.getId());
            im.put("itemCode", item.getItemCode());
            im.put("itemLabel", item.getItemLabel());
            im.put("verdict", item.getVerdict());
            im.put("verdictNote", item.getVerdictNote());
            items.add(im);
        }
        return Result.success(items);
    }

    /** 提交码表项 verdict（CONFIRM/MODIFY/DELETE/QUESTION）。 */
    @Transactional
    public Result<?> submitItemVerdict(String code, Long itemId, String verdict, String verdictNote) {
        CrfCodelist cl = resolveEditableOrLatest(code);
        if (cl == null) {
            return Result.error("码表不存在");
        }
        CrfCodelistItem item = itemMapper.findById(itemId);
        if (item == null || !cl.getId().equals(item.getCodelistId())) {
            return Result.error("码表项不存在");
        }
        if (verdict == null || verdict.isBlank()) {
            return Result.fail(400, "verdict 必填");
        }
        String v = verdict.trim().toUpperCase();
        if (!Set.of("CONFIRM", "MODIFY", "DELETE", "QUESTION").contains(v)) {
            return Result.fail(400, "verdict 须为 CONFIRM/MODIFY/DELETE/QUESTION");
        }
        item.setVerdict(v);
        item.setVerdictNote(verdictNote);
        itemMapper.update(item);
        return Result.success(null);
    }

    /**
     * 冻结码表（契约 alias）：若待校对则走 approve；草稿则兼容 publish。
     * 与既有 approve/publish 并存。
     */
    @Transactional
    public Result<?> freeze(String code, String operator) {
        CrfCodelist form = resolveEditableOrLatest(code);
        if (form == null) {
            return Result.error("码表不存在");
        }
        String st = nullToEmpty(form.getStatus()).toUpperCase();
        if ("PENDING_REVIEW".equals(st)) {
            return approveReview(code, operator, "freeze");
        }
        if ("DRAFT".equals(st) || "ACTIVE".equals(st)) {
            return publish(code);
        }
        if ("FROZEN".equals(st) || "PUBLISHED".equals(st)) {
            return Result.success(toListItem(form, loadRefCounts()));
        }
        return Result.fail(400, "当前状态不可冻结: " + form.getStatus());
    }

    @Transactional
    public Result<?> deleteItem(String code, Long itemId) {
        CrfCodelist cl = requireEditable(code);
        if (cl == null) {
            return Result.error("码表不存在或不可编辑（请新建版本后再改）");
        }
        CrfCodelistItem item = itemMapper.findById(itemId);
        if (item == null || !cl.getId().equals(item.getCodelistId())) {
            return Result.error("码表项不存在");
        }
        linkMapper.deleteByItemId(itemId);
        itemMapper.deleteById(itemId);
        return Result.success(null);
    }

    /**
     * Soft-delete one codelist version by primary key.
     * Blocked with 409 when fields still reference this version id（展示引用字段）.
     * 软删后版号不再占用，新建草稿可经 NhpVersionAllocator 补位。
     */
    @Transactional
    public Result<?> deleteVersion(Long id) {
        if (id == null) {
            return Result.fail(400, "id 不能为空");
        }
        CrfCodelist cl = codelistMapper.findById(id);
        if (cl == null || !Boolean.TRUE.equals(cl.getActive())) {
            return Result.error("码表版本不存在或已删除");
        }
        Result<?> blocked = rejectIfReferenced(cl);
        if (blocked != null) {
            return blocked;
        }
        softDeleteVersionRow(cl);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", cl.getId());
        data.put("code", cl.getCode());
        data.put("version", cl.getVersion());
        data.put("deleted", true);
        return Result.success(data);
    }

    /**
     * Soft-delete all active versions under a code（清理全部版本）.
     * Referenced versions are skipped and reported（与模板清理一致）.
     */
    @Transactional
    public Result<?> deleteCodelist(String code) {
        if (code == null || code.isBlank()) {
            return Result.fail(400, "code 不能为空");
        }
        List<CrfCodelist> rows = codelistMapper.listByCode(code.trim());
        if (rows == null || rows.isEmpty()) {
            return Result.error("码表不存在");
        }
        int deleted = 0;
        List<String> blocked = new ArrayList<>();
        for (CrfCodelist cl : new ArrayList<>(rows)) {
            Result<?> r = deleteVersion(cl.getId());
            if (Boolean.TRUE.equals(r.getSuccess())) {
                deleted++;
            } else {
                blocked.add("v" + cl.getVersion() + ": " + r.getMessage());
            }
        }
        if (deleted == 0) {
            return Result.fail(409, "无法删除「" + code.trim() + "」——" + String.join("；", blocked));
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("code", code.trim());
        data.put("deletedCount", deleted);
        data.put("blocked", blocked);
        String msg = blocked.isEmpty()
                ? ("已删除 " + deleted + " 个版本")
                : ("已删除 " + deleted + " 个版本；部分未删：" + String.join("；", blocked));
        data.put("message", msg);
        return Result.success(data);
    }

    private void softDeleteVersionRow(CrfCodelist cl) {
        linkMapper.deleteByParentCodelistId(cl.getId());
        linkMapper.deleteByChildCodelistId(cl.getId());
        itemMapper.deleteByCodelistId(cl.getId());
        codelistMapper.softDelete(cl.getId());
    }

    /**
     * 写入草稿行：若同 code+version 已有软删行则复活并清空项/联动，否则 INSERT。
     * 与 {@link NhpVersionAllocator} 补位配套，避免 DuplicateKey。
     */
    private CrfCodelist insertOrReactivateCodelist(CrfCodelist draft) {
        if (draft == null || draft.getCode() == null || draft.getVersion() == null) {
            throw new IllegalArgumentException("draft code/version 不能为空");
        }
        CrfCodelist any = codelistMapper.findAnyByCodeAndVersion(draft.getCode(), draft.getVersion());
        if (any != null) {
            if (Boolean.TRUE.equals(any.getActive())) {
                throw new IllegalStateException("版号 v" + draft.getVersion()
                        + " 仍被活跃行占用（code=" + draft.getCode() + "），无法补位写入");
            }
            any.setName(draft.getName());
            any.setFolder(draft.getFolder());
            any.setStatus(draft.getStatus() != null ? draft.getStatus() : "DRAFT");
            any.setActive(true);
            codelistMapper.reactivateAndUpdate(any);
            linkMapper.deleteByParentCodelistId(any.getId());
            linkMapper.deleteByChildCodelistId(any.getId());
            itemMapper.deleteByCodelistId(any.getId());
            return codelistMapper.findById(any.getId());
        }
        codelistMapper.insert(draft);
        return draft;
    }

    @Transactional
    public Result<CrfCodelistLink> addLink(String code, Long itemId, String childCodelistCode) {
        CrfCodelist cl = requireEditable(code);
        if (cl == null) {
            return Result.error("码表不存在或不可编辑（请新建版本后再改）");
        }
        CrfCodelistItem item = itemMapper.findById(itemId);
        if (item == null || !cl.getId().equals(item.getCodelistId())) {
            return Result.error("码表项不存在");
        }
        CrfCodelist child = latestPublishedOrAny(childCodelistCode);
        if (child == null || Boolean.FALSE.equals(child.getActive())) {
            return Result.error("子字典不存在: " + childCodelistCode);
        }
        CrfCodelistLink link = new CrfCodelistLink();
        link.setItemId(itemId);
        link.setChildCodelistId(child.getId());
        link.setSortOrder(0);
        linkMapper.insert(link);
        return Result.success(link);
    }

    @Transactional
    public Result<?> removeLink(String code, Long itemId, Long linkId) {
        CrfCodelist cl = requireEditable(code);
        if (cl == null) {
            return Result.error("码表不存在或不可编辑（请新建版本后再改）");
        }
        CrfCodelistLink link = linkMapper.findById(linkId);
        if (link == null || !itemId.equals(link.getItemId())) {
            return Result.error("联动不存在");
        }
        linkMapper.deleteById(linkId);
        return Result.success(null);
    }

    /** 便捷：按码表编码取最新已发布版全部项（供字段字典/模板选项渲染）。 */
    public List<CrfCodelistItem> itemsByCode(String code) {
        CrfCodelist cl = latestPublishedOrAny(code);
        if (cl == null || Boolean.FALSE.equals(cl.getActive())) {
            return List.of();
        }
        return itemMapper.listByCodelistId(cl.getId()).stream()
                .filter(i -> Boolean.TRUE.equals(i.getActive()))
                .collect(Collectors.toList());
    }

    private Map<String, Object> usageNodeForVersion(CrfCodelist cl) {
        Map<String, Object> node = toListItem(cl, loadRefCounts());
        List<Map<String, Object>> fieldsOut = new ArrayList<>();
        for (CrfField f : fieldMapper.listByCodelistId(cl.getId())) {
            fieldsOut.add(fieldUsageChain(f));
        }
        node.put("fields", fieldsOut);
        return node;
    }

    private Map<String, Object> fieldUsageChain(CrfField f) {
        Map<String, Object> fm = new LinkedHashMap<>();
        fm.put("fieldId", f.getId());
        fm.put("fieldCode", f.getFieldCode());
        fm.put("nameCn", f.getNameCn());
        fm.put("nameEn", f.getNameEn());
        fm.put("status", f.getStatus());
        fm.put("dictionaryId", f.getDictionaryId());
        String dictKey = null;
        String dictName = null;
        if (f.getDictionaryId() != null) {
            CrfFieldDictionary dict = dictionaryMapper.findById(f.getDictionaryId());
            if (dict != null) {
                dictKey = dict.getDictKey();
                dictName = dict.getName();
                fm.put("dictKey", dictKey);
                fm.put("dictName", dictName);
            }
        }
        List<Map<String, Object>> atoms = new ArrayList<>();
        Set<Long> seenAtom = new LinkedHashSet<>();
        if (f.getFieldCode() != null && !f.getFieldCode().isBlank()) {
            for (CrfTemplateField tf : templateFieldMapper.listByFieldKey(f.getFieldCode())) {
                if (tf.getFormId() == null || !seenAtom.add(tf.getFormId())) continue;
                CrfForm form = formMapper.findById(tf.getFormId());
                if (form == null || Boolean.FALSE.equals(form.getActive())) continue;
                String ft = form.getFormType() == null ? "" : form.getFormType().toUpperCase();
                if (!"DOMAIN".equals(ft) && !"MODULE".equals(ft)) {
                    // 组合模板也可能直接钉字段；仍列出
                }
                Map<String, Object> atom = new LinkedHashMap<>();
                atom.put("formId", form.getId());
                atom.put("formKey", form.getCode());
                atom.put("title", form.getName());
                atom.put("version", form.getVersion());
                atom.put("status", form.getStatus());
                atom.put("formType", form.getFormType());
                atom.put("kind", ("TEMPLATE".equals(ft) ? "COMPOSITE" : "ATOM"));
                if ("DOMAIN".equals(ft) || "MODULE".equals(ft)) {
                    atom.put("composites", compositesPinningAtom(form.getId()));
                } else {
                    atom.put("composites", List.of());
                }
                atoms.add(atom);
            }
        }
        fm.put("atoms", atoms);
        return fm;
    }

    private List<Map<String, Object>> compositesPinningAtom(Long atomFormId) {
        List<Map<String, Object>> out = new ArrayList<>();
        Set<Long> seen = new LinkedHashSet<>();
        for (CrfCompositeAtom ref : compositeAtomMapper.listByAtomFormId(atomFormId)) {
            if (ref.getCompositeFormId() == null || !seen.add(ref.getCompositeFormId())) continue;
            CrfForm c = formMapper.findById(ref.getCompositeFormId());
            if (c == null || Boolean.FALSE.equals(c.getActive())) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("formId", c.getId());
            m.put("formKey", c.getCode());
            m.put("title", c.getName());
            m.put("version", c.getVersion());
            m.put("status", c.getStatus());
            out.add(m);
        }
        return out;
    }

    /** 优先草稿；否则最新（含待校对）。 */
    private CrfCodelist resolveEditableOrLatest(String code) {
        if (code == null || code.isBlank()) return null;
        CrfCodelist open = findOpenVersion(code);
        if (open != null) return open;
        return codelistMapper.findByCode(code);
    }

    private CrfCodelist findOpenVersion(String code) {
        if (code == null || code.isBlank()) return null;
        for (CrfCodelist v : codelistMapper.listByCode(code)) {
            String s = nullToEmpty(v.getStatus()).toUpperCase();
            if ("DRAFT".equals(s) || "ACTIVE".equals(s) || "PENDING_REVIEW".equals(s)) {
                return v;
            }
        }
        return null;
    }

    private CrfCodelist requireEditable(String code) {
        CrfCodelist cl = resolveEditableOrLatest(code);
        if (cl == null) return null;
        if (!isEditable(cl.getStatus())) return null;
        return cl;
    }

    private CrfCodelist latestPublishedOrAny(String code) {
        if (code == null || code.isBlank()) return null;
        for (CrfCodelist v : codelistMapper.listByCode(code)) {
            if (isPublished(v.getStatus())) return v;
        }
        return codelistMapper.findByCode(code);
    }

    private static boolean isEditable(String status) {
        String s = status == null ? "" : status.toUpperCase();
        return "DRAFT".equals(s) || "ACTIVE".equals(s);
    }

    private static boolean isPublished(String status) {
        String s = status == null ? "" : status.toUpperCase();
        return "FROZEN".equals(s) || "PUBLISHED".equals(s);
    }

    private static boolean isArchived(String status) {
        String s = status == null ? "" : status.toUpperCase();
        return "ARCHIVED".equals(s);
    }

    private static String normalizeFolder(String folder) {
        if (folder == null) return null;
        String t = folder.trim();
        return t.isEmpty() ? null : t;
    }

    private Map<String, Object> buildDetail(CrfCodelist cl) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", cl.getId());
        out.put("code", cl.getCode());
        out.put("name", cl.getName());
        out.put("folder", cl.getFolder());
        out.put("version", cl.getVersion());
        out.put("status", cl.getStatus());
        out.put("refCount", fieldMapper.countByCodelistId(cl.getId()));
        out.put("editable", isEditable(cl.getStatus()));
        List<Map<String, Object>> items = new ArrayList<>();
        for (CrfCodelistItem item : itemMapper.listByCodelistId(cl.getId())) {
            Map<String, Object> im = new LinkedHashMap<>();
            im.put("id", item.getId());
            im.put("itemCode", item.getItemCode());
            im.put("itemLabel", item.getItemLabel());
            im.put("sortOrder", item.getSortOrder());
            im.put("verdict", item.getVerdict());
            im.put("verdictNote", item.getVerdictNote());
            List<Map<String, Object>> childLinks = new ArrayList<>();
            for (CrfCodelistLink link : linkMapper.listByItemId(item.getId())) {
                CrfCodelist child = codelistMapper.findById(link.getChildCodelistId());
                Map<String, Object> lm = new LinkedHashMap<>();
                lm.put("linkId", link.getId());
                lm.put("childCodelistId", link.getChildCodelistId());
                lm.put("childCodelistCode", child == null ? null : child.getCode());
                lm.put("childCodelistName", child == null ? null : child.getName());
                lm.put("childCodelistVersion", child == null ? null : child.getVersion());
                childLinks.add(lm);
            }
            im.put("childLinks", childLinks);
            items.add(im);
        }
        out.put("items", items);
        return out;
    }

    private Map<String, Object> toListItem(CrfCodelist cl, Map<Long, Integer> refCounts) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", cl.getId());
        m.put("code", cl.getCode());
        m.put("name", cl.getName());
        m.put("folder", cl.getFolder());
        m.put("version", cl.getVersion());
        m.put("status", cl.getStatus());
        m.put("refCount", refCounts.getOrDefault(cl.getId(), 0));
        m.put("editable", isEditable(cl.getStatus()));
        return m;
    }

    private Map<Long, Integer> loadRefCounts() {
        Map<Long, Integer> refCounts = new LinkedHashMap<>();
        for (Map<String, Object> row : fieldMapper.countRefsGrouped()) {
            Object idObj = row.get("codelistId");
            Object cntObj = row.get("cnt");
            if (idObj == null) continue;
            long id = idObj instanceof Number n ? n.longValue() : Long.parseLong(String.valueOf(idObj));
            int cnt = cntObj instanceof Number n ? n.intValue() : Integer.parseInt(String.valueOf(cntObj));
            refCounts.put(id, cnt);
        }
        return refCounts;
    }

    private Result<?> rejectIfReferenced(CrfCodelist cl) {
        List<CrfField> refs = fieldMapper.listByCodelistId(cl.getId());
        if (refs == null || refs.isEmpty()) {
            return null;
        }
        String names = refs.stream()
                .map(f -> {
                    String code = f.getFieldCode() == null ? "?" : f.getFieldCode();
                    String cn = f.getNameCn() == null ? "" : f.getNameCn().trim();
                    return cn.isEmpty() ? code : (cn + "(" + code + ")");
                })
                .collect(Collectors.joining("、"));
        return Result.fail(409, "该版本 v" + cl.getVersion() + " 仍被 " + refs.size()
                + " 个字段引用，无法删除。引用字段：" + names
                + "。请先在字段页改挂其它码表版本，或保留本版。");
    }

    private void logChange(Long entityId, String changeType, Object before, Object after,
                            String operator, String comment) {
        CrfDictChangeLog log = new CrfDictChangeLog();
        log.setEntity("codelist");
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
        if (o == null) return null;
        try {
            return objectMapper.writeValueAsString(o);
        } catch (Exception e) {
            return String.valueOf(o);
        }
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }

    private static String blankToUnknown(String operator) {
        return (operator == null || operator.isBlank()) ? "unknown" : operator.trim();
    }
}
