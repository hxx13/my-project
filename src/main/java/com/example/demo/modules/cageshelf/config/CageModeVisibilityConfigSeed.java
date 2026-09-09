package com.example.demo.modules.cageshelf.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 笼架「模式可见性」配置播种 — 首次启动写入 sys_system_config_def。
 * 每个模式一条 STRING 配置，值为逗号分隔的身份 code（见 CageModeVisibilityService 默认值）。
 * valueType 用 STRING，多选由设置面板前端对 cage_mode 模块做自定义渲染，落库仍是逗号分隔字符串。
 */
@Component
@Order(132)
public class CageModeVisibilityConfigSeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CageModeVisibilityConfigSeed.class);
    private final JdbcTemplate jdbc;

    public CageModeVisibilityConfigSeed(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            def("booking", "SECRETARY", "预约模式可见身份（逗号分隔）");
            def("allocate", "BREEDING_GROUP_LEADER", "分配模式可见身份（逗号分隔）");
            def("reserve", "BREEDING_GROUP_LEADER", "预定模式可见身份（逗号分隔）");
            def("edit", "BREEDER,BREEDING_GROUP_LEADER", "状态模式可见身份（逗号分隔）");
            def("record", "BREEDER,BREEDING_GROUP_LEADER", "记录模式可见身份（逗号分隔）");
            def("archive", "BREEDER,BREEDING_GROUP_LEADER", "归档模式可见身份（逗号分隔）");
            def("confirm", "BREEDER,BREEDING_GROUP_LEADER", "确认模式可见身份（逗号分隔）");
            defOpManage();
            log.info("[cage-mode-config] 模式可见性配置就绪（7 个可配模式 + 分笼/转移操作身份，view 不可配）");
        } catch (Exception e) {
            log.warn("[cage-mode-config] 播种跳过: {}", e.getMessage());
        }
    }

    /**
     * 分笼/转移的额外操作身份：默认 饲养员 + 饲养组长。
     * 「占用者本人」恒定放行、不是可配项，所以不进配置值。
     */
    private void defOpManage() {
        String key = "cage.op.manage_identities";
        String def = "BREEDER,BREEDING_GROUP_LEADER";
        try {
            Integer exists = jdbc.queryForObject(
                    "SELECT COUNT(1) FROM sys_system_config_def WHERE module = ? AND config_key = ?",
                    Integer.class, "cage_mode", key);
            if (exists == null || exists == 0) {
                jdbc.update("""
                        INSERT INTO sys_system_config_def
                        (module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
                        VALUES (?, ?, ?, ?, 'STRING', NULL, ?, 0, 0, 0, NOW())
                        """,
                        "cage_mode", key, "分笼/转移额外操作身份（逗号分隔）",
                        "占用者本人恒定可操作，无需配置；此处配额外身份 code：BREEDER=饲养员 BREEDING_GROUP_LEADER=饲养组长",
                        def);
            }
            ensureRuntimeValue(key, def);
            // 早期版本把 OWNER 写进了配置值；现在占用者本人恒定放行，清掉这个已无意义的 token
            jdbc.update("UPDATE sys_system_config SET config_value = TRIM(BOTH ',' FROM REPLACE(config_value, 'OWNER,', '')) "
                    + "WHERE module = 'cage_mode' AND config_key = ? AND config_value LIKE '%OWNER%'", key);
        } catch (Exception e) {
            log.warn("[cage-mode-config] 配置定义播种失败 {}: {}", key, e.getMessage());
        }
    }

    /** 设置中心按 id 更新值，缺运行值行时前端显示「配置项未初始化」无法保存，故幂等补行。 */
    private void ensureRuntimeValue(String configKey, String defaultValue) {
        try {
            Integer exists = jdbc.queryForObject(
                    "SELECT COUNT(1) FROM sys_system_config WHERE module = ? AND config_key = ?",
                    Integer.class, "cage_mode", configKey);
            if (exists != null && exists > 0) return;
            jdbc.update(
                    "INSERT INTO sys_system_config (module, config_key, config_value, update_time) VALUES (?, ?, ?, NOW())",
                    "cage_mode", configKey, defaultValue);
        } catch (Exception e) {
            log.warn("[cage-mode-config] 运行值播种失败 {}: {}", configKey, e.getMessage());
        }
    }

    private void def(String modeKey, String defaultCodes, String labelZh) {
        try {
            Integer exists = jdbc.queryForObject(
                    "SELECT COUNT(1) FROM sys_system_config_def WHERE module = ? AND config_key = ?",
                    Integer.class, "cage_mode", "cage.mode." + modeKey);
            if (exists != null && exists > 0) return;
            jdbc.update("""
                    INSERT INTO sys_system_config_def
                    (module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
                    VALUES (?, ?, ?, ?, 'STRING', NULL, ?, 0, 0, 0, NOW())
                    """,
                    "cage_mode", "cage.mode." + modeKey, labelZh,
                    "身份 code 逗号分隔：BREEDER=饲养员 BREEDING_GROUP_LEADER=饲养组长 SECRETARY=秘书（view 不可配）",
                    defaultCodes);
        } catch (Exception e) {
            log.warn("[cage-mode-config] 配置定义播种失败 cage.mode.{}: {}", modeKey, e.getMessage());
        }
    }
}
