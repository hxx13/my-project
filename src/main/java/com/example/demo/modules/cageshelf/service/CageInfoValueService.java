package com.example.demo.modules.cageshelf.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.entity.CageInfoField;
import com.example.demo.modules.cageshelf.entity.CageInfoValue;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoFieldMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoValueMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 笼位级表单值（关键信息）读写 + 老数据同步。
 * 表单是「固定信息模板」，值挂笼位（animal_cage_id），与认领无关；没认领也渲染（值空）。
 */
@Service
public class CageInfoValueService {

    private static final String COL_INT = "value_int";
    private static final String COL_TEXT = "value_text";
    private static final String COL_BOOL = "value_bool";
    private static final String COL_STRING = "value_string";
    private static final String COL_DECIMAL = "value_decimal";
    private static final String COL_DATE = "value_date";
    private static final String COL_DATETIME = "value_datetime";
    private static final String COL_JSON = "value_json";

    /** 占用字段（随个人/课题转移，不随笼位物理资产）—— 区别于笼位固有字段（物理状态/笼盒/坐标/名称）。 */
    private static final Set<String> OCCUPANCY_CANONICALS = Set.of(
            "pi_name", "project_pi_name", "project_name", "department_name", "aup_number",
            "experimenter_name", "lab_assistant_name",
            "needs_division", "needs_special_feeding", "needs_transfer", "has_health_abnormality", "needs_cohabitation",
            "special_breeding_name", "special_breeding_desc",
            "cage_use_time", "animal_strain_name", "animal_sex", "animal_week_age",
            "animal_male_number", "animal_female_number", "animal_come_from");

    /** 本地扩展字段（实验记录/照片/本地扩展数据），不属于 ARO 映射，锚定 cage_info_value。 */
    private static final Set<String> LOCAL_FIELD_CANONICALS = Set.of("experiment_desc", "images_json", "extra_data");

    private final CageInfoFieldMapper fieldMapper;
    private final CageInfoValueMapper valueMapper;
    private final CageCellDetailMapper detailMapper;
    private final CageFormAuditService auditService;

    public CageInfoValueService(CageInfoFieldMapper fieldMapper,
                                CageInfoValueMapper valueMapper,
                                CageCellDetailMapper detailMapper,
                                CageFormAuditService auditService) {
        this.fieldMapper = fieldMapper;
        this.valueMapper = valueMapper;
        this.detailMapper = detailMapper;
        this.auditService = auditService;
    }

