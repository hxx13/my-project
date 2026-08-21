package com.example.demo.modules.twin.dashboard.config;

import com.example.demo.common.logging.annotation.StartupPhase;
import com.example.demo.common.logging.model.StartupContext;
import com.example.demo.common.logging.model.StartupResult;
import com.example.demo.common.logging.model.StartupRunner;
import com.example.demo.modules.twin.dashboard.support.CageViolationFkSupport;
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
        int ok = 0, total = 12;

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

        // ── 笼架特殊状态违规联动 ──
        ctx.subtask("cage_status_codes", () -> {
            ensureColumnExists("twin_violation_rule", "cage_status_codes",
                    "ALTER TABLE twin_violation_rule ADD COLUMN cage_status_codes JSON COMMENT '监控的特殊状态类型'");
        }); ok++;

        ctx.subtask("cage_delay_days", () -> {
            ensureColumnExists("twin_violation_rule", "cage_delay_days",
                    "ALTER TABLE twin_violation_rule ADD COLUMN cage_delay_days INT COMMENT '延迟天数'");
        }); ok++;

        ctx.subtask("cage_judge_mode", () -> {
            ensureColumnExists("twin_violation_rule", "cage_judge_mode",
                    "ALTER TABLE twin_violation_rule ADD COLUMN cage_judge_mode VARCHAR(20) DEFAULT 'AUTO_SYNC_LINKED' COMMENT '判定模式'");
        }); ok++;

        ctx.subtask("cage_manual_trigger", () -> {
            ensureColumnExists("twin_violation_rule", "cage_manual_trigger",
                    "ALTER TABLE twin_violation_rule ADD COLUMN cage_manual_trigger TINYINT(1) DEFAULT 0 COMMENT '手动执行也触发判定'");
        }); ok++;

        ctx.subtask("cage_area_filter", () -> {
            ensureColumnExists("twin_violation_rule", "cage_area_filter",
                    "ALTER TABLE twin_violation_rule ADD COLUMN cage_area_filter JSON COMMENT '区域筛选'");
        }); ok++;

        ctx.subtask("cage_group_whitelist", () -> {
            ensureColumnExists("twin_violation_rule", "cage_group_whitelist",
                    "ALTER TABLE twin_violation_rule ADD COLUMN cage_group_whitelist JSON COMMENT '课题组白名单'");
        }); ok++;

        ctx.subtask("cage_trigger_action", () -> {
            ensureColumnExists("twin_violation_rule", "cage_trigger_action",
                    "ALTER TABLE twin_violation_rule ADD COLUMN cage_trigger_action VARCHAR(20) DEFAULT 'BOTH' COMMENT '触发动作'");
        }); ok++;

        ctx.subtask("cage_image_urls", () -> {
            ensureColumnExists("twin_violation_rule", "cage_image_urls",
                    "ALTER TABLE twin_violation_rule ADD COLUMN cage_image_urls JSON COMMENT '违规图片URL列表'");
        }); ok++;

        ctx.subtask("cage_status_violation_table", () -> {
            ensureCageStatusViolationTable();
        }); ok++;

        ctx.subtask("cage_violation_id_fk", () -> {
            ensureColumnExists("twin_student_violation", "cage_violation_id",
                    "ALTER TABLE twin_student_violation ADD COLUMN cage_violation_id BIGINT COMMENT '关联 twin_cage_status_violation.id'");
            // also ensure index
            safeExecute("CREATE INDEX IF NOT EXISTS idx_cage_vid ON twin_student_violation (cage_violation_id)");
        }); ok++;

        // T1-2：真实 FK + ON DELETE CASCADE（先清理孤儿，再加约束）
        ctx.subtask("cage_violation_fk_cascade", this::ensureCageViolationFkCascade); ok++;

        // T2-7：id=2 签退配置行仅由 SQL bootstrap（bootstrap-stranded-signout-config-row.sql）创建；
        // 本 Migrator 不再重复 INSERT。运行期兜底见 StrandedViolationService.@PostConstruct。

        return StartupResult.success("全部就绪");
    }

    /**
     * T1-2：清理断链子 / 空 ACTIVE 父，再幂等添加
     * {@code fk_tsv_cage_violation}（ON DELETE CASCADE）。
     * 应用层删父前仍应先经 service 删子以撤回镜像通知；CASCADE 为库级兜底。
     */
    private void ensureCageViolationFkCascade() {
        safeExecute("""
                UPDATE twin_student_violation v
                SET v.cage_violation_id = NULL, v.updated_at = NOW()
                WHERE v.cage_violation_id IS NOT NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM twin_cage_status_violation p WHERE p.id = v.cage_violation_id
                  )
                """);
        safeExecute("""
                UPDATE twin_cage_status_violation p
                SET p.status = 'CLEARED', p.updated_at = NOW()
                WHERE p.status = 'ACTIVE'
                  AND NOT EXISTS (
                    SELECT 1 FROM twin_student_violation c
                    WHERE c.cage_violation_id = p.id AND c.status = 'ACTIVE'
                  )
                """);
        safeExecute("CREATE INDEX IF NOT EXISTS idx_cage_vid ON twin_student_violation (cage_violation_id)");
        try {
            Integer fkCount = jdbcTemplate.queryForObject(
                    """
                            SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                            WHERE CONSTRAINT_SCHEMA = DATABASE()
                              AND TABLE_NAME = ?
                              AND CONSTRAINT_NAME = ?
                              AND CONSTRAINT_TYPE = 'FOREIGN KEY'
                            """,
                    Integer.class,
                    CageViolationFkSupport.CHILD_TABLE,
                    CageViolationFkSupport.CONSTRAINT_NAME);
            if (fkCount != null && fkCount == 0) {
                jdbcTemplate.execute("""
                        ALTER TABLE %s
                          ADD CONSTRAINT %s
                          FOREIGN KEY (%s)
                          REFERENCES %s (id)
                          ON DELETE CASCADE
                        """.formatted(
                        CageViolationFkSupport.CHILD_TABLE,
                        CageViolationFkSupport.CONSTRAINT_NAME,
                        CageViolationFkSupport.CHILD_COLUMN,
                        CageViolationFkSupport.PARENT_TABLE));
            }
        } catch (Exception ignored) {
            // 幂等：缺表/无权限时由启动日志其他路径暴露
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

    private void ensureCageStatusViolationTable() {
        safeExecute("""
                CREATE TABLE IF NOT EXISTS twin_cage_status_violation (
                  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
                  rule_id             BIGINT        NOT NULL COMMENT '关联 twin_violation_rule.id',
                  scan_batch_id       VARCHAR(64)   COMMENT '触发时的同步批次ID',
                  status_code         VARCHAR(32)   COMMENT '触发的特殊状态类型',
                  cage_shelve_id      BIGINT        COMMENT '笼架ID',
                  position_x          INT           COMMENT '笼位X坐标',
                  position_y          INT           COMMENT '笼位Y坐标',
                  position_label      VARCHAR(16)   COMMENT '笼位标签如 A-3',
                  cage_box_qr_code    VARCHAR(512)  COMMENT '笼盒卡号',
                  project_pi_name     VARCHAR(128)  COMMENT '课题组PI',
                  project_group_name  VARCHAR(256)  COMMENT '课题组名称',
                  department_name     VARCHAR(256)  COMMENT '部门',
                  room_name           VARCHAR(128)  COMMENT '房间名称',
                  campus_name         VARCHAR(64)   COMMENT '园区名称',
                  triggered_at        DATETIME      COMMENT '触发时间',
                  status              VARCHAR(20)   DEFAULT 'ACTIVE' COMMENT 'ACTIVE / CLEARED / EXPIRED',
                  created_at          DATETIME      DEFAULT CURRENT_TIMESTAMP,
                  updated_at          DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  INDEX idx_rule (rule_id),
                  INDEX idx_batch (scan_batch_id),
                  INDEX idx_status (status),
                  INDEX idx_group (project_group_name(64))
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼架特殊状态违规父记录'
                """);
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
