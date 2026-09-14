package com.example.demo.modules.cageshelf.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.entity.CageInfoCodelist;
import com.example.demo.modules.cageshelf.entity.CageInfoCodelistItem;
import com.example.demo.modules.cageshelf.entity.CageInfoField;
import com.example.demo.modules.cageshelf.entity.CageInfoValue;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoCodelistItemMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoCodelistMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoFieldMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoValueMapper;
import com.alibaba.fastjson2.JSON;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
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
            "project_pi_name", "project_name", "department_name", "aup_number",
            "experimenter_name", "lab_assistant_name",
            "needs_division", "needs_special_feeding", "needs_transfer", "has_health_abnormality", "needs_cohabitation",
            "special_breeding_name", "special_breeding_desc",
            "cage_use_time", "animal_strain_name", "animal_sex", "animal_week_age",
            "animal_male_number", "animal_female_number", "animal_come_from");

    /** 本地扩展字段（实验记录/照片/本地扩展数据），不属于 ARO 映射，锚定 cage_info_value。 */
    private static final Set<String> LOCAL_FIELD_CANONICALS = Set.of("experiment_desc", "images_json", "extra_data");

    /** 特殊饲养明细：字段 canonical 与码表 code。真身在 {@link CageStatusIntervalService}
     *  （状态码词表那一处），这里只做别名，免得两个服务各写一份字符串。 */
    public static final String SPECIAL_DETAIL_CANONICAL = CageStatusIntervalService.DETAIL_CANONICAL;
    public static final String SPECIAL_DETAIL_DICT = CageStatusIntervalService.DETAIL_DICT_CODE;

    private final CageInfoFieldMapper fieldMapper;
    private final CageInfoValueMapper valueMapper;
    private final CageCellDetailMapper detailMapper;
    private final CageFormAuditService auditService;
    private final CageIntermediateStateService intermediateStateService;
    private final CageInfoCodelistMapper codelistMapper;
    private final CageInfoCodelistItemMapper codelistItemMapper;

    public CageInfoValueService(CageInfoFieldMapper fieldMapper,
                                CageInfoValueMapper valueMapper,
                                CageCellDetailMapper detailMapper,
                                CageFormAuditService auditService,
                                CageIntermediateStateService intermediateStateService,
                                CageInfoCodelistMapper codelistMapper,
                                CageInfoCodelistItemMapper codelistItemMapper) {
        this.fieldMapper = fieldMapper;
        this.valueMapper = valueMapper;
        this.detailMapper = detailMapper;
        this.auditService = auditService;
        this.intermediateStateService = intermediateStateService;
        this.codelistMapper = codelistMapper;
        this.codelistItemMapper = codelistItemMapper;
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
            row.put("editable", Boolean.TRUE.equals(f.getEditable()));
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
            // 可编辑性只看 editable（与 role 解耦）：DERIVED 字段被配置为可改时同样允许人工填写。
            // SYNC/INHERIT 等直写路径不受此限制。
            if (!Boolean.TRUE.equals(field.getEditable())) {
                throw new TwinBusinessException(400, "字段「" + field.getCanonical() + "」为只读，不允许手动填写（可在字段管理中开启「允许人工修改」）");
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
        // 只拦「打上标记」这个方向：笼位已被进行中的流程占着（预定/已下单待审/分笼转移在审/认领在审）时
        // 不能再叠一层占用语义——那条流程审完，笼位上的标记就和它的预期对不上了。
        // 取消标记不受限，否则一旦占上就再也退不回来。
        if (enable) {
            String busy = intermediateStateService.busyReason(animalCageId);
            if (busy != null) {
                throw new TwinBusinessException(409, busy + "，不能标记饲养状态");
            }
        }
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
        // 强绑定：特殊饲养关掉 → 明细一并清空（明细的审计同步成对出现，见 writeSpecialDetails）
        if ("needs_special_feeding".equals(field.getCanonical()) && !enable) {
            writeSpecialDetails(animalCageId, List.of(), operatorId);
        }
    }

    /**
     * 覆盖式写入「特殊饲养明细」子状态（多选）。
     *
     * <p>明细项是**动态**的（码表可加项），所以是整体覆盖而不是逐项接口：一次提交带上目标集合，
     * 内部 diff 出增/减项、各写一条审计。审计行用「明细码」当 field_code（{@code SF_} + item_code）、
     * 码表中文名当 field_name —— 折叠引擎只认「逐字段布尔前后值」，于是折叠、阈值、超时、违规
     * 四条链零改动地复用，每个明细项天然拿到自己的区间。
     *
     * <p>强绑定：打明细必须建立在「特殊饲养 = on」之上；特殊饲养关掉时由 {@link #setStatus}
     * 调 {@link #writeSpecialDetails} 清空（那条路不做前置校验，否则关不掉）。
     */
    @Transactional
    public void setSpecialDetails(Long animalCageId, Collection<String> itemCodes, String operatorId) {
        if (animalCageId == null) return;
        Set<String> target = normalizeDetailCodes(itemCodes);
        if (!target.isEmpty()) {
            // 与 setStatus 打标记同一口径：只拦「加上去」这个方向（清空不受限，否则退不回来）
            String busy = intermediateStateService.busyReason(animalCageId);
            if (busy != null) {
                throw new TwinBusinessException(409, busy + "，不能标记饲养状态");
            }
            if (!isStatusOn(animalCageId, "needs_special_feeding")) {
                throw new TwinBusinessException(409, "请先标记「需特殊饲养」，再细化它的明细");
            }
        }
        writeSpecialDetails(animalCageId, target, operatorId);
    }

    /** 值 + 逐项审计，**不含**「特殊饲养必须开着」的前置校验（清空路径要用）。 */
    private void writeSpecialDetails(Long animalCageId, Collection<String> itemCodes, String operatorId) {
        CageInfoField field = fieldMapper.selectByCanonical(SPECIAL_DETAIL_CANONICAL);
        if (field == null || field.getId() == null) return; // 字段未播种 → 什么都不做（与缺字段同口径）
        Set<String> target = normalizeDetailCodes(itemCodes);
        LinkedHashSet<String> current = new LinkedHashSet<>(currentDetailCodes(animalCageId, field));
        if (current.equals(target)) return; // 幂等：没变就不写、也不留审计

        CageInfoValue v = new CageInfoValue();
        v.setAnimalCageId(animalCageId);
        v.setFieldId(field.getId());
        v.setValueJson(JSON.toJSONString(new ArrayList<>(target)));
        v.setFillSource("MANUAL");
        valueMapper.upsert(v);

        Map<String, String> labels = detailItemLabels();
        // 兼容：选中集合**同时镜像**进「特殊饲养名称」（人读拼接「需加食、勿加水」；清空写空串）。
        // 那是 ARO 侧 specialBreedingName 的本地落点，下游只认它。这一笔不写审计 ——
        // 明细项自己已有逐项审计行，再记一笔名称变更只是双份噪音。
        writeDetailName(animalCageId, target, labels);

        for (String code : target) {
            if (!current.contains(code)) logDetailAudit(animalCageId, code, labels, false, true, operatorId);
        }
        for (String code : current) {
            if (!target.contains(code)) logDetailAudit(animalCageId, code, labels, true, false, operatorId);
        }
    }

    /** 把明细选中集合拼成人读串写进「特殊饲养名称」字段（空集合 → 空串）。 */
    private void writeDetailName(Long animalCageId, Collection<String> target, Map<String, String> labels) {
        CageInfoField nameField = fieldMapper.selectByCanonical(CageStatusIntervalService.DETAIL_NAME_CANONICAL);
        if (nameField == null || nameField.getId() == null) return;
        String joined = target.stream().map((c) -> labels.getOrDefault(c, c)).collect(java.util.stream.Collectors.joining("、"));
        CageInfoValue nv = new CageInfoValue();
        nv.setAnimalCageId(animalCageId);
        nv.setFieldId(nameField.getId());
        nv.setValueString(joined);
        nv.setFillSource("MANUAL");
        valueMapper.upsert(nv);
    }

    /** 明细审计行：field_code 用明细码（{@code SF_} + item_code），field_name 用码表中文名。 */
    private void logDetailAudit(Long animalCageId, String itemCode, Map<String, String> labels,
                                boolean before, boolean after, String operatorId) {
        String statusCode = CageStatusIntervalService.DETAIL_STATUS_PREFIX + itemCode;
        auditService.logDataChange("UPDATE", "cage_box", animalCageId, String.valueOf(animalCageId), null,
                "animal_cage", animalCageId, String.valueOf(animalCageId),
                statusCode, labels.getOrDefault(itemCode, itemCode),
                stringify(before), stringify(after), operatorId);
    }

    private static Set<String> normalizeDetailCodes(Collection<String> itemCodes) {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        if (itemCodes != null) {
            for (String c : itemCodes) if (c != null && !c.isBlank()) out.add(c.trim());
        }
        return out;
    }

    private List<String> currentDetailCodes(Long animalCageId, CageInfoField field) {
        for (CageInfoValue v : valueMapper.selectByAnimalCageId(animalCageId)) {
            if (v != null && field.getId().equals(v.getFieldId())) return parseMulti(v.getValueJson());
        }
        return List.of();
    }

    /**
     * 批量读「特殊饲养明细」选中集合 → cageId:item_code 列表（网格的状态标签要用）。
     * 只回非空的，避免调用方到处判空。
     */
    public Map<Long, List<String>> detailCodesByCage(List<Long> cageIds) {
        Map<Long, List<String>> out = new LinkedHashMap<>();
        if (cageIds == null || cageIds.isEmpty()) return out;
        CageInfoField field = fieldMapper.selectByCanonical(SPECIAL_DETAIL_CANONICAL);
        if (field == null || field.getId() == null) return out;
        for (CageInfoValue v : valueMapper.selectByAnimalCageIds(cageIds)) {
            if (v == null || v.getAnimalCageId() == null || !field.getId().equals(v.getFieldId())) continue;
            List<String> codes = parseMulti(v.getValueJson());
            if (!codes.isEmpty()) out.put(v.getAnimalCageId(), codes);
        }
        return out;
    }

    /** 明细项的 item_code → 中文名（审计留痕 / 网格状态标签共用）；码表没配到就退回用码本身。 */
    public Map<String, String> detailItemLabels() {
        Map<String, String> out = new HashMap<>();
        CageInfoCodelist cl = codelistMapper.selectByCode(SPECIAL_DETAIL_DICT);
        if (cl == null || cl.getId() == null) return out;
        for (CageInfoCodelistItem it : codelistItemMapper.selectByCodelistId(cl.getId())) {
            if (it != null && it.getItemCode() != null) out.put(it.getItemCode(), it.getItemLabel());
        }
        return out;
    }

    /** 该笼位某个状态标记当前是否 on。 */
    private boolean isStatusOn(Long animalCageId, String canonical) {
        CageInfoField f = fieldMapper.selectByCanonical(canonical);
        if (f == null || f.getId() == null) return false;
        for (CageInfoValue v : valueMapper.selectByAnimalCageId(animalCageId)) {
            if (v != null && f.getId().equals(v.getFieldId())) return Boolean.TRUE.equals(v.getValueBool());
        }
        return false;
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
        // 幂等：该笼位已有表单值（已同步/已seed）则跳过，避免每次启动/认领用陈旧的 detail 覆盖同步结果，并与同步并发写死锁。
        if (!valueMapper.selectByAnimalCageId(animalCageId).isEmpty()) return;
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

        // 5 个状态标记（4 Yn + 合笼）不从此迁移：ARO 源只在 /back 的 cageBoxVo（writeStatusFlagsFromBack 直写）。
        // cage_cell_detail.needs_* 是手动 toggle/历史残留，可能陈旧，若在此迁移会在每次启动/认领时用 stale 值覆盖同步结果。

        upsertText(animalCageId, fieldIdByCanonical, "project_pi_name", detail.getProjectPiName());
        upsertText(animalCageId, fieldIdByCanonical, "project_name", detail.getProjectName());
        upsertText(animalCageId, fieldIdByCanonical, "department_name", detail.getDepartmentName());
        upsertText(animalCageId, fieldIdByCanonical, "aup_number", detail.getAupNumber());
        upsertText(animalCageId, fieldIdByCanonical, "special_breeding_name", detail.getSpecialBreedingName());
        upsertText(animalCageId, fieldIdByCanonical, "special_breeding_desc", detail.getSpecialBreedingDesc());
        upsertText(animalCageId, fieldIdByCanonical, "experimenter_name", detail.getExperimenterName());
        upsertText(animalCageId, fieldIdByCanonical, "lab_assistant_name", detail.getLabAssistantName());
        // 动物品系是单值文本（data_type=STRING → value_string）。
        // 早先按 ENUM_MULTI 包成 JSON 数组写 value_json，与列的对应关系对不上，已改回文本。
        upsertText(animalCageId, fieldIdByCanonical, "animal_strain_name", detail.getAnimalStrainName());
        upsertText(animalCageId, fieldIdByCanonical, "animal_sex", detail.getAnimalSex());
        upsertText(animalCageId, fieldIdByCanonical, "animal_week_age", detail.getAnimalWeekAge());
        upsertText(animalCageId, fieldIdByCanonical, "animal_come_from", detail.getAnimalComeFrom());

        // 本地扩展字段（非 ARO 映射，属系统自有存储）
        upsertTextBlock(animalCageId, fieldIdByCanonical, "experiment_desc", detail.getExperimentDesc());
        upsertJson(animalCageId, fieldIdByCanonical, "images_json", detail.getImagesJson());
        upsertJson(animalCageId, fieldIdByCanonical, "extra_data", detail.getExtraData());
    }

    /**
     * 分笼继承：把母笼的笼位级值整表复制到子笼（fill_source=INHERIT）作为基础信息。
     * 不自动清空任何字段——分笼后需要修正的数量/性别等由用户在子笼表单上按 editable 逐项改。
     */
    @Transactional
    public void copyFrom(Long sourceAnimalCageId, Long targetAnimalCageId, String operatorId) {
        if (sourceAnimalCageId == null || targetAnimalCageId == null) return;
        Map<Long, Map<String, Object>> before = infoIndex(targetAnimalCageId);
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
        auditDiff(before, targetAnimalCageId, "DIVIDE", operatorId);
    }

    /**
     * 随占用迁移的字段 = 占用者/动物/状态标记 + 实验记录照片。
     * 不含课题组归属（project_pi_name、project_name、department_name、aup_number）——
     * 那些锚笼位分配，不随转移走，否则会把目标笼位的 AUP 归属覆盖成源笼位的，与 cage_cell_detail 的固定字段对不上。
     */
    private Set<String> transferableCanonicals() {
        return java.util.stream.Stream.concat(ARCHIVE_CLEAR_CANONICALS.stream(), LOCAL_FIELD_CANONICALS.stream())
                .collect(java.util.stream.Collectors.toUnmodifiableSet());
    }

    /** 转移：把可迁移字段从 source 复制到 target（不清理 target 其余字段）。 */
    @Transactional
    public void copyTransferableFields(Long sourceAnimalCageId, Long targetAnimalCageId, String fillSource, String operatorId) {
        if (sourceAnimalCageId == null || targetAnimalCageId == null) return;
        Map<Long, Map<String, Object>> before = infoIndex(targetAnimalCageId);
        Set<String> transferable = transferableCanonicals();
        Map<Long, CageInfoField> fieldById = new HashMap<>();
        for (CageInfoField f : fieldMapper.selectAll()) {
            if (f != null && f.getId() != null && transferable.contains(f.getCanonical())) {
                fieldById.put(f.getId(), f);
            }
        }
        for (CageInfoValue v : valueMapper.selectByAnimalCageId(sourceAnimalCageId)) {
            if (v == null || !fieldById.containsKey(v.getFieldId())) continue;
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
        auditDiff(before, targetAnimalCageId, fillSource, operatorId);
    }

    /** 仅复制占用字段（不复制笼位固有字段）。target 上先 upsert，不清理 target 既有其他字段。 */
    @Transactional
    public void copyOccupancyFields(Long sourceAnimalCageId, Long targetAnimalCageId, String fillSource, String operatorId) {
        if (sourceAnimalCageId == null || targetAnimalCageId == null) return;
        Map<Long, Map<String, Object>> before = infoIndex(targetAnimalCageId);
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
        auditDiff(before, targetAnimalCageId, fillSource, operatorId);
    }

    /** 清空某笼位的占用字段（转笼/退出后，源笼位回到空闲的占用维度）。 */
    @Transactional
    public void clearOccupancyFields(Long animalCageId, String changeType, String operatorId) {
        if (animalCageId == null) return;
        Map<Long, Map<String, Object>> before = infoIndex(animalCageId);
        for (CageInfoField f : occupancyFieldById().values()) {
            valueMapper.deleteByAnimalCageAndField(animalCageId, f.getId());
        }
        auditDiff(before, animalCageId, changeType, operatorId);
    }

    /**
     * 按 canonical 精确清空表单值 —— 只撤销调用方自己写进去的那几个字段，
     * 不动笼位上其它既有值（订购预定释放时用）。
     */
    @Transactional
    public void clearByCanonicals(Long animalCageId, Collection<String> canonicals,
                                  String changeType, String operatorId) {
        if (animalCageId == null || canonicals == null || canonicals.isEmpty()) return;
        Set<String> targets = new LinkedHashSet<>(canonicals);
        Map<Long, Map<String, Object>> before = infoIndex(animalCageId);
        for (CageInfoField f : fieldMapper.selectAll()) {
            if (f == null || f.getId() == null || f.getCanonical() == null) continue;
            if (targets.contains(f.getCanonical())) {
                valueMapper.deleteByAnimalCageAndField(animalCageId, f.getId());
            }
        }
        auditDiff(before, animalCageId, changeType, operatorId);
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
    public void clearArchiveFields(Long animalCageId, String changeType, String operatorId) {
        if (animalCageId == null) return;
        Map<Long, Map<String, Object>> before = infoIndex(animalCageId);
        for (CageInfoField f : fieldMapper.selectAll()) {
            if (f == null || f.getId() == null || f.getCanonical() == null) continue;
            if (ARCHIVE_CLEAR_CANONICALS.contains(f.getCanonical())) {
                valueMapper.deleteByAnimalCageAndField(animalCageId, f.getId());
            }
        }
        auditDiff(before, animalCageId, changeType, operatorId);
    }

    // ── 结构性变更留痕 ──

    /** 表单值索引 fieldId → {canonical,label,value}，用于写前/写后逐字段 diff。 */
    private Map<Long, Map<String, Object>> infoIndex(Long animalCageId) {
        Map<Long, Map<String, Object>> out = new LinkedHashMap<>();
        for (Map<String, Object> row : getInfo(animalCageId)) {
            Long fid = toLong(row.get("fieldId"));
            if (fid != null) out.put(fid, row);
        }
        return out;
    }

    /**
     * 结构性变更（分笼/转移/归档/退出/取消分配）的字段级留痕。
     * 这些路径直接写 cage_info_value，绕过 updateInfo，不 diff 就整段历史空白。
     */
    private void auditDiff(Map<Long, Map<String, Object>> before, Long animalCageId,
                           String changeType, String operatorId) {
        Map<Long, Map<String, Object>> after = infoIndex(animalCageId);
        Set<Long> fieldIds = new LinkedHashSet<>(before.keySet());
        fieldIds.addAll(after.keySet());
        for (Long fieldId : fieldIds) {
            Map<String, Object> b = before.get(fieldId);
            Map<String, Object> a = after.get(fieldId);
            String beforeValue = b == null ? null : stringify(b.get("value"));
            String afterValue = a == null ? null : stringify(a.get("value"));
            if (Objects.equals(beforeValue, afterValue)) continue;
            Map<String, Object> meta = a != null ? a : b;
            auditService.logDataChange(changeType, "cage_box", animalCageId, String.valueOf(animalCageId), null,
                    "animal_cage", animalCageId, String.valueOf(animalCageId),
                    String.valueOf(meta.get("canonical")), String.valueOf(meta.get("label")),
                    beforeValue, afterValue, operatorId);
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
            // 多值字段（ENUM_MULTI）返回数组，前端直接勾选；FILE 仍是原始 JSON 字符串（images_json 等按字符串用）。
            case COL_JSON -> isMultiValue(field) ? parseMulti(v.getValueJson()) : v.getValueJson();
            default -> null;
        };
    }

    private static boolean isMultiValue(CageInfoField field) {
        return field != null && "ENUM_MULTI".equalsIgnoreCase(field.getDataType());
    }

    /**
     * 多值字段写入规范化：前端传数组直接序列化；同步路径（ARO 单值如 animalStrainName）传裸字符串则包成单元素数组，
     * 保证 value_json 里始终是合法 JSON 数组，读侧不用猜格式。
     */
    static String jsonValue(CageInfoField field, Object raw) {
        if (raw instanceof Collection<?> c) return JSON.toJSONString(c);
        if (raw instanceof String s) {
            String t = s.trim();
            if (!isMultiValue(field) || t.startsWith("[")) return s;
            return JSON.toJSONString(List.of(t));
        }
        throw new TwinBusinessException(400, "字段 " + field.getCanonical() + " 需要文本类型");
    }

    /** 读多值字段：兼容历史裸字符串（当成单项）。 */
    static List<String> parseMulti(String json) {
        if (json == null || json.isBlank()) return List.of();
        String t = json.trim();
        if (!t.startsWith("[")) return List.of(t);
        try {
            List<?> arr = JSON.parseArray(t);
            List<String> out = new ArrayList<>();
            for (Object o : arr) if (o != null) out.add(String.valueOf(o));
            return out;
        } catch (Exception e) {
            return List.of(t);
        }
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
                if (COL_JSON.equals(col)) {
                    v.setValueJson(jsonValue(field, raw));
                    return true;
                }
                if (!(raw instanceof String)) {
                    throw new TwinBusinessException(400, "字段 " + field.getCanonical() + " 需要文本类型");
                }
                switch (col) {
                    case COL_TEXT -> v.setValueText((String) raw);
                    case COL_STRING -> v.setValueString((String) raw);
                    case COL_DATE -> v.setValueDate((String) raw);
                    case COL_DATETIME -> v.setValueDatetime((String) raw);
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
    private void upsertTextBlock(Long animalCageId, Map<String, Long> byCanonical, String canonical, String value) {        if (value == null || value.isBlank()) return;
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
