package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.entity.CageClaim;
import com.example.demo.modules.cageshelf.entity.CageClaimInfoValue;
import com.example.demo.modules.cageshelf.entity.CageInfoField;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageClaimInfoValueMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoFieldMapper;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 认领表单实例服务 — 认领/分配建立时从笼位详情（CageCellDetail）同步交接一批 SYNC 种子值。
 */
@Service
public class CageClaimInfoService {

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
}
