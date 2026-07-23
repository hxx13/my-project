package com.example.demo.modules.telemetry.bootstrap;

import com.example.demo.modules.telemetry.service.TelemetryFacilityLayoutRulesService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 在系统设置中注册「动物房设施布局」JSON 配置项（若定义不存在则插入）；与
 * {@link com.example.demo.modules.telemetry.service.TelemetryFacilityLayoutRulesService} 同键。
 */
@Component
@Order(125)
public class TelemetryFacilityLayoutConfigSeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(TelemetryFacilityLayoutConfigSeed.class);

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public TelemetryFacilityLayoutConfigSeed(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            ensureDef();
        } catch (Exception e) {
            log.warn("[telemetry_facility] 写入 sys_system_config_def 跳过: {}", e.getMessage());
        }
    }

    private void ensureDef() {
        String module = TelemetryFacilityLayoutRulesService.MODULE;
        String configKey = TelemetryFacilityLayoutRulesService.CONFIG_KEY_RULES_JSON;
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM sys_system_config_def WHERE module = ? AND config_key = ?",
                Integer.class,
                module,
                configKey);
        if (cnt != null && cnt > 0) {
            return;
        }
        String defaultJson = TelemetryFacilityLayoutRulesService.defaultRulesJsonPretty(objectMapper);
        jdbcTemplate.update(
                """
                        INSERT INTO sys_system_config_def
                        (module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                        """,
                module,
                configKey,
                "动物房设施布局规则（JSON）",
                "路径折叠 facilitySmallRoomKeywords；供水/动力站/锅炉房标题行分级；地下室 Web chrome。version 须为 1。保存后立即生效（服务端约 60s 内缓存刷新）。",
                "STRING",
                null,
                defaultJson,
                0,
                0,
                0);
        log.info("[telemetry_facility] 已插入配置定义 {}.{}", module, configKey);
    }
}
