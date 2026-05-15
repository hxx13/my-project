package com.example.demo.modules.twin.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 历史库可能缺少 {@code room_config.capacity_bind_room_id}（init 脚本未执行时）。
 * 启动时幂等补齐，避免 RoomConfigMapper 查询 Unknown column。
 */
@Component
@Order(2)
public class RoomConfigSchemaMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(RoomConfigSchemaMigrator.class);

    private final JdbcTemplate jdbcTemplate;

    public RoomConfigSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            ensureColumnExists(
                    "room_config",
                    "capacity_bind_room_id",
                    "ALTER TABLE room_config ADD COLUMN capacity_bind_room_id VARCHAR(2000) NULL "
                            + "COMMENT '流水 room_id：可多值逗号分隔，满员/监控索引用'");
            widenCapacityBindColumnIfNeeded();
            log.info("[twin-schema] room_config 列已与 RoomConfigMapper 对齐");
        } catch (Exception e) {
            log.error("[twin-schema] room_config 迁移失败（请检查 DB 账号是否有 ALTER 权限）: {}", e.getMessage(), e);
        }
    }

    private void ensureColumnExists(String tableName, String columnName, String alterSql) {
        Integer count = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(1) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = ?
                  AND COLUMN_NAME = ?
                """,
                Integer.class,
                tableName,
                columnName
        );
        if (count != null && count == 0) {
            jdbcTemplate.execute(alterSql);
            log.info("[twin-schema] 已添加列 {}.{}", tableName, columnName);
        }
    }

    /** 早期 VARCHAR(50) 不足以存多个 room_id，幂等加宽 */
    private void widenCapacityBindColumnIfNeeded() {
        Integer exists = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(1) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'room_config'
                  AND COLUMN_NAME = 'capacity_bind_room_id'
                """,
                Integer.class
        );
        if (exists == null || exists == 0) {
            return;
        }
        Long maxLen = jdbcTemplate.queryForObject(
                """
                SELECT COALESCE(CHARACTER_MAXIMUM_LENGTH, 0)
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'room_config'
                  AND COLUMN_NAME = 'capacity_bind_room_id'
                """,
                Long.class
        );
        if (maxLen != null && maxLen > 0 && maxLen < 2000) {
            jdbcTemplate.execute(
                    "ALTER TABLE room_config MODIFY COLUMN capacity_bind_room_id VARCHAR(2000) NULL "
                            + "COMMENT '流水 room_id：可多值逗号分隔，满员/监控索引用'");
            log.info("[twin-schema] capacity_bind_room_id 已加宽至 VARCHAR(2000)");
        }
    }
}
