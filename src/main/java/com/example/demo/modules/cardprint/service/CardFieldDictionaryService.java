package com.example.demo.modules.cardprint.service;

import com.example.demo.modules.cageshelf.entity.CageFormCompositeAtom;
import com.example.demo.modules.cageshelf.entity.CageFormField;
import com.example.demo.modules.cageshelf.entity.CageFormTemplate;
import com.example.demo.modules.cageshelf.entity.CageInfoField;
import com.example.demo.modules.cageshelf.mapper.CageFormCompositeAtomMapper;
import com.example.demo.modules.cageshelf.mapper.CageFormFieldMapper;
import com.example.demo.modules.cageshelf.mapper.CageFormTemplateMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoFieldMapper;
import com.example.demo.modules.cageshelf.service.CageInfoTemplateService;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 卡牌字段字典：已发布的笼位表单模板字段 + 只读特殊字段（二维码 / 位置）。 */
@Service
public class CardFieldDictionaryService {

    /** 二维码字段 key，值为 animalCageId。 */
    public static final String QR_FIELD = "__qr__";
    /** 位置字段 key，值为「房间名 笼架名 坐标」。 */
    public static final String POSITION_FIELD = "__position__";

    private final CageInfoFieldMapper fieldMapper;
    private final CageFormTemplateMapper templateMapper;
    private final CageFormCompositeAtomMapper compositeAtomMapper;
    private final CageFormFieldMapper formFieldMapper;

    public CardFieldDictionaryService(CageInfoFieldMapper fieldMapper,
                                      CageFormTemplateMapper templateMapper,
                                      CageFormCompositeAtomMapper compositeAtomMapper,
                                      CageFormFieldMapper formFieldMapper) {
        this.fieldMapper = fieldMapper;
        this.templateMapper = templateMapper;
        this.compositeAtomMapper = compositeAtomMapper;
        this.formFieldMapper = formFieldMapper;
    }

    /** 可绑定字段列表，按 sort 升序；特殊字段排在最后。 */
    public List<Map<String, Object>> listOptions() {
        List<CageFormField> formFields = publishedFormFields();
        List<Map<String, Object>> out = new ArrayList<>();
        if (!formFields.isEmpty()) {
            for (CageFormField f : formFields) {
                if (f == null || f.getCanonical() == null) continue;
                out.add(formRow(f));
            }
        } else {
            for (CageInfoField f : fieldMapper.selectPublished()) {
                if (f == null || f.getCanonical() == null) continue;
                out.add(infoFieldRow(f));
            }
        }
        out.add(special(QR_FIELD, "二维码（笼位ID）"));
        out.add(special(POSITION_FIELD, "位置（房间/笼架/坐标）"));
        return out;
    }

    /** 已发布字段的 canonical 集合，用于校验模板绑定是否合法。 */
    public java.util.Set<String> allowedKeys() {
        java.util.Set<String> keys = new java.util.HashSet<>();
        List<CageFormField> formFields = publishedFormFields();
        if (!formFields.isEmpty()) {
            for (CageFormField f : formFields) {
                if (f != null && f.getCanonical() != null) keys.add(f.getCanonical());
            }
        } else {
            for (CageInfoField f : fieldMapper.selectPublished()) {
                if (f != null && f.getCanonical() != null) keys.add(f.getCanonical());
            }
        }
        keys.add(QR_FIELD);
        keys.add(POSITION_FIELD);
        return keys;
    }

    /**
     * 已发布的组合表单模板 cage_detail 钉住的各原子模板的字段，按 sortOrder（null 当 0）稳定排序。
     * 组合模板缺失或字段为空时返回空列表，调用方回退到 cage_info_field.published。
     */
    private List<CageFormField> publishedFormFields() {
        CageFormTemplate composite = templateMapper.selectByFormKey(CageInfoTemplateService.COMPOSITE_FORM_KEY);
        if (composite == null) {
            return List.of();
        }
        List<CageFormField> fields = new ArrayList<>();
        for (CageFormCompositeAtom ref : compositeAtomMapper.selectByCompositeId(composite.getId())) {
            if (ref == null || ref.getAtomTemplateId() == null) continue;
            for (CageFormField f : formFieldMapper.selectByTemplateId(ref.getAtomTemplateId())) {
                if (f != null) fields.add(f);
            }
        }
        fields.sort(Comparator.comparingInt(f -> f.getSortOrder() == null ? 0 : f.getSortOrder()));
        return fields;
    }

    private static Map<String, Object> formRow(CageFormField f) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("key", f.getCanonical());
        row.put("label", f.getLabel());
        row.put("dataType", f.getDataType());
        row.put("dictKey", f.getDictKey());
        row.put("domainCode", null);
        row.put("submoduleCode", null);
        row.put("source", "FORM");
        row.put("readonly", Boolean.FALSE);
        return row;
    }

    private static Map<String, Object> infoFieldRow(CageInfoField f) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("key", f.getCanonical());
        row.put("label", f.getLabel());
        row.put("dataType", f.getDataType());
        row.put("dictKey", f.getDictKey());
        row.put("domainCode", f.getDomainCode());
        row.put("submoduleCode", f.getSubmoduleCode());
        row.put("source", "FORM");
        row.put("readonly", Boolean.FALSE);
        return row;
    }

    private static Map<String, Object> special(String key, String label) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("key", key);
        row.put("label", label);
        row.put("dataType", "STRING");
        row.put("dictKey", null);
        row.put("domainCode", null);
        row.put("submoduleCode", null);
        row.put("source", "SPECIAL");
        row.put("readonly", Boolean.TRUE);
        return row;
    }
}
