package com.example.demo.modules.twin.dashboard.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;

/**
 * 学生违规模块表结构补充迁移（幂等：每次启动检测 information_schema 后决定是否添加）。
 */
@Component
@Order(130)
public class TwinViolationSchemaMigrator {
    private static final Logger log = LoggerFactory.getLogger(TwinViolationSchemaMigrator.class);
    private final JdbcTemplate jdbcTemplate;

    public TwinViolationSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void migrate() {
        System.out.println("[violation-schema] === 开始检查表结构 ===");
        ensureColumnExists(
                "twin_student_violation", "interactive_challenge",
                "ALTER TABLE twin_student_violation ADD COLUMN interactive_challenge VARCHAR(128) NULL COMMENT '交互确认短语;null=普通公告'");

        ensureColumnExists(
                "twin_student_violation", "interactive_challenge_verified_at",
                "ALTER TABLE twin_student_violation ADD COLUMN interactive_challenge_verified_at DATETIME NULL COMMENT '交互拼图完成时间;非NULL=已永久解除禁入'");

        ensureColumnExists(
                "stranded_violation_config", "interactive_challenge_enabled",
                "ALTER TABLE stranded_violation_config ADD COLUMN interactive_challenge_enabled TINYINT NOT NULL DEFAULT 0 COMMENT '是否启用交互式违规确认'");

        ensureColumnExists(
                "stranded_violation_config", "interactive_challenge_phrase",
                "ALTER TABLE stranded_violation_config ADD COLUMN interactive_challenge_phrase VARCHAR(128) NOT NULL DEFAULT '一人一卡,严禁尾随' COMMENT '交互拼图目标短语'");

        ensureColumnExists(
                "twin_student_violation", "interactive_unlock_on_verify",
                "ALTER TABLE twin_student_violation ADD COLUMN interactive_unlock_on_verify TINYINT(1) NOT NULL DEFAULT 1 COMMENT '交互验证完成后是否自动解除禁入;1=是'");

        ensureColumnExists(
                "stranded_violation_config", "interactive_unlock_on_verify",
                "ALTER TABLE stranded_violation_config ADD COLUMN interactive_unlock_on_verify TINYINT(1) NOT NULL DEFAULT 1 COMMENT '自动违规:交互验证完成后是否自动解除禁入'");

        System.out.println("[violation-schema] === 表结构检查完毕 ===");
    }

    private void ensureColumnExists(String tableName, String colName, String alterSql) {
        try {
            Integer cnt = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM information_schema.COLUMNS" +
                            " WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                    Integer.class, tableName, colName
            );
            if (cnt == null || cnt <= 0) {
                System.out.println("[violation-schema] 列不存在, 执行: " + alterSql);
                safeExecute(alterSql);
                System.out.println("[violation-schema] 已添加 " + tableName + "." + colName);
            } else {
                System.out.println("[violation-schema] 列已存在: " + tableName + "." + colName);
            }
        } catch (Exception e) {
            System.err.println("[violation-schema] 失败 table=" + tableName + " col=" + colName + " err=" + e.getMessage());
        }
    }

    private void safeExecute(String sql) {
        try {
            jdbcTemplate.execute(sql);
        } catch (Exception e) {
            System.err.println("[violation-schema] DDL执行失败: " + e.getMessage());
        }
    }
}
