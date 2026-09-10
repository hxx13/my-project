package com.example.demo.modules.cardprint.service;

import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.entity.CageInfoField;
import com.example.demo.modules.cageshelf.entity.CageInfoValue;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellIndexMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoFieldMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoValueMapper;
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

    public CardDataAssembler(CageInfoFieldMapper fieldMapper,
                             CageInfoValueMapper valueMapper,
                             CageCellDetailMapper detailMapper,
                             CageCellIndexMapper indexMapper) {
        this.fieldMapper = fieldMapper;
        this.valueMapper = valueMapper;
        this.detailMapper = detailMapper;
        this.indexMapper = indexMapper;
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
        return rows;
    }

    /** 位置串：「房间名 笼架名 坐标」，坐标格式与 /api/v1/scan/lookup 的 positionLabel 一致（X-Y）。 */
    private String positionLabel(Map<String, Object> pos) {
        if (pos == null) return "";
        StringBuilder sb = new StringBuilder();
        Object room = pos.get("roomName");
        if (room != null && !String.valueOf(room).isBlank()) sb.append(room).append(' ');
        Object shelve = pos.get("shelveName");
        if (shelve != null && !String.valueOf(shelve).isBlank()) sb.append(shelve).append(' ');
        Object px = pos.get("positionX");
        Object py = pos.get("positionY");
        if (px != null && py != null) sb.append(px).append('-').append(py);
        return sb.toString().trim();
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
