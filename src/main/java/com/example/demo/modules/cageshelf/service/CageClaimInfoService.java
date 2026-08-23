package com.example.demo.modules.cageshelf.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.entity.CageClaim;
import com.example.demo.modules.cageshelf.entity.CageClaimInfoValue;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageClaimInfoValueMapper;
import com.example.demo.modules.nhp.entity.CrfField;
import com.example.demo.modules.nhp.entity.CrfFieldDictionary;
import com.example.demo.modules.nhp.mapper.CrfFieldDictionaryMapper;
import com.example.demo.modules.nhp.mapper.CrfFieldMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 认领表单实例服务 — 认领/分配建立时从笼位详情（CageCellDetail）同步交接一批 SYNC 种子值。
 * 字段字典读 NHP crf_field 的「cage」数据域套（dictKey="cage"），字段身份 = crf_field.id，
 * 值表 cage_claim_info_value.field_id 引用 crf_field.id。
 */
@Service
public class CageClaimInfoService {

    private static final String COL_INT = "value_int";
    private static final String COL_TEXT = "value_text";
    private static final String COL_BOOL = "value_bool";

    /** cage 字段字典套稳定键 */
    private static final String CAGE_DICT_KEY = "cage";

    private final CageCellDetailMapper detailMapper;
    private final CrfFieldDictionaryMapper fieldDictionaryMapper;
    private final CrfFieldMapper fieldMapper;
    private final CageClaimInfoValueMapper valueMapper;

    public CageClaimInfoService(CageCellDetailMapper detailMapper,
                                CrfFieldDictionaryMapper fieldDictionaryMapper,
                                CrfFieldMapper fieldMapper,
                                CageClaimInfoValueMapper valueMapper) {
        this.detailMapper = detailMapper;
        this.fieldDictionaryMapper = fieldDictionaryMapper;
        this.fieldMapper = fieldMapper;
        this.valueMapper = valueMapper;
    }

    /** 解析 cage 字典套 id；未建套（或已软删）返回 null。 */
    private Long cageDictId() {
        CrfFieldDictionary dict = fieldDictionaryMapper.findByDictKey(CAGE_DICT_KEY);
        if (dict == null || !Boolean.TRUE.equals(dict.getActive())) {
            return null;
        }
        return dict.getId();
    }

    /** 载入 cage 数据域套下全部字段（活跃行，按 field_code 稳定排序）；字典缺失时返回空表。 */
    private List<CrfField> cageFields() {
        Long dictId = cageDictId();
        if (dictId == null) {
            return List.of();
        }
        List<CrfField> fields = fieldMapper.listByDictionary(dictId);
        return fields == null ? List.of() : fields;
    }

    /**
     * crf_field.data_type（NHP 精确值 INTEGER/TEXT/BOOLEAN…）→ 值表列名（number/text/boolean）。
     * 与 {@link #valueColumn(String)} 的读写事实源对齐；未知类型返回 null。
     */
    private String columnType(CrfField field) {
        String dt = field == null ? null : field.getDataType();
        if (dt == null) return null;
        return switch (dt.trim().toUpperCase()) {
            case "INTEGER" -> "number";
            case "BOOLEAN" -> "boolean";
            case "STRING", "TEXT" -> "text";
            default -> null;
        };
    }

