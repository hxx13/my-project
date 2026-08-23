package com.example.demo.modules.cageshelf.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * 笼位字段字典表迁移 — 建 cage_info_field 表并从 aro_field_mapping.json 播种 30 个 canonical 字段。
 * 幂等：CREATE TABLE IF NOT EXISTS + INSERT ... ON DUPLICATE KEY UPDATE（键为 canonical）。
 * 排在 {@link CageShelfSchemaMigrator}（@Order(130)）之后执行。
 */
@Component
@Order(132)
public class CageInfoSchemaMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CageInfoSchemaMigrator.class);
    private static final String TABLE = "cage_info_field";
    private static final String CLAIM_VALUE_TABLE = "cage_claim_info_value";
    private static final String MAPPING_RESOURCE = "aro_field_mapping.json";

    /** canonical → 中文显示名（任务指定的精确文案） */
    private static final Map<String, String> LABELS = buildLabelMap();

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public CageInfoSchemaMigrator(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            createTableIfNeeded();
            createClaimValueTableIfNeeded();
            seedFromMapping();
        } catch (Exception e) {
            log.error("[cage-info-schema] 迁移失败: {}", e.getMessage(), e);
        }
    }

    private void createTableIfNeeded() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS cage_info_field (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    canonical VARCHAR(64) NOT NULL COMMENT '本地规范字段名',
                    label VARCHAR(128) NOT NULL COMMENT '中文显示名',
                    data_type VARCHAR(16) NOT NULL COMMENT 'number/text/boolean',
                    dict_key VARCHAR(64) NULL COMMENT '码表键',
                    role VARCHAR(16) NOT NULL DEFAULT 'VALUE' COMMENT '字段角色',
                    required VARCHAR(8) NOT NULL DEFAULT 'NO' COMMENT '是否必填 YES/NO',
                    show_when JSON NULL COMMENT '条件显示规则',
                    sync_source VARCHAR(256) NULL COMMENT 'ARO字段路径',
                    config JSON NULL COMMENT '字段配置',
                    sort INT NULL COMMENT '排序值',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_cage_info_field_canonical (canonical),
                    KEY idx_cage_info_field_sort (sort)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼位字段字典表'
                """);
        log.info("[cage-info-schema] {} 表已就绪", TABLE);
    }

    private void createClaimValueTableIfNeeded() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS cage_claim_info_value (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    claim_id BIGINT NOT NULL COMMENT '认领ID → cage_claims.id',
                    field_id BIGINT NOT NULL COMMENT '字段ID → cage_info_field.id',
                    value_string VARCHAR(512) NULL,
                    value_text TEXT NULL,
                    value_int BIGINT NULL,
                    value_decimal DECIMAL(18,4) NULL,
                    value_date VARCHAR(32) NULL,
                    value_datetime VARCHAR(32) NULL,
                    value_bool TINYINT(1) NULL,
                    value_json JSON NULL,
                    fill_source VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_claim_field (claim_id, field_id),
                    KEY idx_cage_claim_info_value_claim (claim_id),
                    KEY idx_cage_claim_info_value_field (field_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='认领表单实例 EAV 值表'
                """);
        log.info("[cage-info-schema] {} 表已就绪", CLAIM_VALUE_TABLE);
    }

    private void seedFromMapping() {
        JsonNode root = loadMapping();
        if (root == null) {
            log.warn("[cage-info-schema] 未解析到 {}，跳过字段播种", MAPPING_RESOURCE);
            return;
        }
        JsonNode mappings = root.get("mappings");
        if (mappings == null || !mappings.isArray()) {
            log.warn("[cage-info-schema] {} 缺少 mappings 数组", MAPPING_RESOURCE);
            return;
        }

        int sort = 1;
        int seeded = 0;
        for (JsonNode m : mappings) {
            String canonical = text(m.get("canonical"));
            if (canonical == null || canonical.isEmpty()) {
                continue;
            }
            String syncSource = resolveSyncSource(m.get("sources"));
            String dataType = mapDataType(text(m.get("type")));
            String label = LABELS.getOrDefault(canonical, canonical);
            upsert(canonical, label, dataType, syncSource, sort++);
            seeded++;
        }
        log.info("[cage-info-schema] cage_info_field 播种完成，共 {} 条 canonical", seeded);
    }

    private void upsert(String canonical, String label, String dataType, String syncSource, int sort) {
        // role/required 使用默认值；dict_key/show_when/config 暂无种子来源，置 NULL。
        jdbcTemplate.update(
            "INSERT INTO cage_info_field " +
            "(canonical, label, data_type, dict_key, role, required, show_when, sync_source, config, sort, created_at, updated_at) " +
            "VALUES (?, ?, ?, NULL, 'VALUE', 'NO', NULL, ?, NULL, ?, NOW(), NOW()) " +
            "ON DUPLICATE KEY UPDATE " +
            "label = VALUES(label), data_type = VALUES(data_type), " +
            "sync_source = VALUES(sync_source), sort = VALUES(sort), updated_at = NOW()",
            canonical, label, dataType, syncSource, sort);
    }

    /** 读取 classpath 上的映射文件；缺失或解析失败返回 null（no-op）。 */
    private JsonNode loadMapping() {
        try {
            ClassPathResource resource = new ClassPathResource(MAPPING_RESOURCE);
            if (!resource.exists()) {
                log.warn("[cage-info-schema] classpath 未找到 {}", MAPPING_RESOURCE);
                return null;
            }
            try (InputStream in = resource.getInputStream()) {
                return objectMapper.readTree(in);
            }
        } catch (Exception e) {
            log.warn("[cage-info-schema] 解析 {} 失败: {}", MAPPING_RESOURCE, e.getMessage());
            return null;
        }
    }

    /**
     * sync_source = sources.list 的首个值；list 缺失时依次回退 back / book。
     * 每个 source 值可能是字符串或字符串数组，统一取首个元素。
     */
    private String resolveSyncSource(JsonNode sources) {
        if (sources == null || !sources.isObject()) {
            return null;
        }
        String[] keys = {"list", "back", "book"};
        for (String key : keys) {
            JsonNode v = sources.get(key);
            if (v == null || v.isNull()) {
                continue;
            }
            if (v.isArray()) {
                if (v.size() > 0 && v.get(0).isTextual()) {
                    return v.get(0).asText();
                }
            } else if (v.isTextual()) {
                return v.asText();
            }
        }
        return null;
    }

    private String mapDataType(String type) {
        if (type == null) {
            return "text";
        }
        switch (type) {
            case "long":
            case "int":
                return "number";
            case "boolean":
                return "boolean";
            case "string":
            default:
                return "text";
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
