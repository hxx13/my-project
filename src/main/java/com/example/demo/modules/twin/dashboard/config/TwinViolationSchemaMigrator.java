package com.example.demo.modules.twin.dashboard.config;

import com.example.demo.common.logging.annotation.StartupPhase;
import com.example.demo.common.logging.model.StartupContext;
import com.example.demo.common.logging.model.StartupResult;
import com.example.demo.common.logging.model.StartupRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 学生违规模块表结构补充迁移（幂等：每次启动检测 information_schema 后决定是否添加）。
 * 已接入 StartupBanner 动画系统，成功静默。
 */
@StartupPhase(
    name = "违规模块迁移",
    order = 3,
    description = "幂等检查 twin_student_violation / stranded_violation_config 表结构",
    subtasks = true
)
@Component
@Order(130)
public class TwinViolationSchemaMigrator implements StartupRunner {
    private final JdbcTemplate jdbcTemplate;

    public TwinViolationSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public StartupResult run(StartupContext ctx) {
        int ok = 0, total = 7;

        ctx.subtask("interactive_challenge", () -> {
            ensureColumnExists("twin_student_violation", "interactive_challenge",
                    "ALTER TABLE twin_student_violation ADD COLUMN interactive_challenge VARCHAR(128) NULL COMMENT '交互确认短语;null=普通公告'");
        }); ok++;

        ctx.subtask("challenge_verified_at", () -> {
            ensureColumnExists("twin_student_violation", "interactive_challenge_verified_at",
                    "ALTER TABLE twin_student_violation ADD COLUMN interactive_challenge_verified_at DATETIME NULL COMMENT '交互拼图完成时间'");
        }); ok++;

        ctx.subtask("challenge_enabled", () -> {
            ensureColumnExists("stranded_violation_config", "interactive_challenge_enabled",
                    "ALTER TABLE stranded_violation_config ADD COLUMN interactive_challenge_enabled TINYINT NOT NULL DEFAULT 0");
        }); ok++;

        ctx.subtask("challenge_phrase", () -> {
            ensureColumnExists("stranded_violation_config", "interactive_challenge_phrase",
                    "ALTER TABLE stranded_violation_config ADD COLUMN interactive_challenge_phrase VARCHAR(128) NOT NULL DEFAULT '一人一卡,严禁尾随'");
        }); ok++;

        ctx.subtask("unlock_on_verify", () -> {
            ensureColumnExists("twin_student_violation", "interactive_unlock_on_verify",
                    "ALTER TABLE twin_student_violation ADD COLUMN interactive_unlock_on_verify TINYINT(1) NOT NULL DEFAULT 1");
        }); ok++;

        ctx.subtask("stranded_unlock", () -> {
            ensureColumnExists("stranded_violation_config", "interactive_unlock_on_verify",
                    "ALTER TABLE stranded_violation_config ADD COLUMN interactive_unlock_on_verify TINYINT(1) NOT NULL DEFAULT 1");
        }); ok++;

        ctx.subtask("text_tpl_widen", this::widenStrandedViolationTextTpl); ok++;

        ensureStrandedSignoutConfigRow(ctx);

        return StartupResult.success("全部就绪");
    }

    private void ensureStrandedSignoutConfigRow(StartupContext ctx) {
        try {
            safeExecute("""
                    INSERT INTO stranded_violation_config (id, enabled, auto_signout_enabled)
                    VALUES (2, 0, 1)
                    ON DUPLICATE KEY UPDATE id = id
                    """);
        } catch (Exception e) {
            ctx.warn("signout config row: " + e.getMessage());
        }
    }

    private void ensureColumnExists(String tableName, String colName, String alterSql) {
        try {
            Integer cnt = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM information_schema.COLUMNS" +
                            " WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                    Integer.class, tableName, colName
            );
            if (cnt == null || cnt <= 0) {
                safeExecute(alterSql);
            }
        } catch (Exception e) {
            // 静默—列检查失败通常是因为表不存在（由 DDL bootstrap 负责）
        }
    }

    private void safeExecute(String sql) {
        try {
            jdbcTemplate.execute(sql);
        } catch (Exception ignored) {
            // 幂等：重复执行非致命
        }
    }

    private void widenStrandedViolationTextTpl() {
        try {
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM information_schema.COLUMNS" +
                            " WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                    Integer.class, "stranded_violation_config", "violation_text_tpl"
            );
            if (exists == null || exists <= 0) return;

            String dataType = jdbcTemplate.queryForObject(
                    "SELECT DATA_TYPE FROM information_schema.COLUMNS" +
                            " WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                    String.class, "stranded_violation_config", "violation_text_tpl"
            );
            if (!"varchar".equalsIgnoreCase(dataType)) return;

            safeExecute("ALTER TABLE stranded_violation_config MODIFY COLUMN violation_text_tpl TEXT "
                    + "DEFAULT '${name}(${dept})滞留未签退，系统自动登记' "
                    + "COMMENT '违规文案模板（富文本 HTML，支持 ${name}/${dept}/${date} 变量）'");
        } catch (Exception ignored) {
            // 幂等
        }
    }
}