    /**
     * 认领/分配建立时，从笼位详情同步交接表单值（fill_source = SYNC）。
     * 详情不存在或字段字典缺失对应 canonical 时跳过；空值（null / 空白字符串）不落行。
     */
    public void seedFromDetail(CageClaim claim) {
        if (claim == null || claim.getAnimalCageId() == null) {
            return;
        }
        CageCellDetail detail = detailMapper.selectByAnimalCageId(claim.getAnimalCageId());
        if (detail == null) {
            return;
        }

        List<CrfField> fields = cageFields();
        Map<String, Long> fieldIdByCanonical = new HashMap<>();
        for (CrfField f : fields) {
            if (f != null && f.getFieldCode() != null && f.getId() != null) {
                fieldIdByCanonical.put(f.getFieldCode(), f.getId());
            }
        }

        Long claimId = claim.getId();

        // 数值字段 → value_int
        upsertInt(claimId, fieldIdByCanonical, "cage_type_code", detail.getCageTypeCode());
        upsertInt(claimId, fieldIdByCanonical, "state", detail.getState());
        upsertInt(claimId, fieldIdByCanonical, "rent_type", detail.getRentType());
        upsertInt(claimId, fieldIdByCanonical, "animal_male_number", detail.getAnimalMaleNumber());
        upsertInt(claimId, fieldIdByCanonical, "animal_female_number", detail.getAnimalFemaleNumber());

        // 布尔字段 → value_bool
        upsertBool(claimId, fieldIdByCanonical, "needs_division", detail.getNeedsDivision());
        upsertBool(claimId, fieldIdByCanonical, "needs_special_feeding", detail.getNeedsSpecialFeeding());
        upsertBool(claimId, fieldIdByCanonical, "needs_transfer", detail.getNeedsTransfer());
        upsertBool(claimId, fieldIdByCanonical, "has_health_abnormality", detail.getHasHealthAbnormality());

        // 文本字段 → value_text
        upsertText(claimId, fieldIdByCanonical, "state_label", detail.getStateLabel());
        upsertText(claimId, fieldIdByCanonical, "cage_name", detail.getCageName());
        upsertText(claimId, fieldIdByCanonical, "cage_box_code", detail.getCageBoxCode());
        upsertText(claimId, fieldIdByCanonical, "cage_box_name", detail.getCageBoxName());
        upsertText(claimId, fieldIdByCanonical, "pi_name", detail.getPiName());
        upsertText(claimId, fieldIdByCanonical, "project_pi_name", detail.getProjectPiName());
        upsertText(claimId, fieldIdByCanonical, "project_name", detail.getProjectName());
        upsertText(claimId, fieldIdByCanonical, "department_name", detail.getDepartmentName());
        upsertText(claimId, fieldIdByCanonical, "aup_number", detail.getAupNumber());
        upsertText(claimId, fieldIdByCanonical, "cohabitation_date", detail.getCohabitationDate());
        upsertText(claimId, fieldIdByCanonical, "special_breeding_name", detail.getSpecialBreedingName());
        upsertText(claimId, fieldIdByCanonical, "special_breeding_desc", detail.getSpecialBreedingDesc());
        upsertText(claimId, fieldIdByCanonical, "experimenter_name", detail.getExperimenterName());
        upsertText(claimId, fieldIdByCanonical, "lab_assistant_name", detail.getLabAssistantName());
        upsertText(claimId, fieldIdByCanonical, "animal_strain_name", detail.getAnimalStrainName());
        upsertText(claimId, fieldIdByCanonical, "animal_sex", detail.getAnimalSex());
        upsertText(claimId, fieldIdByCanonical, "animal_week_age", detail.getAnimalWeekAge());
        upsertText(claimId, fieldIdByCanonical, "animal_come_from", detail.getAnimalComeFrom());
    }

    // ── 分笼继承（D2） ──

    /**
     * 从母笼认领派生子笼认领的表单值：整表复制母笼值（fill_source 统一标记 INHERIT），
     * 再清空「需重填」字段（animal_male_number / animal_female_number / animal_sex），
     * 交由学生在新笼位上重新填写数量与性别。
     */
    @Transactional
    public void deriveInherited(Long motherClaimId, Long childClaimId) {
        valueMapper.batchCopy(motherClaimId, childClaimId);
        valueMapper.updateFillSource(childClaimId, "INHERIT");

        Long dictId = cageDictId();
        List<Long> refillFieldIds = new ArrayList<>();
        for (String canonical : new String[]{"animal_male_number", "animal_female_number", "animal_sex"}) {
            CrfField f = dictId == null ? null : fieldMapper.findByFieldCodeInDict(dictId, canonical);
            if (f != null && f.getId() != null) {
                refillFieldIds.add(f.getId());
            }
        }
        if (!refillFieldIds.isEmpty()) {
            valueMapper.deleteByFieldIds(childClaimId, refillFieldIds);
        }
    }

    private void upsertInt(Long claimId, Map<String, Long> fieldIdByCanonical, String canonical, Integer value) {
        if (value == null) {
            return;
        }
        Long fieldId = fieldIdByCanonical.get(canonical);
        if (fieldId == null) {
            return;
        }
        CageClaimInfoValue v = new CageClaimInfoValue();
        v.setClaimId(claimId);
        v.setFieldId(fieldId);
        v.setValueInt(Long.valueOf(value));
        v.setFillSource("SYNC");
        valueMapper.upsert(v);
    }

    private void upsertBool(Long claimId, Map<String, Long> fieldIdByCanonical, String canonical, Boolean value) {
        if (value == null) {
            return;
        }
        Long fieldId = fieldIdByCanonical.get(canonical);
        if (fieldId == null) {
            return;
        }
        CageClaimInfoValue v = new CageClaimInfoValue();
        v.setClaimId(claimId);
        v.setFieldId(fieldId);
        v.setValueBool(value);
        v.setFillSource("SYNC");
        valueMapper.upsert(v);
    }

    private void upsertText(Long claimId, Map<String, Long> fieldIdByCanonical, String canonical, String value) {
        if (value == null || value.isBlank()) {
            return;
        }
        Long fieldId = fieldIdByCanonical.get(canonical);
        if (fieldId == null) {
            return;
        }
        CageClaimInfoValue v = new CageClaimInfoValue();
        v.setClaimId(claimId);
        v.setFieldId(fieldId);
        v.setValueText(value);
        v.setFillSource("SYNC");
        valueMapper.upsert(v);
    }

    // ── 信息读写（A4） ──

