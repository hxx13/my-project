package com.example.demo.modules.accessrule.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(102)
public class AccessRuleSchemaMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AccessRuleSchemaMigrator.class);

    private final JdbcTemplate jdbcTemplate;

    public AccessRuleSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS access_rule (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        rule_code VARCHAR(32) NULL COMMENT '展示编号，如 AR000001，插入后回填',
                        name VARCHAR(256) NOT NULL COMMENT '规则名称',
                        enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY uk_access_rule_code (rule_code)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门禁规则（扫码按人+房间匹配）'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS access_rule_item (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        rule_id BIGINT NOT NULL COMMENT '所属规则',
                        room_id VARCHAR(64) NOT NULL COMMENT 'ARO 房间 id',
                        channel_codes_json TEXT NULL COMMENT 'JSON 数组：大华通道 resourceCode',
                        door_group_ids_json TEXT NULL COMMENT 'JSON 数组：门组 id',
                        sort_order INT NOT NULL DEFAULT 0,
                        CONSTRAINT fk_ari_rule FOREIGN KEY (rule_id) REFERENCES access_rule (id) ON DELETE CASCADE,
                        KEY idx_ari_rule (rule_id),
                        KEY idx_ari_room (room_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门禁规则子项（房间+门组+通道）'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS access_rule_item_user (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        item_id BIGINT NOT NULL,
                        room_id VARCHAR(64) NOT NULL COMMENT '与 item 一致，便于唯一约束',
                        aro_user_id VARCHAR(64) NOT NULL COMMENT 'ARO 人员 id',
                        CONSTRAINT fk_ariu_item FOREIGN KEY (item_id) REFERENCES access_rule_item (id) ON DELETE CASCADE,
                        UNIQUE KEY uk_access_rule_room_user (room_id, aro_user_id),
                        KEY idx_ariu_lookup (room_id, aro_user_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='规则子项与人员（防 room+user 重叠）'
                    """);
            log.info("[access-rule-schema] access_rule 表已就绪");
        } catch (Exception e) {
            log.error("[access-rule-schema] 迁移失败: {}", e.getMessage());
        }
    }
}
