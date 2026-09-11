package com.example.demo.modules.cardprint.service;

import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.entity.CageInfoField;
import com.example.demo.modules.cageshelf.entity.CageInfoValue;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellIndexMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoFieldMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoValueMapper;
import com.example.demo.modules.cardprint.entity.CardPrintValueMap;
import com.example.demo.modules.cardprint.mapper.CardPrintValueMapMapper;
import com.alibaba.fastjson2.JSON;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 把一批 animalCageId 组装成卡牌数据行。
 * 表单值来自 cage_info_value（EAV），位置来自 cage_cell_index，特殊字段 __qr__/__position__ 单独拼装。
 * 全部走批量查询，不做逐条 N+1。
 */
@Service
public class CardDataAssembler {

    private final CageInfoFieldMapper fieldMapper;
    private final CageInfoValueMapper valueMapper;
    private final CageCellDetailMapper detailMapper;
    private final CageCellIndexMapper indexMapper;
    private final CardPrintValueMapMapper valueMapMapper;

    public CardDataAssembler(CageInfoFieldMapper fieldMapper,
                             CageInfoValueMapper valueMapper,
                             CageCellDetailMapper detailMapper,
                             CageCellIndexMapper indexMapper,
                             CardPrintValueMapMapper valueMapMapper) {
        this.fieldMapper = fieldMapper;
        this.valueMapper = valueMapper;
        this.detailMapper = detailMapper;
        this.indexMapper = indexMapper;
        this.valueMapMapper = valueMapMapper;
    }

    /** 按传入顺序返回每个笼位的数据行。 */
    public List<Map<String, Object>> assemble(List<Long> animalCageIds) {
        if (animalCageIds == null || animalCageIds.isEmpty()) return List.of();

        Map<Long, CageInfoField> fieldById = new HashMap<>();
        for (CageInfoField f : fieldMapper.selectPublished()) {
            if (f != null && f.getId() != null) fieldById.put(f.getId(), f);
        }

        Map<Long, Map<String, Object>> valuesByCage = new HashMap<>();
        for (CageInfoValue v : valueMapper.selectByAnimalCageIds(animalCageIds)) {
            if (v == null || v.getAnimalCageId() == null || v.getFieldId() == null) continue;
            CageInfoField f = fieldById.get(v.getFieldId());
            if (f == null || f.getCanonical() == null) continue;
            Object val = readValue(f, v);
            if (val == null) continue;
            valuesByCage.computeIfAbsent(v.getAnimalCageId(), k -> new LinkedHashMap<>())
                    .put(f.getCanonical(), val);
        }

        Map<Long, CageCellDetail> detailByCage = new HashMap<>();
        for (CageCellDetail d : detailMapper.selectByAnimalCageIds(animalCageIds)) {
            if (d != null && d.getAnimalCageId() != null) detailByCage.put(d.getAnimalCageId(), d);
        }

        Map<Long, Map<String, Object>> positionByCage = new HashMap<>();
        for (Map<String, Object> pos : indexMapper.lookupByAnimalCageIds(animalCageIds)) {
            Object id = pos == null ? null : pos.get("animalCageId");
            Long cageId = id == null ? null : Long.valueOf(String.valueOf(id));
            if (cageId != null) positionByCage.put(cageId, pos);
        }

        List<Map<String, Object>> rows = new ArrayList<>(animalCageIds.size());
        for (Long cageId : animalCageIds) {
            Map<String, Object> row = new LinkedHashMap<>(valuesByCage.getOrDefault(cageId, Map.of()));
            row.put(CardFieldDictionaryService.QR_FIELD, cageId == null ? "" : String.valueOf(cageId));
            row.put(CardFieldDictionaryService.POSITION_FIELD, positionLabel(positionByCage.get(cageId)));
            CageCellDetail d = detailByCage.get(cageId);
            if (d != null && d.getAupNumber() != null && !row.containsKey("aup_number")) {
                row.put("aup_number", d.getAupNumber());
            }
            rows.add(row);
        }
        applyValueMaps(rows);
        return rows;
    }

    /** 字段值映射：原值 → 简称。整表只查一次，逐行替换命中字段。 */
    private void applyValueMaps(List<Map<String, Object>> rows) {
        if (rows.isEmpty()) return;
        Map<String, Map<String, String>> maps = new HashMap<>();
        for (CardPrintValueMap m : valueMapMapper.selectAll()) {
            if (m == null || m.getCanonical() == null || m.getRawValue() == null || m.getShortValue() == null) continue;
            maps.computeIfAbsent(m.getCanonical(), k -> new HashMap<>()).put(m.getRawValue(), m.getShortValue());
        }
        if (maps.isEmpty()) return;
        for (Map<String, Object> row : rows) {
            for (Map.Entry<String, Map<String, String>> e : maps.entrySet()) {
                Object v = row.get(e.getKey());
                if (v == null) continue;
                String shortVal = e.getValue().get(String.valueOf(v));
                if (shortVal != null) row.put(e.getKey(), shortVal);
            }
        }
    }

    /** 位置串：「笼架名#坐标」。坐标 = 列字母(A..H) + '-' + 倒序行号(11-y)。shelveName 为空返回空串；x/y 任一为空只返回 shelveName。 */
    private String positionLabel(Map<String, Object> pos) {
        if (pos == null) return "";
        Object shelve = pos.get("shelveName");
        String shelveName = shelve == null ? "" : String.valueOf(shelve).trim();
        if (shelveName.isEmpty()) return "";
        Object px = pos.get("positionX");
        Object py = pos.get("positionY");
        if (px == null || py == null) return shelveName;
        try {
            int x = Integer.parseInt(String.valueOf(px).trim());
            int y = Integer.parseInt(String.valueOf(py).trim());
            return shelveName + "#" + (char) ('A' + x - 1) + "-" + (11 - y);
        } catch (NumberFormatException e) {
            return shelveName;
        }
    }

    /** 与 CageInfoValueService.valueColumn 对齐：STRING/ENUM/CALC 存 value_string，TEXT 存 value_text，ENUM_MULTI/FILE 存 value_json。 */
    private Object readValue(CageInfoField f, CageInfoValue v) {
        String dt = f.getDataType() == null ? "" : f.getDataType().trim().toUpperCase();
        return switch (dt) {
            case "INTEGER" -> v.getValueInt();
            case "BOOLEAN" -> v.getValueBool();
            case "DECIMAL" -> v.getValueDecimal();
            case "DATE" -> v.getValueDate();
            case "DATETIME" -> v.getValueDatetime();
            // 多值字段打印成顿号连接，不能把 JSON 数组原文印到卡上
            case "ENUM_MULTI" -> multiText(v.getValueJson());
            case "FILE" -> v.getValueJson();
            default -> v.getValueString() != null ? v.getValueString() : v.getValueText();
        };
    }

    private static Object multiText(String json) {
        if (json == null || json.isBlank()) return null;
        String t = json.trim();
        if (!t.startsWith("[")) return t;
        try {
            List<String> parts = new ArrayList<>();
            for (Object o : JSON.parseArray(t)) if (o != null) parts.add(String.valueOf(o));
            return String.join("、", parts);
        } catch (Exception e) {
            return t;
        }
    }
}
