package com.example.demo.modules.cageshelf.config;

import com.example.demo.modules.nhp.entity.CrfField;
import com.example.demo.modules.nhp.entity.CrfFieldDictionary;
import com.example.demo.modules.nhp.mapper.CrfFieldDictionaryMapper;
import com.example.demo.modules.nhp.mapper.CrfFieldMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

/**
 * 笼位字段字典种子 — 把笼位字段字典灌入 NHP 的 crf_field 体系，成为一个 NHP「数据域套」。
 *
 * <p>在 crf_field_dictionary 建立/确保 dictKey="cage" 的字典套壳，再按
 * classpath:aro_field_mapping.json 的 30 个 canonical 字段 upsert crf_field 行
 * （唯一键为 dictionary_id + field_code）。种子字段直接置 FROZEN（发布态），不绑定码表。
 *
 * <p>sync_source 不落库：ARO 字段路径以 aro_field_mapping.json 为唯一查找来源。
 *
 * <p>幂等：重复启动只回填漂移元数据，不重复插入。排在 {@link CageInfoSchemaMigrator}（@Order(132)）
 * 之后、NHP 种子（无 @Order，LOWEST_PRECEDENCE）之前执行；crf_field 表由
 * EmbeddedTwinSystemCoreDdlBootstrap 在 bean 初始化早期建好，无需依赖 NHP 种子。
 */
