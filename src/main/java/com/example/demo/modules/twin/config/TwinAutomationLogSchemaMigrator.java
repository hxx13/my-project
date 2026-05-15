package com.example.demo.modules.twin.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(112)
public class TwinAutomationLogSchemaMigrator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(TwinAutomationLogSchemaMigrator.class);
    private final JdbcTemplate jdbcTemplate;

    public TwinAutomationLogSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS twin_automation_log (
                        id BIGINT PRIMARY KEY AUTO_INCREMENT,
                        automation_type VARCHAR(32) NOT NULL COMMENT '自动化类型',
                        event_key VARCHAR(128) NULL COMMENT '事件键',
                        trigger_type VARCHAR(32) NULL COMMENT '触发类型 TIMER/MANUAL/SYSTEM',
                        trigger_reason VARCHAR(255) NULL COMMENT '触发原因',
                        user_id VARCHAR(64) NULL COMMENT '关联用户',
                        target_id VARCHAR(128) NULL COMMENT '关联目标',
                        success TINYINT NOT NULL DEFAULT 1 COMMENT '是否成功',
                        detail TEXT NULL COMMENT '详细说明',
                        event_time DATETIME NOT NULL COMMENT '事件时间',
                        created_by VARCHAR(64) NULL COMMENT '创建来源',
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_event_time (event_time),
                        INDEX idx_auto_type_time (automation_type, event_time),
                        INDEX idx_trigger_type_time (trigger_type, event_time),
                        INDEX idx_user_time (user_id, event_time)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='自动化行为日志'
                    """);
            log.info("[twin-automation-log-schema] twin_automation_log 表已就绪");
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS twin_automation_display_map (
                        id BIGINT PRIMARY KEY AUTO_INCREMENT,
                        code_type VARCHAR(32) NOT NULL COMMENT 'AUTOMATION_TYPE/EVENT_KEY/TRIGGER_TYPE/TRIGGER_REASON',
                        code_value VARCHAR(255) NOT NULL COMMENT '原始码值',
                        label_zh VARCHAR(255) NOT NULL COMMENT '展示用中文',
                        remark VARCHAR(500) NULL COMMENT '备注',
                        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY uk_type_value (code_type, code_value)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='自动化日志展示名称覆盖'
                    """);
            log.info("[twin-automation-log-schema] twin_automation_display_map 表已就绪");
        } catch (Exception e) {
            log.error("[twin-automation-log-schema] 迁移失败: {}", e.getMessage());
        }
    }
}
