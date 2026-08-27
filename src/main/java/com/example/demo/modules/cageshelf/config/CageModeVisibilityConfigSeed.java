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
            log.info("[cage-mode-config] 模式可见性配置就绪（7 个可配模式，view 不可配）");
        } catch (Exception e) {
            log.warn("[cage-mode-config] 播种跳过: {}", e.getMessage());
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
