package com.example.demo.modules.auth.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 历史库可能缺少与 {@code UserMapper} 对齐的列（init 脚本未自动执行时）。
 * 启动时幂等补齐，避免 Unknown column 运行时错误。
 */
@Component
@Order(1)
public class SysUserSchemaMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SysUserSchemaMigrator.class);

    private final JdbcTemplate jdbcTemplate;

    public SysUserSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            ensureColumnExists("sys_user", "status",
                    "ALTER TABLE sys_user ADD COLUMN status TINYINT NOT NULL DEFAULT 1 COMMENT '账号状态:1启用,0禁用'");
            ensureColumnExists("sys_user", "password_reset_required",
                    "ALTER TABLE sys_user ADD COLUMN password_reset_required TINYINT NOT NULL DEFAULT 0 COMMENT '是否需在个人中心改密:1是,0否'");
            ensureColumnExists("sys_user", "display_nickname",
                    "ALTER TABLE sys_user ADD COLUMN display_nickname VARCHAR(64) NULL COMMENT '展示昵称（无人员库姓名时用于报修/采购/物资等申请人展示）'");
            ensureColumnExists("sys_user", "mini_bind_type",
                    "ALTER TABLE sys_user ADD COLUMN mini_bind_type VARCHAR(16) NULL COMMENT '微信小程序绑定方式:STUDENT|STAFF'");
            log.info("[auth-schema] sys_user 列已与 UserMapper 对齐");
        } catch (Exception e) {
            log.error("[auth-schema] sys_user 迁移失败（请检查 DB 账号是否有 ALTER 权限）: {}", e.getMessage(), e);
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
            log.info("[auth-schema] 已添加列 {}.{}", tableName, columnName);
        }
    }
}
