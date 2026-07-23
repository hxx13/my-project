package com.example.demo.modules.accessfusion.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.nio.charset.StandardCharsets;

@Component
@Order(103)
public class AccessFusionSchemaMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AccessFusionSchemaMigrator.class);

    private final JdbcTemplate jdbcTemplate;

    public AccessFusionSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            applySqlResource("db/access_fusion.sql");
            applySqlResource("db/access_clean_workspace.sql");
            applySqlResource("db/access_clean_channel_scope.sql");
            applySqlResource("db/access_clean_task_settings.sql");
            applySqlResource("db/access_swing_clean_run.sql");
            applySqlResource("db/access_clean_rule_profile.sql");
            applySqlResource("db/access_clean_execution_log.sql");
            ensureStatsPullTaskProfileColumn();
            ensureAccessCleanWorkspaceColumns();
            ensureSwingCleanRunColumns();
            ensureAccessCleanTaskSettingsColumns();
            relaxRequireMappingOnRuleProfiles();
            ensureExecutionLogCoverageColumns();
            log.info("[access-fusion] schema migrator applied");
        } catch (Exception e) {
            log.error("[access-fusion] schema migrator failed: {}", e.getMessage(), e);
        }
    }

    /** 关键列/表：不依赖 SQL 文件注释剥离，避免「首条 ALTER 被 -- 注释连带跳过」 */
    private void ensureSwingCleanRunColumns() {
        ensureColumnExists(
                "access_clean_package_item",
                "last_run_id",
                "ALTER TABLE access_clean_package_item ADD COLUMN last_run_id BIGINT NULL COMMENT '最近一次写入本行的清洗批次' AFTER package_id");
        ensureIndexExists(
                "access_clean_package_item",
                "idx_pkg_item_last_run",
                "ALTER TABLE access_clean_package_item ADD KEY idx_pkg_item_last_run (last_run_id)");
    }

    private void ensureStatsPullTaskProfileColumn() {
        ensureColumnExists(
                "twin_dahua_stats_pull_task",
                "clean_rule_profile_id",
                "ALTER TABLE twin_dahua_stats_pull_task ADD COLUMN clean_rule_profile_id BIGINT NULL COMMENT '绑定的清洗规则方案' AFTER query_json");
    }

    /** 历史默认 require_mapping=1 会把未映射工作人员整批排除，统一改为 0（不限制映射）。 */
    private void relaxRequireMappingOnRuleProfiles() {
        try {
            if (!tableExists("access_clean_rule_profile")) {
                return;
            }
            int n =
                    jdbcTemplate.update(
                            "UPDATE access_clean_rule_profile SET require_mapping = 0 WHERE require_mapping = 1");
            if (n > 0) {
                log.info("[access-fusion] relaxed require_mapping on {} rule profile(s)", n);
            }
        } catch (Exception e) {
            log.warn("[access-fusion] relax require_mapping skipped: {}", e.getMessage());
        }
    }

    private boolean tableExists(String table) {
        try {
            Integer c =
                    jdbcTemplate.queryForObject(
                            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
                            Integer.class,
                            table);
            return c != null && c > 0;
        } catch (Exception e) {
            return false;
        }
    }

    private void ensureExecutionLogCoverageColumns() {
        ensureColumnExists(
                "access_clean_execution_log",
                "coverage_day",
                "ALTER TABLE access_clean_execution_log ADD COLUMN coverage_day DATE NULL COMMENT '清洗覆盖自然日' AFTER execution_date");
        ensureColumnExists(
                "access_clean_execution_log",
                "channel_code",
                "ALTER TABLE access_clean_execution_log ADD COLUMN channel_code VARCHAR(128) NULL COMMENT '单通道清洗时的通道编码' AFTER coverage_day");
    }

    private void ensureAccessCleanTaskSettingsColumns() {
        ensureColumnExists(
                "access_clean_task_settings",
                "auto_clean_package",
                "ALTER TABLE access_clean_task_settings ADD COLUMN auto_clean_package TINYINT NOT NULL DEFAULT 1 COMMENT '1=定时自动清洗打包' AFTER debounce_seconds");
        ensureColumnExists(
                "access_clean_task_settings",
                "swing_direction_filter",
                "ALTER TABLE access_clean_task_settings ADD COLUMN swing_direction_filter VARCHAR(8) NOT NULL DEFAULT 'ALL' COMMENT 'ALL|ENTER|EXIT' AFTER auto_clean_package");
    }

    private void ensureAccessCleanWorkspaceColumns() {
        ensureColumnExists(
                "access_door_rule",
                "stats_task_id",
                "ALTER TABLE access_door_rule ADD COLUMN stats_task_id BIGINT NOT NULL DEFAULT 0 COMMENT '统计拉取任务ID' AFTER rule_set_id");
        ensureIndexDropped("access_door_rule", "uk_access_door_rule_channel");
        ensureIndexExists(
                "access_door_rule",
                "uk_access_door_rule_task_channel",
                "ALTER TABLE access_door_rule ADD UNIQUE KEY uk_access_door_rule_task_channel (stats_task_id, channel_code)");
        ensureColumnExists(
                "access_clean_package",
                "channel_code",
                "ALTER TABLE access_clean_package ADD COLUMN channel_code VARCHAR(128) NULL COMMENT '每通道唯一包' AFTER stats_task_id");
        ensureColumnExists(
                "access_clean_package",
                "last_merged_swing_time",
                "ALTER TABLE access_clean_package ADD COLUMN last_merged_swing_time DATETIME NULL COMMENT '增量合并游标' AFTER published_at");
        backfillPackageChannelCodes();
        ensureIndexDropped("access_clean_package", "uk_clean_package_task");
        ensureIndexExists(
                "access_clean_package",
                "uk_clean_package_channel",
                "ALTER TABLE access_clean_package ADD UNIQUE KEY uk_clean_package_channel (channel_code)");
        ensureIndexExists(
                "access_clean_package_item",
                "uk_pkg_item_record",
                "ALTER TABLE access_clean_package_item ADD UNIQUE KEY uk_pkg_item_record (package_id, record_id)");
        ensureColumnExists(
                "access_clean_package_item",
                "department_id",
                "ALTER TABLE access_clean_package_item ADD COLUMN department_id VARCHAR(50) NULL COMMENT '大华部门ID(来自刷卡落库)' AFTER mapping_user_id");
        ensureColumnExists(
                "access_clean_package_item",
                "department_name",
                "ALTER TABLE access_clean_package_item ADD COLUMN department_name VARCHAR(128) NULL AFTER department_id");
        ensureColumnExists(
                "access_clean_package_item",
                "audience_type",
                "ALTER TABLE access_clean_package_item ADD COLUMN audience_type VARCHAR(16) NULL COMMENT 'STUDENT(部门26-29)|STAFF' AFTER department_name");
        ensureColumnExists(
                "access_raw_event",
                "department_id",
                "ALTER TABLE access_raw_event ADD COLUMN department_id VARCHAR(50) NULL COMMENT '大华部门ID' AFTER person_name");
        ensureColumnExists(
                "access_raw_event",
                "department_name",
                "ALTER TABLE access_raw_event ADD COLUMN department_name VARCHAR(128) NULL AFTER department_id");
    }

    private void applySqlResource(String path) throws Exception {
        ClassPathResource res = new ClassPathResource(path);
        if (!res.exists()) {
            return;
        }
        String sql = StreamUtils.copyToString(res.getInputStream(), StandardCharsets.UTF_8);
        for (String stmt : sql.split(";")) {
            String s = stripSqlComments(stmt).trim();
            if (s.isEmpty()) {
                continue;
            }
            try {
                jdbcTemplate.execute(s);
            } catch (Exception ex) {
                log.debug("[access-fusion] skip statement ({}): {}", path, ex.getMessage());
            }
        }
    }

    /** 去掉行首 -- 注释，避免整段语句因首行注释被误判跳过 */
    static String stripSqlComments(String sql) {
        StringBuilder sb = new StringBuilder();
        for (String line : sql.split("\n")) {
            String t = line.trim();
            if (t.startsWith("--")) {
                continue;
            }
            sb.append(line).append('\n');
        }
        return sb.toString();
    }

    private void backfillPackageChannelCodes() {
        try {
            int updated =
                    jdbcTemplate.update(
                            """
                            UPDATE access_clean_package p
                            INNER JOIN (
                                SELECT package_id, MAX(channel_code) AS cc
                                FROM access_clean_package_item
                                WHERE channel_code IS NOT NULL AND channel_code != ''
                                GROUP BY package_id
                            ) x ON x.package_id = p.id
                            SET p.channel_code = x.cc
                            WHERE (p.channel_code IS NULL OR p.channel_code = '')
                            """);
            if (updated > 0) {
                log.info("[access-fusion] backfilled channel_code on {} package(s)", updated);
            }
        } catch (Exception e) {
            log.warn("[access-fusion] backfill channel_code: {}", e.getMessage());
        }
    }

    private void ensureColumnExists(String tableName, String columnName, String alterSql) {
        try {
            if (columnExists(tableName, columnName)) {
                return;
            }
            jdbcTemplate.execute(alterSql);
            log.info("[access-fusion] added column {}.{}", tableName, columnName);
        } catch (Exception e) {
            log.warn("[access-fusion] column {}.{}: {}", tableName, columnName, e.getMessage());
        }
    }

    private void ensureIndexExists(String tableName, String indexName, String alterSql) {
        try {
            if (indexExists(tableName, indexName)) {
                return;
            }
            jdbcTemplate.execute(alterSql);
            log.info("[access-fusion] added index {} on {}", indexName, tableName);
        } catch (Exception e) {
            log.debug("[access-fusion] index {} on {}: {}", indexName, tableName, e.getMessage());
        }
    }

    private void ensureIndexDropped(String tableName, String indexName) {
        try {
            if (!indexExists(tableName, indexName)) {
                return;
            }
            jdbcTemplate.execute("ALTER TABLE " + tableName + " DROP INDEX " + indexName);
            log.info("[access-fusion] dropped index {} on {}", indexName, tableName);
        } catch (Exception e) {
            log.debug("[access-fusion] drop index {} on {}: {}", indexName, tableName, e.getMessage());
        }
    }

    private boolean columnExists(String tableName, String columnName) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
                Integer.class,
                tableName,
                columnName);
        return count != null && count > 0;
    }

    private boolean indexExists(String tableName, String indexName) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?",
                Integer.class,
                tableName,
                indexName);
        return count != null && count > 0;
    }
}
