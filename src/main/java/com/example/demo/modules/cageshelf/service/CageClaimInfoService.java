package com.example.demo.modules.cageshelf.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.entity.CageClaim;
import com.example.demo.modules.cageshelf.entity.CageClaimInfoValue;
import com.example.demo.modules.cageshelf.entity.CageInfoField;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageClaimInfoValueMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoFieldMapper;
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
 */
@Service
public class CageClaimInfoService {

    private static final String COL_INT = "value_int";
    private static final String COL_TEXT = "value_text";
    private static final String COL_BOOL = "value_bool";

    private final CageCellDetailMapper detailMapper;
    private final CageInfoFieldMapper fieldMapper;
    private final CageClaimInfoValueMapper valueMapper;

    public CageClaimInfoService(CageCellDetailMapper detailMapper,
                                CageInfoFieldMapper fieldMapper,
                                CageClaimInfoValueMapper valueMapper) {
        this.detailMapper = detailMapper;
        this.fieldMapper = fieldMapper;
        this.valueMapper = valueMapper;
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

        List<CageInfoField> fields = fieldMapper.selectAll();
        Map<String, Long> fieldIdByCanonical = new HashMap<>();
        for (CageInfoField f : fields) {
            if (f != null && f.getCanonical() != null && f.getId() != null) {
                fieldIdByCanonical.put(f.getCanonical(), f.getId());
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
     * 读取某个认领的全部信息字段（按字典 sort 排序），每个字段挂上该认领的实例值。
     * 未填写字段 value 为 null、fillSource 为 null，但仍返回行（供表单渲染）。
     */
    public List<Map<String, Object>> getInfo(Long claimId) {
        List<CageInfoField> fields = fieldMapper.selectAll();
        List<CageClaimInfoValue> values = valueMapper.selectByClaimId(claimId);
        Map<Long, CageClaimInfoValue> valueByFieldId = new HashMap<>();
        for (CageClaimInfoValue v : values) {
            if (v != null && v.getFieldId() != null) {
                valueByFieldId.put(v.getFieldId(), v);
            }
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (CageInfoField f : fields) {
            if (f == null || f.getId() == null) continue;
            CageClaimInfoValue v = valueByFieldId.get(f.getId());
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("fieldId", f.getId());
            row.put("canonical", f.getCanonical());
            row.put("label", f.getLabel());
            row.put("dataType", f.getDataType());
            row.put("required", f.getRequired());
            row.put("sort", f.getSort());
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
        List<CageInfoField> fields = fieldMapper.selectAll();
        Map<Long, CageInfoField> fieldById = new HashMap<>();
        for (CageInfoField f : fields) {
            if (f != null && f.getId() != null) {
                fieldById.put(f.getId(), f);
            }
        }

        for (Map<String, Object> entry : entries) {
            if (entry == null) continue;
            Long fieldId = toLong(entry.get("fieldId"));
            if (fieldId == null) throw new TwinBusinessException(400, "fieldId 必填");
            CageInfoField field = fieldById.get(fieldId);
            if (field == null) throw new TwinBusinessException(400, "字段不存在: " + fieldId);
            String col = valueColumn(field.getDataType());
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

    private Object readValue(CageInfoField field, CageClaimInfoValue v) {
        if (v == null) return null;
        String col = valueColumn(field.getDataType());
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
    private boolean applyValue(CageClaimInfoValue v, String col, CageInfoField field, Object raw) {
        if (raw == null) {
            valueMapper.deleteByClaimAndField(v.getClaimId(), v.getFieldId());
            return false;
        }
        switch (col) {
            case COL_INT -> {
                if (!(raw instanceof Number n)) {
                    throw new TwinBusinessException(400, "字段 " + field.getCanonical() + " 需要数字类型");
                }
                if ((n instanceof Double || n instanceof Float || n instanceof BigDecimal)
                        && n.doubleValue() != Math.floor(n.doubleValue())) {
                    throw new TwinBusinessException(400, "字段 " + field.getCanonical() + " 需要整数");
                }
                v.setValueInt(n.longValue());
            }
            case COL_TEXT -> {
                if (!(raw instanceof String)) {
                    throw new TwinBusinessException(400, "字段 " + field.getCanonical() + " 需要文本类型");
                }
                v.setValueText((String) raw);
            }
            case COL_BOOL -> {
                if (!(raw instanceof Boolean)) {
                    throw new TwinBusinessException(400, "字段 " + field.getCanonical() + " 需要布尔类型");
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