@Component
@Order(2000)
public class CageNhpFieldSeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CageNhpFieldSeed.class);

    private static final String DICT_KEY = "cage";
    private static final String DICT_NAME = "笼位详情字段字典";
    private static final String DICT_SPECIES = "笼位";
    private static final String DICT_DESCRIPTION = "笼位占用信息字段（由 aro_field_mapping.json 灌种）";
    private static final String MAPPING_RESOURCE = "aro_field_mapping.json";

    /** canonical → 中文显示名（任务指定的精确文案） */
    private static final Map<String, String> LABELS = buildLabelMap();

    private final CrfFieldDictionaryMapper dictionaryMapper;
    private final CrfFieldMapper fieldMapper;
    private final ObjectMapper objectMapper;

    public CageNhpFieldSeed(CrfFieldDictionaryMapper dictionaryMapper,
                            CrfFieldMapper fieldMapper,
                            ObjectMapper objectMapper) {
        this.dictionaryMapper = dictionaryMapper;
        this.fieldMapper = fieldMapper;
        this.objectMapper = objectMapper;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            CrfFieldDictionary dict = ensureDictionary();
            if (dict == null || dict.getId() == null) {
                log.warn("[cage-nhp-seed] 无法确定 cage 字典 id，跳过字段播种");
                return;
            }
            int seeded = seedFields(dict.getId());
            log.info("[cage-nhp-seed] cage 数据域套就绪（dictId={}），字段 {} 条", dict.getId(), seeded);
        } catch (Exception e) {
            log.error("[cage-nhp-seed] 种子加载失败: {}", e.getMessage(), e);
        }
    }

    /** 建立/确保 cage 字典套壳；缺失则新建，已软删则复活，均不覆盖存量元数据。 */
    private CrfFieldDictionary ensureDictionary() {
        CrfFieldDictionary row = dictionaryMapper.findByDictKey(DICT_KEY);
        if (row == null) {
            row = new CrfFieldDictionary();
            row.setDictKey(DICT_KEY);
            row.setName(DICT_NAME);
            row.setSpecies(DICT_SPECIES);
            row.setDescription(DICT_DESCRIPTION);
            row.setStructureJson("{\"domains\":[]}");
            row.setVersion(1);
            row.setStatus("ACTIVE");
            row.setActive(true);
            dictionaryMapper.insert(row);
            return row;
        }
        if (!Boolean.TRUE.equals(row.getActive())) {
            dictionaryMapper.reactivate(row.getId());
            row.setActive(true);
            row.setStatus("ACTIVE");
        }
        return row;
    }

    /** 按 aro_field_mapping.json 的 mappings[] 幂等 upsert 30 个 crf_field 行。 */
    private int seedFields(Long dictId) {
        JsonNode root = loadMapping();
        if (root == null) {
            log.warn("[cage-nhp-seed] 未解析到 {}，跳过字段播种", MAPPING_RESOURCE);
            return 0;
        }
        JsonNode mappings = root.get("mappings");
        if (mappings == null || !mappings.isArray()) {
            log.warn("[cage-nhp-seed] {} 缺少 mappings 数组", MAPPING_RESOURCE);
            return 0;
        }
        int seeded = 0;
        for (JsonNode m : mappings) {
            String canonical = text(m.get("canonical"));
            if (canonical == null || canonical.isEmpty()) {
                continue;
            }
            String dataType = mapDataType(text(m.get("type")));
            String nameCn = LABELS.getOrDefault(canonical, canonical);
            upsertField(dictId, canonical, nameCn, dataType);
            seeded++;
        }
        return seeded;
    }

    /** 唯一键 (dictionary_id, field_code) 幂等写入；复用 NhpSeedService 的冻结模式。 */
    private void upsertField(Long dictId, String fieldCode, String nameCn, String dataType) {
        CrfField existing = fieldMapper.findAnyByFieldCodeInDict(dictId, fieldCode);
        if (existing == null) {
            CrfField field = new CrfField();
            field.setDictionaryId(dictId);
            field.setFieldCode(fieldCode);
            field.setNameEn(fieldCode);
            field.setNameCn(nameCn);
            field.setDataType(dataType);
            field.setRequired("NO");
            field.setCodelistId(null);
            field.setStatus("FROZEN");
            field.setVersion(1);
            field.setActive(true);
            fieldMapper.insert(field);
            fieldMapper.updateFreeze(field.getId(), "FROZEN", LocalDateTime.now(), "cage-seed");
        } else {
            // 全量回填（字典权威），已活跃/软删行均可用 reactivateAndUpdate
            existing.setNameEn(fieldCode);
            existing.setNameCn(nameCn);
            existing.setDataType(dataType);
            existing.setRequired("NO");
            existing.setCodelistId(null);
            existing.setStatus("FROZEN");
            existing.setActive(true);
            fieldMapper.reactivateAndUpdate(existing);
            fieldMapper.updateFreeze(existing.getId(), "FROZEN", LocalDateTime.now(), "cage-seed");
        }
    }

    /** 读取 classpath 上的映射文件；缺失或解析失败返回 null（no-op）。 */
    private JsonNode loadMapping() {
        try {
            ClassPathResource resource = new ClassPathResource(MAPPING_RESOURCE);
            if (!resource.exists()) {
                log.warn("[cage-nhp-seed] classpath 未找到 {}", MAPPING_RESOURCE);
                return null;
            }
            try (InputStream in = resource.getInputStream()) {
                return objectMapper.readTree(in);
            }
        } catch (Exception e) {
            log.warn("[cage-nhp-seed] 解析 {} 失败: {}", MAPPING_RESOURCE, e.getMessage());
            return null;
        }
    }

    /** aro_field_mapping.json 的 type → NHP crf_field.data_type 精确值。 */
    private String mapDataType(String type) {
        if (type == null) {
            return "TEXT";
        }
        switch (type) {
            case "long":
            case "int":
                return "INTEGER";
            case "boolean":
                return "BOOLEAN";
            case "string":
            default:
                return "TEXT";
        }
    }

    private static String text(JsonNode node) {
        return node == null || node.isNull() ? null : node.asText();
    }

    private static Map<String, String> buildLabelMap() {
        Map<String, String> m = new HashMap<>();
        m.put("animal_cage_id", "笼位ID");
        m.put("position_x", "X坐标");
        m.put("position_y", "Y坐标");
        m.put("cage_type_code", "笼位状态");
        m.put("state", "状态码");
        m.put("state_label", "状态");
        m.put("rent_type", "租用类型");
        m.put("cage_name", "笼位名称");
        m.put("cage_box_code", "笼盒编号");
        m.put("cage_box_name", "笼盒名称");
        m.put("pi_name", "课题组长");
        m.put("project_pi_name", "项目组长");
        m.put("project_name", "项目名称");
        m.put("department_name", "部门");
        m.put("aup_number", "AUP注册号");
        m.put("needs_division", "需分笼");
        m.put("needs_special_feeding", "需特殊饲养");
        m.put("needs_transfer", "动物转移");
        m.put("has_health_abnormality", "健康异常");
        m.put("cohabitation_date", "合笼日期");
        m.put("special_breeding_name", "特殊饲养名称");
        m.put("special_breeding_desc", "特殊饲养描述");
        m.put("experimenter_name", "实验员");
        m.put("lab_assistant_name", "实验人员");
        m.put("animal_strain_name", "动物品系");
        m.put("animal_sex", "性别");
        m.put("animal_week_age", "周龄");
        m.put("animal_male_number", "雄性数量");
        m.put("animal_female_number", "雌性数量");
        m.put("animal_come_from", "动物来源");
        return m;
    }
}