    /** data_type → value 列名（读写唯一事实源）；未知类型返回 null */
    private String valueColumn(String dataType) {
        if (dataType == null) return null;
        return switch (dataType.trim().toLowerCase()) {
            case "number" -> COL_INT;
            case "text" -> COL_TEXT;
            case "boolean" -> COL_BOOL;
            default -> null;
        };
    }

    /**
     * 读取某个认领的全部信息字段（按字典稳定序排序），每个字段挂上该认领的实例值。
     * 未填写字段 value 为 null、fillSource 为 null，但仍返回行（供表单渲染）。
     */
    public List<Map<String, Object>> getInfo(Long claimId) {
        List<CrfField> fields = cageFields();
        List<CageClaimInfoValue> values = valueMapper.selectByClaimId(claimId);
        Map<Long, CageClaimInfoValue> valueByFieldId = new HashMap<>();
        for (CageClaimInfoValue v : values) {
            if (v != null && v.getFieldId() != null) {
                valueByFieldId.put(v.getFieldId(), v);
            }
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (CrfField f : fields) {
            if (f == null || f.getId() == null) continue;
            CageClaimInfoValue v = valueByFieldId.get(f.getId());
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("fieldId", f.getId());
            row.put("canonical", f.getFieldCode());
            row.put("label", f.getNameCn());
            row.put("dataType", columnType(f));
            row.put("required", f.getRequired());
            row.put("sort", f.getId());
            row.put("value", readValue(f, v));
            row.put("fillSource", v == null ? null : v.getFillSource());
            result.add(row);
        }
        return result;
    }

    /**
     * 保存某认领的信息值。每个 entry：{ fieldId: Long, value: string|number|boolean }。
     * 按字段 data_type 落到对应值列，fill_source = MANUAL，键冲突时幂等 upsert。
     * 校验失败抛 TwinBusinessException(400)。
     */
    @Transactional
    public List<Map<String, Object>> updateInfo(Long claimId, List<Map<String, Object>> entries) {
        List<CrfField> fields = cageFields();
        Map<Long, CrfField> fieldById = new HashMap<>();
        for (CrfField f : fields) {
            if (f != null && f.getId() != null) {
                fieldById.put(f.getId(), f);
            }
        }

        for (Map<String, Object> entry : entries) {
            if (entry == null) continue;
            Long fieldId = toLong(entry.get("fieldId"));
            if (fieldId == null) throw new TwinBusinessException(400, "fieldId 必填");
            CrfField field = fieldById.get(fieldId);
            if (field == null) throw new TwinBusinessException(400, "字段不存在: " + fieldId);
            String col = valueColumn(columnType(field));
            if (col == null) throw new TwinBusinessException(400, "字段类型不支持: " + field.getDataType());

            CageClaimInfoValue v = new CageClaimInfoValue();
            v.setClaimId(claimId);
            v.setFieldId(fieldId);
            boolean applied = applyValue(v, col, field, entry.get("value"));
            if (applied) {
                v.setFillSource("MANUAL");
                valueMapper.upsert(v);
            }
        }
        return getInfo(claimId);
    }

    private Object readValue(CrfField field, CageClaimInfoValue v) {
        if (v == null) return null;
        String col = valueColumn(columnType(field));
        if (col == null) return null;
        return switch (col) {
            case COL_INT -> v.getValueInt();
            case COL_BOOL -> v.getValueBool();
            case COL_TEXT -> v.getValueText();
            default -> null;
        };
    }

    /**
     * 把 raw 落到 v 的对应值列。value=null 表示「清除该字段」，直接删行并返回 false；
     * 否则返回 true 表示需要 upsert。类型不匹配抛 TwinBusinessException(400)。
     */
    private boolean applyValue(CageClaimInfoValue v, String col, CrfField field, Object raw) {
        if (raw == null) {
            valueMapper.deleteByClaimAndField(v.getClaimId(), v.getFieldId());
            return false;
        }
        switch (col) {
            case COL_INT -> {
                if (!(raw instanceof Number n)) {
                    throw new TwinBusinessException(400, "字段 " + field.getFieldCode() + " 需要数字类型");
                }
                if ((n instanceof Double || n instanceof Float || n instanceof BigDecimal)
                        && n.doubleValue() != Math.floor(n.doubleValue())) {
                    throw new TwinBusinessException(400, "字段 " + field.getFieldCode() + " 需要整数");
                }
                v.setValueInt(n.longValue());
            }
            case COL_TEXT -> {
                if (!(raw instanceof String)) {
                    throw new TwinBusinessException(400, "字段 " + field.getFieldCode() + " 需要文本类型");
                }
                v.setValueText((String) raw);
            }
            case COL_BOOL -> {
                if (!(raw instanceof Boolean)) {
                    throw new TwinBusinessException(400, "字段 " + field.getFieldCode() + " 需要布尔类型");
                }
                v.setValueBool((Boolean) raw);
            }
            default -> throw new TwinBusinessException(400, "不支持的字段类型");
        }
        return true;
    }

    private static Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(v).trim()); }
        catch (NumberFormatException e) { return null; }
    }
}
