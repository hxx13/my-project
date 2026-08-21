package com.example.demo.modules.aup.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.aup.dto.*;
import com.example.demo.modules.aup.entity.Dict;
import com.example.demo.modules.aup.entity.DictItem;
import com.example.demo.modules.aup.mapper.DictItemMapper;
import com.example.demo.modules.aup.mapper.DictMapper;
import com.example.demo.modules.aup.mapper.FormFieldMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** AUP 公共字典：CRUD + 字典项排序 + 删字典前校验无字段引用 + 内置种子字典导入。 */
@Service
public class AupDictService {

    private static final Logger log = LoggerFactory.getLogger(AupDictService.class);
    private static final String BUILTIN_DICT_RESOURCE = "db/default-aup-dict.json";

    private final DictMapper dictMapper;
    private final DictItemMapper dictItemMapper;
    private final FormFieldMapper fieldMapper;
    private final ObjectMapper objectMapper;

    public AupDictService(DictMapper dictMapper, DictItemMapper dictItemMapper, FormFieldMapper fieldMapper,
                          ObjectMapper objectMapper) {
        this.dictMapper = dictMapper;
        this.dictItemMapper = dictItemMapper;
        this.fieldMapper = fieldMapper;
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> listDicts(String keyword, String category, int page, int size) {
        int offset = (page - 1) * size;
        String cat = trimToNull(category);
        List<Dict> list = dictMapper.listByKeyword(keyword, cat, size, offset);
        int total = dictMapper.countByKeyword(keyword, cat);
        List<DictListItemVO> items = list.stream().map(d -> {
            DictListItemVO v = new DictListItemVO();
            v.setDictKey(d.getDictKey());
            v.setName(d.getName());
            v.setCategory(d.getCategory());
            v.setItemCount(dictItemMapper.countByDictId(d.getId()));
            return v;
        }).collect(Collectors.toList());
        Map<String, Object> result = new HashMap<>();
        result.put("total", total);
        result.put("items", items);
        return result;
    }

    @Transactional
    public Result<DictDetailVO> createDict(DictCreateRequest req) {
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
        dictMapper.insert(d);

        DictDetailVO vo = new DictDetailVO();
        vo.setDictKey(d.getDictKey());
        vo.setName(d.getName());
        vo.setCategory(d.getCategory());
        vo.setItems(List.of());
        return Result.success(vo);
    }

    public DictDetailVO getDict(String dictKey) {
        Dict d = dictMapper.findByKey(dictKey);
        if (d == null) {
            return null;
        }
        DictDetailVO vo = new DictDetailVO();
        vo.setDictKey(d.getDictKey());
        vo.setName(d.getName());
        vo.setCategory(d.getCategory());
        vo.setItems(dictItemMapper.listByDictId(d.getId()).stream()
                .map(this::toItemVO).collect(Collectors.toList()));
        return vo;
    }

    @Transactional
    public Result<?> renameDict(String dictKey, DictRenameRequest req) {
        Dict d = dictMapper.findByKey(dictKey);
        if (d == null) {
            return Result.error("字典不存在");
        }
        if (req.getName() != null && !req.getName().isBlank()) {
            d.setName(req.getName().trim());
        }
        if (req.getCategory() != null) {
            d.setCategory(trimToNull(req.getCategory()));
        }
        if (req.getName() != null || req.getCategory() != null) {
            dictMapper.update(d);
        }
        return Result.success(null);
    }

    @Transactional
    public Result<?> deleteDict(String dictKey) {
        Dict d = dictMapper.findByKey(dictKey);
        if (d == null) {
            return Result.error("字典不存在");
        }
        int refs = fieldMapper.countByDictKey(dictKey);
        if (refs > 0) {
            return Result.fail(400, "该字典被 " + refs + " 个字段引用，无法删除");
        }
        dictItemMapper.deleteByDictId(d.getId());
        dictMapper.deleteById(d.getId());
        return Result.success(null);
    }

    @Transactional
    public Result<DictItemVO> addItem(String dictKey, DictItemCreateRequest req) {
        Dict d = dictMapper.findByKey(dictKey);
        if (d == null) {
            return Result.error("字典不存在");
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
        return Result.success(toItemVO(item));
    }

    @Transactional
    public Result<?> updateItem(String dictKey, Long itemId, DictItemUpdateRequest req) {
        Dict d = dictMapper.findByKey(dictKey);
        if (d == null) {
            return Result.error("字典不存在");
        }
        DictItem item = dictItemMapper.findById(itemId);
        if (item == null || !d.getId().equals(item.getDictId())) {
            return Result.error("字典项不存在");
        }
        if (req.getValue() != null && !req.getValue().isBlank()) {
            String value = req.getValue().trim();
            if (dictItemMapper.countByDictIdAndValueExclude(d.getId(), value, itemId) > 0) {
                return Result.fail(400, "字典项 value 已存在");
            }
            item.setValue(value);
        }
        if (req.getLabel() != null) {
            item.setLabel(req.getLabel().trim());
        }
        dictItemMapper.update(item);
        return Result.success(null);
    }

    @Transactional
    public Result<?> deleteItem(String dictKey, Long itemId) {
        Dict d = dictMapper.findByKey(dictKey);
        if (d == null) {
            return Result.error("字典不存在");
        }
        DictItem item = dictItemMapper.findById(itemId);
        if (item == null || !d.getId().equals(item.getDictId())) {
            return Result.error("字典项不存在");
        }
        dictItemMapper.deleteById(itemId);
        return Result.success(null);
    }

    @Transactional
    public Result<?> reorderItems(String dictKey, List<Long> itemIds) {
        Dict d = dictMapper.findByKey(dictKey);
        if (d == null) {
            return Result.error("字典不存在");
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
        return Result.success(null);
    }

    /**
     * 导入内置种子字典（db/default-aup-dict.json）。
     * 幂等：字典按 dictKey、字典项按 value 去重，已存在则不覆盖，只补充缺失项。
     * 返回本次新建的字典数与字典项数。
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
                dictMapper.insert(d);
                createdDicts++;
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
            }
        }
        Map<String, Object> out = new HashMap<>();
        out.put("createdDicts", createdDicts);
        out.put("createdItems", createdItems);
        return out;
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

    private DictItemVO toItemVO(DictItem item) {
        DictItemVO vo = new DictItemVO();
        vo.setItemId(item.getId());
        vo.setValue(item.getValue());
        vo.setLabel(item.getLabel());
        vo.setSortOrder(item.getSortOrder());
        return vo;
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

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
