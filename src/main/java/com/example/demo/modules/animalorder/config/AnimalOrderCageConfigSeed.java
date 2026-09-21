package com.example.demo.modules.animalorder.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 动物订购 → 笼位预定 的可配项播种。
 *
 * <p>两条都写「定义行 + 运行值行」：设置中心按运行值行的 id 更新，
 * 只写定义不写运行值会让面板显示「配置项未初始化」而存不了。
 */
@Component
@Order(134)
public class AnimalOrderCageConfigSeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AnimalOrderCageConfigSeed.class);

    public static final String MODULE = "animal_order";
    /** 单个笼位可预定的数量上限（超过则要求换笼位）。 */
    public static final String KEY_CAPACITY = "cage_capacity_per_cage";
    /** 规格模板名 → 笼位字段 canonical 的映射（JSON）。 */
    public static final String KEY_SPEC_MAPPING = "cage_spec_field_mapping";

    public static final String DEFAULT_CAPACITY = "5";
    /**
     * 「规格」键=最后一级物品名。本部署的规格卡片名就是周龄（「7-8W」），映射到 animal_week_age。
     */
    public static final String DEFAULT_SPEC_MAPPING = "{\"性别\":\"animal_sex\",\"规格\":\"animal_week_age\",\"品系\":\"animal_strain_name\"}";
    /** 旧默认值（只有模板名键，没有「规格」）。升级只在运行值还是它时发生。 */
    static final String LEGACY_SPEC_MAPPING = "{\"性别\":\"animal_sex\",\"周龄\":\"animal_week_age\",\"品系\":\"animal_strain_name\"}";
    private static final String SPEC_MAPPING_DESC =
            "JSON 对象，键=订购规格模板名（如「性别」）或「规格」（最后一级物品名），值=笼位字段 canonical。命中后把该值写进笼位表单。";

    private final JdbcTemplate jdbc;

    public AnimalOrderCageConfigSeed(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            def(KEY_CAPACITY, "NUMBER", "单个笼位可预定数量上限",
                    "加购时一个笼位最多能放多少只；超出要求换笼位。", DEFAULT_CAPACITY);
            def(KEY_SPEC_MAPPING, "STRING", "规格模板 → 笼位字段映射",
                    SPEC_MAPPING_DESC,
                    DEFAULT_SPEC_MAPPING);
            upgradeSpecMapping();
            log.info("[animal-order-cage-config] 笼位预定配置就绪");
        } catch (Exception e) {
            log.warn("[animal-order-cage-config] 播种跳过: {}", e.getMessage());
        }
    }

    private void def(String key, String valueType, String labelZh, String description, String defaultValue) {
        try {
            Integer exists = jdbc.queryForObject(
                    "SELECT COUNT(1) FROM sys_system_config_def WHERE module = ? AND config_key = ?",
                    Integer.class, MODULE, key);
            if (exists == null || exists == 0) {
                jdbc.update("""
                        INSERT INTO sys_system_config_def
                        (module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
                        VALUES (?, ?, ?, ?, ?, NULL, ?, 0, 0, 0, NOW())
                        """,
                        MODULE, key, labelZh, description, valueType, defaultValue);
            }
            ensureRuntimeValue(key, defaultValue);
        } catch (Exception e) {
            log.warn("[animal-order-cage-config] 配置播种失败 {}: {}", key, e.getMessage());
        }
    }

    /**
     * 老库的映射值里没有「规格」键 —— 不升级则「规格」维度的值（本部署=周龄）永远写不进笼位表单。
     * 只在**值一字不差等于旧默认**时改写：用户自己改过的映射不动。
     */
    private void upgradeSpecMapping() {
        try {
            jdbc.update("""
                    UPDATE sys_system_config SET config_value = ?
                    WHERE module = ? AND config_key = ? AND config_value = ?
                    """, DEFAULT_SPEC_MAPPING, MODULE, KEY_SPEC_MAPPING, LEGACY_SPEC_MAPPING);
            jdbc.update("""
                    UPDATE sys_system_config_def SET default_value = ?, description = ?
                    WHERE module = ? AND config_key = ? AND default_value = ?
                    """, DEFAULT_SPEC_MAPPING, SPEC_MAPPING_DESC, MODULE, KEY_SPEC_MAPPING, LEGACY_SPEC_MAPPING);
        } catch (Exception e) {
            log.warn("[animal-order-cage-config] 规格映射升级跳过: {}", e.getMessage());
        }
    }

    /** 设置中心按 id 更新值，缺运行值行时前端显示「配置项未初始化」无法保存，故幂等补行。 */
    private void ensureRuntimeValue(String configKey, String defaultValue) {
        try {
            Integer exists = jdbc.queryForObject(
                    "SELECT COUNT(1) FROM sys_system_config WHERE module = ? AND config_key = ?",
                    Integer.class, MODULE, configKey);
            if (exists != null && exists > 0) return;
            jdbc.update(
                    "INSERT INTO sys_system_config (module, config_key, config_value, update_time) VALUES (?, ?, ?, NOW())",
                    MODULE, configKey, defaultValue);
        } catch (Exception e) {
            log.warn("[animal-order-cage-config] 运行值播种失败 {}: {}", configKey, e.getMessage());
        }
    }
}