    /** 读某笼位的全部表单值（字段字典 + 实例值），未填写返回 null 值行。 */
    public List<Map<String, Object>> getInfo(Long animalCageId) {
        List<CageInfoField> fields = fieldMapper.selectAll();
        List<CageInfoValue> values = valueMapper.selectByAnimalCageId(animalCageId);
        Map<Long, CageInfoValue> valueByFieldId = new HashMap<>();
        for (CageInfoValue v : values) {
            if (v != null && v.getFieldId() != null) valueByFieldId.put(v.getFieldId(), v);
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (CageInfoField f : fields) {
            if (f == null || f.getId() == null) continue;
            CageInfoValue v = valueByFieldId.get(f.getId());
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("fieldId", f.getId());
            row.put("canonical", f.getCanonical());
            row.put("label", f.getLabel());
            row.put("dataType", f.getDataType());
            row.put("fieldType", f.getFieldType());
            row.put("role", f.getRole());
            row.put("required", f.getRequired());
            row.put("sort", f.getSort());
            row.put("value", readValue(f, v));
            row.put("fillSource", v == null ? null : v.getFillSource());
            result.add(row);
        }
        return result;
    }

    /** 写某笼位的表单值。entry: { fieldId, value }。 */
    @Transactional
    public List<Map<String, Object>> updateInfo(Long animalCageId, List<Map<String, Object>> entries, String operatorId) {
        List<Map<String, Object>> beforeRows = getInfo(animalCageId);
        Map<Long, Object> beforeByField = new HashMap<>();
        for (Map<String, Object> row : beforeRows) {
            Long fid = toLong(row.get("fieldId"));
            if (fid != null) beforeByField.put(fid, row.get("value"));
        }
        List<CageInfoField> fields = fieldMapper.selectAll();
        Map<Long, CageInfoField> fieldById = new HashMap<>();
        for (CageInfoField f : fields) {
            if (f != null && f.getId() != null) fieldById.put(f.getId(), f);
        }
        for (Map<String, Object> entry : entries) {
            if (entry == null) continue;
            Long fieldId = toLong(entry.get("fieldId"));
            if (fieldId == null) throw new TwinBusinessException(400, "fieldId 必填");
            CageInfoField field = fieldById.get(fieldId);
            if (field == null) throw new TwinBusinessException(400, "字段不存在: " + fieldId);
            // 非 VALUE 角色（DERIVED/PK/FK）拒绝手动填写：取值只来自外部同步或后续接入的引擎
            //（笼位取号引擎未定，占位，绝不调用 NHP 取号器）。SYNC 直写路径不受此限制。
            if (field.getRole() != null && !"VALUE".equals(field.getRole())) {
                throw new TwinBusinessException(400, "字段「" + field.getCanonical() + "」为只读（role=" + field.getRole() + "），不允许手动填写");
            }
            String col = valueColumn(field.getDataType());
            if (col == null) throw new TwinBusinessException(400, "字段类型不支持: " + field.getDataType());

            CageInfoValue v = new CageInfoValue();
            v.setAnimalCageId(animalCageId);
            v.setFieldId(fieldId);
            boolean applied = applyValue(v, col, field, entry.get("value"));
            Object beforeVal = beforeByField.get(fieldId);
            Object afterVal = entry.get("value");
            if (applied) {
                v.setFillSource("MANUAL");
                valueMapper.upsert(v);
                afterVal = readValue(field, v);
            }
            if (!Objects.equals(stringify(beforeVal), stringify(afterVal))) {
                auditService.logDataChange("UPDATE", "cage_box", animalCageId, String.valueOf(animalCageId), null,
                        "animal_cage", animalCageId, String.valueOf(animalCageId),
                        field.getCanonical(), field.getLabel(),
                        stringify(beforeVal), stringify(afterVal), operatorId);
            }
        }
        return getInfo(animalCageId);
    }

    /** 编辑模式切换状态标记 — 只写表单(cage_info_value)，不回写固定表、不再 ARO 投递。 */
    @Transactional
    public void setStatus(Long animalCageId, String canonical, boolean enable, String operatorId) {
        if (animalCageId == null || canonical == null || canonical.isBlank()) return;
        CageInfoField field = fieldMapper.selectByCanonical(canonical);
        if (field == null || field.getId() == null) return;

        Boolean before = null;
        for (CageInfoValue v : valueMapper.selectByAnimalCageId(animalCageId)) {
            if (v != null && field.getId().equals(v.getFieldId())) { before = v.getValueBool(); break; }
        }

        CageInfoValue v = new CageInfoValue();
        v.setAnimalCageId(animalCageId);
        v.setFieldId(field.getId());
        v.setValueBool(enable);
        v.setFillSource("MANUAL");
        valueMapper.upsert(v);

        if (!Objects.equals(before, enable)) {
            auditService.logDataChange("UPDATE", "cage_box", animalCageId, String.valueOf(animalCageId), null,
                    "animal_cage", animalCageId, String.valueOf(animalCageId),
                    field.getCanonical(), field.getLabel(),
                    stringify(before), stringify(enable), operatorId);
        }
    }

    /** 批量读状态标记布尔（仅 5 个状态字段）→ cageId:{canonical:boolean}，供网格/详情从表单读侧切读。 */
    public Map<Long, Map<String, Boolean>> statusFlagsByCage(List<Long> cageIds) {
        Map<Long, Map<String, Boolean>> out = new LinkedHashMap<>();
        if (cageIds == null || cageIds.isEmpty()) return out;
        Set<String> statusCanonicals = Set.of(
                "needs_division", "needs_special_feeding", "needs_transfer",
                "has_health_abnormality", "needs_cohabitation");
        Map<Long, String> canonicalByFieldId = new HashMap<>();
        for (CageInfoField f : fieldMapper.selectAll()) {
            if (f != null && f.getId() != null && f.getCanonical() != null && statusCanonicals.contains(f.getCanonical())) {
                canonicalByFieldId.put(f.getId(), f.getCanonical());
            }
        }
        for (CageInfoValue v : valueMapper.selectByAnimalCageIds(cageIds)) {
            if (v == null || v.getAnimalCageId() == null || v.getFieldId() == null) continue;
            String canonical = canonicalByFieldId.get(v.getFieldId());
            if (canonical == null) continue;
            out.computeIfAbsent(v.getAnimalCageId(), k -> new HashMap<>()).put(canonical, v.getValueBool());
        }
        return out;
    }

    /** 批量读某文本 canonical 字段（如 experimenter_name）→ cageId:值，供网格从表单读侧切读。 */
    public Map<Long, String> textValueByCage(List<Long> cageIds, String canonical) {
        Map<Long, String> out = new LinkedHashMap<>();
        if (cageIds == null || cageIds.isEmpty() || canonical == null) return out;
        Map<Long, String> canonicalByFieldId = new HashMap<>();
        for (CageInfoField f : fieldMapper.selectAll()) {
            if (f != null && f.getId() != null && canonical.equals(f.getCanonical())) {
                canonicalByFieldId.put(f.getId(), canonical);
            }
        }
        for (CageInfoValue v : valueMapper.selectByAnimalCageIds(cageIds)) {
            if (v == null || v.getAnimalCageId() == null || v.getFieldId() == null) continue;
            if (!canonicalByFieldId.containsKey(v.getFieldId())) continue;
            // STRING 字段值在 value_string（如 experimenter_name），TEXT 字段在 value_text，两者都兼容
            String val = v.getValueText();
            if (val == null || val.isBlank()) val = v.getValueString();
            if (val != null && !val.isBlank()) out.put(v.getAnimalCageId(), val.trim());
        }
        return out;
    }

    /** 从笼位详情(cage_cell_detail)同步老数据到笼位级值（fill_source=SYNC）。幂等：仅在有值字段上 upsert。 */
    @Transactional
    public void seedFromDetail(Long animalCageId) {
        if (animalCageId == null) return;
        CageCellDetail detail = detailMapper.selectByAnimalCageId(animalCageId);
        if (detail == null) return;

        List<CageInfoField> fields = fieldMapper.selectAll();
        Map<String, Long> fieldIdByCanonical = new HashMap<>();
        for (CageInfoField f : fields) {
            if (f != null && f.getCanonical() != null && f.getId() != null) {
                fieldIdByCanonical.put(f.getCanonical(), f.getId());
            }
        }

        upsertInt(animalCageId, fieldIdByCanonical, "animal_male_number", detail.getAnimalMaleNumber());
        upsertInt(animalCageId, fieldIdByCanonical, "animal_female_number", detail.getAnimalFemaleNumber());

        upsertBool(animalCageId, fieldIdByCanonical, "needs_division", detail.getNeedsDivision());
        upsertBool(animalCageId, fieldIdByCanonical, "needs_special_feeding", detail.getNeedsSpecialFeeding());
        upsertBool(animalCageId, fieldIdByCanonical, "needs_transfer", detail.getNeedsTransfer());
        upsertBool(animalCageId, fieldIdByCanonical, "has_health_abnormality", detail.getHasHealthAbnormality());
        // 合笼(needs_cohabitation)不从此迁移：ARO 源在 /back 的 cageBoxVo（syncAllCells 直写），
        // detail 表恒为 0，若在此迁移会在每次启动时用 stale 的 0 覆盖同步结果。

        upsertText(animalCageId, fieldIdByCanonical, "pi_name", detail.getPiName());
        upsertText(animalCageId, fieldIdByCanonical, "project_pi_name", detail.getProjectPiName());
        upsertText(animalCageId, fieldIdByCanonical, "project_name", detail.getProjectName());
        upsertText(animalCageId, fieldIdByCanonical, "department_name", detail.getDepartmentName());
        upsertText(animalCageId, fieldIdByCanonical, "aup_number", detail.getAupNumber());
        upsertText(animalCageId, fieldIdByCanonical, "special_breeding_name", detail.getSpecialBreedingName());
        upsertText(animalCageId, fieldIdByCanonical, "special_breeding_desc", detail.getSpecialBreedingDesc());
        upsertText(animalCageId, fieldIdByCanonical, "experimenter_name", detail.getExperimenterName());
        upsertText(animalCageId, fieldIdByCanonical, "lab_assistant_name", detail.getLabAssistantName());
        upsertText(animalCageId, fieldIdByCanonical, "animal_strain_name", detail.getAnimalStrainName());
        upsertText(animalCageId, fieldIdByCanonical, "animal_sex", detail.getAnimalSex());
        upsertText(animalCageId, fieldIdByCanonical, "animal_week_age", detail.getAnimalWeekAge());
        upsertText(animalCageId, fieldIdByCanonical, "animal_come_from", detail.getAnimalComeFrom());

        // 本地扩展字段（非 ARO 映射，属系统自有存储）
        upsertTextBlock(animalCageId, fieldIdByCanonical, "experiment_desc", detail.getExperimentDesc());
        upsertJson(animalCageId, fieldIdByCanonical, "images_json", detail.getImagesJson());
        upsertJson(animalCageId, fieldIdByCanonical, "extra_data", detail.getExtraData());
    }

    /** 分笼继承：把母笼的笼位级值整表复制到子笼（fill_source=INHERIT），再清空需重填字段。 */
    @Transactional
    public void copyFrom(Long sourceAnimalCageId, Long targetAnimalCageId) {
        if (sourceAnimalCageId == null || targetAnimalCageId == null) return;
        for (CageInfoValue v : valueMapper.selectByAnimalCageId(sourceAnimalCageId)) {
            CageInfoValue copy = new CageInfoValue();
            copy.setAnimalCageId(targetAnimalCageId);
            copy.setFieldId(v.getFieldId());
            copy.setValueString(v.getValueString());
            copy.setValueText(v.getValueText());
            copy.setValueInt(v.getValueInt());
            copy.setValueDecimal(v.getValueDecimal());
            copy.setValueDate(v.getValueDate());
            copy.setValueDatetime(v.getValueDatetime());
            copy.setValueBool(v.getValueBool());
            copy.setValueJson(v.getValueJson());
            copy.setFillSource("INHERIT");
            valueMapper.upsert(copy);
        }
        for (String canonical : new String[]{"animal_male_number", "animal_female_number", "animal_sex"}) {
            CageInfoField f = fieldMapper.selectByCanonical(canonical);
            if (f != null && f.getId() != null) {
                valueMapper.deleteByAnimalCageAndField(targetAnimalCageId, f.getId());
            }
        }
    }

    /** 仅复制占用字段（不复制笼位固有字段）。target 上先 upsert，不清理 target 既有其他字段。 */
    @Transactional
    public void copyOccupancyFields(Long sourceAnimalCageId, Long targetAnimalCageId, String fillSource) {
        if (sourceAnimalCageId == null || targetAnimalCageId == null) return;
        Map<Long, CageInfoField> occupancyById = occupancyFieldById();
        for (CageInfoValue v : valueMapper.selectByAnimalCageId(sourceAnimalCageId)) {
            if (v == null || !occupancyById.containsKey(v.getFieldId())) continue;
            CageInfoValue copy = new CageInfoValue();
            copy.setAnimalCageId(targetAnimalCageId);
            copy.setFieldId(v.getFieldId());
            copy.setValueString(v.getValueString());
            copy.setValueText(v.getValueText());
            copy.setValueInt(v.getValueInt());
            copy.setValueDecimal(v.getValueDecimal());
            copy.setValueDate(v.getValueDate());
            copy.setValueDatetime(v.getValueDatetime());
            copy.setValueBool(v.getValueBool());
            copy.setValueJson(v.getValueJson());
            copy.setFillSource(fillSource);
            valueMapper.upsert(copy);
        }
    }

    /** 清空某笼位的占用字段（转笼/退出后，源笼位回到空闲的占用维度）。 */
    @Transactional
    public void clearOccupancyFields(Long animalCageId) {
        if (animalCageId == null) return;
        for (CageInfoField f : occupancyFieldById().values()) {
            valueMapper.deleteByAnimalCageAndField(animalCageId, f.getId());
        }
    }

    private static final Set<String> ARCHIVE_CLEAR_CANONICALS = Set.of(
            "experimenter_name", "lab_assistant_name",
            "animal_strain_name", "animal_sex", "animal_week_age",
            "animal_male_number", "animal_female_number", "animal_come_from",
            "needs_division", "needs_special_feeding", "needs_transfer",
            "has_health_abnormality", "needs_cohabitation",
            "special_breeding_name", "special_breeding_desc", "cage_use_time");

    /** 归档：清空占用者/动物/状态标记，保留课题组归属(pi/aup/dept/project)。 */
    @Transactional
    public void clearArchiveFields(Long animalCageId) {
        if (animalCageId == null) return;
        for (CageInfoField f : fieldMapper.selectAll()) {
            if (f == null || f.getId() == null || f.getCanonical() == null) continue;
            if (ARCHIVE_CLEAR_CANONICALS.contains(f.getCanonical())) {
                valueMapper.deleteByAnimalCageAndField(animalCageId, f.getId());
            }
        }
    }

    /** 同步直写：ARO 映射结果(canonical → 值)upsert 进 cage_info_value(fill_source=SYNC)。空值/类型不匹配跳过,不阻塞整次同步。变化时记字段级审计（操作人=SYNC）。 */
    @Transactional
    public void syncFromMapped(Long animalCageId, Map<String, Object> mapped) {
        if (animalCageId == null || mapped == null || mapped.isEmpty()) return;
        Map<String, CageInfoField> fieldByCanonical = new HashMap<>();
        Map<Long, CageInfoField> fieldById = new HashMap<>();
        for (CageInfoField f : fieldMapper.selectAll()) {
            if (f != null && f.getCanonical() != null && f.getId() != null) {
                fieldByCanonical.put(f.getCanonical(), f);
                fieldById.put(f.getId(), f);
            }
        }
        // 读当前值（before），用于全字段变化审计
        Map<Long, Object> beforeByFieldId = new HashMap<>();
        for (CageInfoValue v : valueMapper.selectByAnimalCageId(animalCageId)) {
            if (v == null || v.getFieldId() == null) continue;
            CageInfoField f = fieldById.get(v.getFieldId());
            if (f != null) beforeByFieldId.put(v.getFieldId(), readValue(f, v));
        }
        for (Map.Entry<String, Object> e : mapped.entrySet()) {
            CageInfoField field = fieldByCanonical.get(e.getKey());
            if (field == null) continue;
            Object raw = e.getValue();
            if (raw == null || (raw instanceof String s && s.isBlank())) continue;
            String col = valueColumn(field.getDataType());
            if (col == null) continue;
            CageInfoValue v = new CageInfoValue();
            v.setAnimalCageId(animalCageId);
            v.setFieldId(field.getId());
            try {
                if (applyValue(v, col, field, raw)) {
                    v.setFillSource("SYNC");
                    valueMapper.upsert(v);
                    // 全字段追溯：同步写入也记字段变化（操作人=SYNC）
                    Object after = readValue(field, v);
                    Object before = beforeByFieldId.get(field.getId());
                    if (!Objects.equals(stringify(before), stringify(after))) {
                        auditService.logDataChange("UPDATE", "cage_box", animalCageId,
                                String.valueOf(animalCageId), null,
                                "animal_cage", animalCageId, String.valueOf(animalCageId),
                                field.getCanonical(), field.getLabel(),
                                stringify(before), stringify(after), "SYNC");
                    }
                }
            } catch (TwinBusinessException ex) {
                // 同步值类型不匹配,跳过该字段
            }
        }
    }

    /** 读取本地扩展字段(experiment_desc/images_json/extra_data)的当前值，canonical → 值。 */
    public Map<String, Object> getLocalFields(Long animalCageId) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (String c : LOCAL_FIELD_CANONICALS) out.put(c, null);
        if (animalCageId == null) return out;
        Map<Long, CageInfoField> fieldById = new HashMap<>();
        for (CageInfoField f : fieldMapper.selectAll()) {
            if (f != null && f.getId() != null) fieldById.put(f.getId(), f);
        }
        for (CageInfoValue v : valueMapper.selectByAnimalCageId(animalCageId)) {
            CageInfoField f = fieldById.get(v == null ? null : v.getFieldId());
            if (f == null || !LOCAL_FIELD_CANONICALS.contains(f.getCanonical())) continue;
            out.put(f.getCanonical(), readValue(f, v));
        }
        return out;
    }

