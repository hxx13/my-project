package com.example.demo.modules.cageshelf.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.cageshelf.entity.CageInfoField;
import com.example.demo.modules.cageshelf.mapper.CageInfoFieldMapper;
import com.example.demo.modules.nhp.entity.CrfCodelist;
import com.example.demo.modules.nhp.entity.CrfCodelistItem;
import com.example.demo.modules.nhp.mapper.CrfCodelistItemMapper;
import com.example.demo.modules.nhp.mapper.CrfCodelistMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 笼位字段字典 CRUD + 发布 + 码表列表。
 * 系统同步字段（syncSource 非空，由 ARO 映射播种）不可删除；自定义字段（syncSource 为空）可增删改。
 */
@Service
public class CageInfoFieldService {

    private static final Set<String> DATA_TYPES = Set.of("number", "text", "boolean");

    private final CageInfoFieldMapper fieldMapper;
    private final CrfCodelistMapper codelistMapper;
    private final CrfCodelistItemMapper codelistItemMapper;

    public CageInfoFieldService(CageInfoFieldMapper fieldMapper,
                                CrfCodelistMapper codelistMapper,
                                CrfCodelistItemMapper codelistItemMapper) {
        this.fieldMapper = fieldMapper;
        this.codelistMapper = codelistMapper;
        this.codelistItemMapper = codelistItemMapper;
    }

    /** 全部字段（含自定义 + 系统同步），按 sort, id 升序。 */
    public List<CageInfoField> listAll() {
        return fieldMapper.selectAll();
    }

    /** 已发布字段。 */
    public List<CageInfoField> listPublished() {
        return fieldMapper.selectPublished();
    }

    /** 新建自定义字段：published=false、syncSource=null、role=VALUE。canonical 唯一必填。 */
    @Transactional
    public CageInfoField create(Map<String, Object> body) {
        String canonical = str(body, "canonical");
        String label = str(body, "label");
        String dataType = str(body, "dataType");
        String dictKey = str(body, "dictKey");
        String required = str(body, "required");
        Integer sort = toInt(body == null ? null : body.get("sort"));

        if (canonical == null || canonical.isBlank()) {
            throw new TwinBusinessException(400, "canonical 必填（字段规范名）");
        }
        if (label == null || label.isBlank()) {
            throw new TwinBusinessException(400, "label 必填（中文显示名）");
        }
        if (dataType == null || dataType.isBlank()) {
            throw new TwinBusinessException(400, "dataType 必填（number/text/boolean）");
        }
        if (!DATA_TYPES.contains(dataType)) {
            throw new TwinBusinessException(400, "dataType 必须为 number/text/boolean");
        }
        if (fieldMapper.selectByCanonical(canonical) != null) {
            throw new TwinBusinessException(409, "字段「" + canonical + "」已存在");
        }

        CageInfoField f = new CageInfoField();
        f.setCanonical(canonical);
        f.setLabel(label);
        f.setDataType(dataType);
        f.setDictKey(blankToNull(dictKey));
        f.setRequired(required == null || required.isBlank() ? "NO" : required);
        f.setSort(sort);
        f.setRole("VALUE");
        f.setSyncSource(null);
        f.setPublished(false);
        fieldMapper.insert(f);
        return f;
    }

    /** 更新可编辑字段：label/dataType/dictKey/required/sort/showWhen；不动 canonical/syncSource/published。 */
    @Transactional
    public CageInfoField update(Long id, Map<String, Object> body) {
        if (id == null) {
            throw new TwinBusinessException(400, "id 不能为空");
        }
        CageInfoField f = fieldMapper.selectById(id);
        if (f == null) {
            throw new TwinBusinessException(404, "字段不存在");
        }
        if (body == null) {
            return f;
        }

        if (body.containsKey("label")) {
            String label = str(body, "label");
            if (label == null || label.isBlank()) {
                throw new TwinBusinessException(400, "label 不能为空");
            }
            f.setLabel(label);
        }
        if (body.containsKey("dataType")) {
            String dataType = str(body, "dataType");
            if (dataType == null || dataType.isBlank()) {
                throw new TwinBusinessException(400, "dataType 不能为空");
            }
            if (!DATA_TYPES.contains(dataType)) {
                throw new TwinBusinessException(400, "dataType 必须为 number/text/boolean");
            }
            f.setDataType(dataType);
        }
        if (body.containsKey("dictKey")) {
            f.setDictKey(blankToNull(str(body, "dictKey")));
        }
        if (body.containsKey("required")) {
            String required = str(body, "required");
            f.setRequired(required == null || required.isBlank() ? "NO" : required);
        }
        if (body.containsKey("sort")) {
            f.setSort(toInt(body.get("sort")));
        }
        if (body.containsKey("showWhen")) {
            f.setShowWhen(blankToNull(str(body, "showWhen")));
        }
        fieldMapper.update(f);
        return f;
    }

    /** 删除：仅自定义字段（syncSource 为空）；系统同步字段不可删除。 */
    @Transactional
    public void delete(Long id) {
        if (id == null) {
            throw new TwinBusinessException(400, "id 不能为空");
        }
        CageInfoField f = fieldMapper.selectById(id);
        if (f == null) {
            throw new TwinBusinessException(404, "字段不存在");
        }
        if (f.getSyncSource() != null && !f.getSyncSource().isBlank()) {
            throw new TwinBusinessException(400, "系统同步字段不可删除");
        }
        fieldMapper.deleteById(id);
    }

    /** 发布：指定 id 列表发布；空/null 则发布全部。返回受影响行数。 */
    @Transactional
    public int publish(List<Long> fieldIds) {
        if (fieldIds == null || fieldIds.isEmpty()) {
            return fieldMapper.markAllPublished();
        }
        return fieldMapper.markPublishedByIds(fieldIds);
    }

    /** 可用码表列表（dict_key 选择器）：每 code 取最新活跃版本，含 itemCount。 */
    public List<Map<String, Object>> listCodelists() {
        Map<String, CrfCodelist> heads = new LinkedHashMap<>();
        List<CrfCodelist> all = codelistMapper.list();
        if (all != null) {
            for (CrfCodelist cl : all) {
                if (cl == null || !Boolean.TRUE.equals(cl.getActive()) || cl.getCode() == null) {
                    continue;
                }
                // list() 已按 code, version DESC 排序，putIfAbsent 保留每 code 最新版
                heads.putIfAbsent(cl.getCode(), cl);
            }
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (CrfCodelist cl : heads.values()) {
            int itemCount = 0;
            List<CrfCodelistItem> items = codelistItemMapper.listByCodelistId(cl.getId());
            if (items != null) {
                itemCount = (int) items.stream()
                        .filter(i -> i.getActive() == null || i.getActive())
                        .count();
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", cl.getId());
            m.put("code", cl.getCode());
            m.put("name", cl.getName());
            m.put("itemCount", itemCount);
            out.add(m);
        }
        return out;
    }

    private static String str(Map<String, Object> m, String k) {
        if (m == null) return null;
        Object v = m.get(k);
        return v == null ? null : String.valueOf(v).trim();
    }

    private static String blankToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
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
