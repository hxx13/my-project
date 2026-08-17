package com.example.demo.modules.aup.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.aup.dto.*;
import com.example.demo.modules.aup.entity.Dict;
import com.example.demo.modules.aup.entity.DictItem;
import com.example.demo.modules.aup.mapper.DictItemMapper;
import com.example.demo.modules.aup.mapper.DictMapper;
import com.example.demo.modules.aup.mapper.FormFieldMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** AUP 公共字典：CRUD + 字典项排序 + 删字典前校验无字段引用。 */
@Service
public class AupDictService {

    private final DictMapper dictMapper;
    private final DictItemMapper dictItemMapper;
    private final FormFieldMapper fieldMapper;

    public AupDictService(DictMapper dictMapper, DictItemMapper dictItemMapper, FormFieldMapper fieldMapper) {
        this.dictMapper = dictMapper;
        this.dictItemMapper = dictItemMapper;
        this.fieldMapper = fieldMapper;
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

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