    /** 写本地扩展字段(MANUAL，走审计)。values: canonical → 值。 */
    @Transactional
    public void saveLocalFields(Long animalCageId, Map<String, Object> values, String operatorId) {
        if (animalCageId == null || values == null || values.isEmpty()) return;
        Map<String, Long> fieldIdByCanonical = new HashMap<>();
        for (CageInfoField f : fieldMapper.selectAll()) {
            if (f != null && f.getCanonical() != null && f.getId() != null) {
                fieldIdByCanonical.put(f.getCanonical(), f.getId());
            }
        }
        List<Map<String, Object>> entries = new ArrayList<>();
        for (String canonical : LOCAL_FIELD_CANONICALS) {
            if (!values.containsKey(canonical)) continue;
            Long fieldId = fieldIdByCanonical.get(canonical);
            if (fieldId != null) entries.add(Map.of("fieldId", fieldId, "value", values.get(canonical)));
        }
        if (!entries.isEmpty()) updateInfo(animalCageId, entries, operatorId);
    }

    /** 占用字段时点快照（canonical → 值），供转移/退出落 data_snapshot。 */
    public Map<String, Object> snapshotOccupancy(Long animalCageId) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        if (animalCageId == null) return snapshot;
        Map<Long, CageInfoField> fieldById = new HashMap<>();
        for (CageInfoField f : fieldMapper.selectAll()) {
            if (f != null && f.getId() != null) fieldById.put(f.getId(), f);
        }
        for (CageInfoValue v : valueMapper.selectByAnimalCageId(animalCageId)) {
            CageInfoField f = fieldById.get(v == null ? null : v.getFieldId());
            if (f == null || !OCCUPANCY_CANONICALS.contains(f.getCanonical())) continue;
            snapshot.put(f.getCanonical(), readValue(f, v));
        }
        return snapshot;
    }

    private Map<Long, CageInfoField> occupancyFieldById() {
        Map<Long, CageInfoField> m = new HashMap<>();
        for (CageInfoField f : fieldMapper.selectAll()) {
            if (f != null && f.getId() != null && OCCUPANCY_CANONICALS.contains(f.getCanonical())) {
                m.put(f.getId(), f);
            }
        }
        return m;
    }

    // ── 值列映射 ──

    private String valueColumn(String dataType) {
        if (dataType == null) return null;
        return switch (dataType.trim().toUpperCase()) {
            case "INTEGER" -> COL_INT;
            case "DECIMAL" -> COL_DECIMAL;
            case "STRING", "ENUM", "CALC" -> COL_STRING;
            case "TEXT" -> COL_TEXT;
            case "DATE" -> COL_DATE;
            case "DATETIME" -> COL_DATETIME;
            case "BOOLEAN" -> COL_BOOL;
            case "ENUM_MULTI", "FILE" -> COL_JSON;
            default -> null;
        };
    }

    private Object readValue(CageInfoField field, CageInfoValue v) {
        if (v == null) return null;
        String col = valueColumn(field.getDataType());
        if (col == null) return null;
        return switch (col) {
            case COL_INT -> v.getValueInt();
            case COL_BOOL -> v.getValueBool();
            case COL_TEXT -> v.getValueText();
            case COL_STRING -> v.getValueString();
            case COL_DECIMAL -> v.getValueDecimal();
            case COL_DATE -> v.getValueDate();
            case COL_DATETIME -> v.getValueDatetime();
            case COL_JSON -> v.getValueJson();
            default -> null;
        };
    }

    private boolean applyValue(CageInfoValue v, String col, CageInfoField field, Object raw) {
        if (raw == null) {
            valueMapper.deleteByAnimalCageAndField(v.getAnimalCageId(), v.getFieldId());
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
            case COL_DECIMAL -> {
                if (raw instanceof Number n) {
                    v.setValueDecimal(n instanceof BigDecimal bd ? bd : new BigDecimal(n.toString()));
                } else if (raw instanceof String s) {
                    try {
                        v.setValueDecimal(new BigDecimal(s.trim()));
                    } catch (NumberFormatException e) {
                        throw new TwinBusinessException(400, "字段 " + field.getCanonical() + " 需要数值类型");
                    }
                } else {
                    throw new TwinBusinessException(400, "字段 " + field.getCanonical() + " 需要数值类型");
                }
            }
            case COL_TEXT, COL_STRING, COL_DATE, COL_DATETIME, COL_JSON -> {
                if (!(raw instanceof String)) {
                    throw new TwinBusinessException(400, "字段 " + field.getCanonical() + " 需要文本类型");
                }
                switch (col) {
                    case COL_TEXT -> v.setValueText((String) raw);
                    case COL_STRING -> v.setValueString((String) raw);
                    case COL_DATE -> v.setValueDate((String) raw);
                    case COL_DATETIME -> v.setValueDatetime((String) raw);
                    case COL_JSON -> v.setValueJson((String) raw);
                    default -> { /* no-op */ }
                }
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

    // ── seed helpers ──

    private void upsertInt(Long animalCageId, Map<String, Long> byCanonical, String canonical, Integer value) {
        if (value == null) return;
        Long fieldId = byCanonical.get(canonical);
        if (fieldId == null) return;
        CageInfoValue v = new CageInfoValue();
        v.setAnimalCageId(animalCageId);
        v.setFieldId(fieldId);
        v.setValueInt(Long.valueOf(value));
        v.setFillSource("SYNC");
        valueMapper.upsert(v);
    }

    private void upsertBool(Long animalCageId, Map<String, Long> byCanonical, String canonical, Boolean value) {
        if (value == null) return;
        Long fieldId = byCanonical.get(canonical);
        if (fieldId == null) return;
        CageInfoValue v = new CageInfoValue();
        v.setAnimalCageId(animalCageId);
        v.setFieldId(fieldId);
        v.setValueBool(value);
        v.setFillSource("SYNC");
        valueMapper.upsert(v);
    }

    private void upsertText(Long animalCageId, Map<String, Long> byCanonical, String canonical, String value) {
        if (value == null || value.isBlank()) return;
        Long fieldId = byCanonical.get(canonical);
        if (fieldId == null) return;
        CageInfoValue v = new CageInfoValue();
        v.setAnimalCageId(animalCageId);
        v.setFieldId(fieldId);
        // seed 的文本字段 dataType=STRING → 值列必须是 value_string，与读侧 valueColumn("STRING") 对齐
        v.setValueString(value);
        v.setFillSource("SYNC");
        valueMapper.upsert(v);
    }

    /** dataType=TEXT → value_text（实验记录等长文本）。 */
    private void upsertTextBlock(Long animalCageId, Map<String, Long> byCanonical, String canonical, String value) {
        if (value == null || value.isBlank()) return;
        Long fieldId = byCanonical.get(canonical);
        if (fieldId == null) return;
        CageInfoValue v = new CageInfoValue();
        v.setAnimalCageId(animalCageId);
        v.setFieldId(fieldId);
        v.setValueText(value);
        v.setFillSource("SYNC");
        valueMapper.upsert(v);
    }

    /** dataType=FILE → value_json（照片/本地扩展 JSON）。 */
    private void upsertJson(Long animalCageId, Map<String, Long> byCanonical, String canonical, String value) {
        if (value == null || value.isBlank()) return;
        Long fieldId = byCanonical.get(canonical);
        if (fieldId == null) return;
        CageInfoValue v = new CageInfoValue();
        v.setAnimalCageId(animalCageId);
        v.setFieldId(fieldId);
        v.setValueJson(value);
        v.setFillSource("SYNC");
        valueMapper.upsert(v);
    }

    private static Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(v).trim()); } catch (NumberFormatException e) { return null; }
    }

    private static String stringify(Object o) {
        return o == null ? null : String.valueOf(o);
    }
}
