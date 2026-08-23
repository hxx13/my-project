package com.example.demo.modules.cageshelf.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.cageshelf.entity.CageInfoCodelist;
import com.example.demo.modules.cageshelf.entity.CageInfoCodelistItem;
import com.example.demo.modules.cageshelf.mapper.CageInfoCodelistItemMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoCodelistMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoFieldMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 笼位域码表 CRUD（cage_info_codelist / cage_info_codelist_item）。
 * 与 NHP crf_codelist 完全隔离。
 */
@Service
public class CageInfoCodelistService {

    private static final int MAX_FOLDER_LEN = 64;

    private final CageInfoCodelistMapper codelistMapper;
    private final CageInfoCodelistItemMapper itemMapper;
    private final CageInfoFieldMapper fieldMapper;

    public CageInfoCodelistService(CageInfoCodelistMapper codelistMapper,
                                   CageInfoCodelistItemMapper itemMapper,
                                   CageInfoFieldMapper fieldMapper) {
        this.codelistMapper = codelistMapper;
        this.itemMapper = itemMapper;
        this.fieldMapper = fieldMapper;
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
        m.put("items", items.stream().map(this::toItemMap).toList());
        return m;
    }

    @Transactional
    public Map<String, Object> create(Map<String, Object> body) {
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
        codelistMapper.insert(row);
        return detail(code);
    }

    @Transactional
    public Map<String, Object> updateMeta(String code, Map<String, Object> body) {
        CageInfoCodelist cl = requireByCode(code);
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
        return detail(code);
    }

    @Transactional
    public void delete(String code) {
        CageInfoCodelist cl = requireByCode(code);
        int refCount = fieldMapper.countByDictKey(code);
        if (refCount > 0) {
            throw new TwinBusinessException(409, "码表「" + code + "」仍被 " + refCount + " 个字段引用，无法删除");
        }
        itemMapper.deleteByCodelistId(cl.getId());
        codelistMapper.deleteById(cl.getId());
    }

    @Transactional
    public Map<String, Object> addItem(String code, Map<String, Object> body) {
        CageInfoCodelist cl = requireByCode(code);
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
        return toItemMap(item);
    }

    @Transactional
    public void updateItem(String code, Long itemId, Map<String, Object> body) {
        CageInfoCodelist cl = requireByCode(code);
        CageInfoCodelistItem item = requireItem(cl.getId(), itemId);
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
    }

    @Transactional
    public void deleteItem(String code, Long itemId) {
        CageInfoCodelist cl = requireByCode(code);
        CageInfoCodelistItem item = requireItem(cl.getId(), itemId);
        itemMapper.deleteById(item.getId());
    }

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
        return m;
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
