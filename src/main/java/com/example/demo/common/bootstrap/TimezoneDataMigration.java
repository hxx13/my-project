package com.example.demo.common.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.util.List;

/**
 * 一次性数据迁移：将 JVM 时区修复前（2026-06-13）写入的 UTC 壁钟 DATETIME 值 +8h 转为北京时间。
 * 使用独立哨兵表确保只执行一次，安全可重入。
 */
/**
 * @deprecated 已由 {@link TimezoneWallClockFinalFix} 取代；保留类避免误删历史引用，不再注册为 Bean。
 */
@Deprecated
public class TimezoneDataMigration implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(TimezoneDataMigration.class);
    private static final String SENTINEL_TABLE = "_tz_migration_utc_to_beijing_20260622";
    private static final String CUTOFF = "2026-06-13 00:00:00";

    private final JdbcTemplate jdbc;

    public TimezoneDataMigration(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    @Override
    public void run(ApplicationArguments args) {
        if (isAlreadyApplied()) {
            log.info("[tz-migration] 时区数据迁移已执行过，跳过。");
            return;
        }
        log.info("[tz-migration] 开始执行 UTC→北京时间 数据迁移（截止 {}）...", CUTOFF);
        int totalUpdated = 0;

        try {
            // 1. 供应链/物资模块
            totalUpdated += migrateTable("supply_inventory_movement", "created_at");
            totalUpdated += migrateTable("supply_claim_order", "created_at");
            totalUpdated += migrateTable("supply_claim_order", "fulfilled_at");
            totalUpdated += migrateTable("supply_claim_order", "deleted_time");
            totalUpdated += migrateTable("supply_claim_order", "purge_after_time");
            totalUpdated += migrateTable("supply_item", "created_at");
            totalUpdated += migrateTable("supply_item", "updated_at");
            totalUpdated += migrateTable("supply_item", "last_inbound_at");
            totalUpdated += migrateTable("supply_item", "deleted_time");
            totalUpdated += migrateTable("supply_item", "purge_after_time");
            totalUpdated += migrateTable("supply_claim_export_file", "created_time");
            totalUpdated += migrateTable("supply_claim_export_file", "expire_at");
            totalUpdated += migrateTable("supply_user_view_state", "last_viewed_at");

            // 2. 物资申领模块 (material_*)
            totalUpdated += migrateTable("material_item", "created_at");
            totalUpdated += migrateTable("material_item", "updated_at");
            totalUpdated += migrateTable("material_item", "last_inbound_at");
            totalUpdated += migrateTable("material_item", "deleted_time");
            totalUpdated += migrateTable("material_item", "purge_after_time");
            totalUpdated += migrateTable("material_request", "created_at");
            totalUpdated += migrateTable("material_request", "updated_at");
            totalUpdated += migrateTable("material_request", "fulfilled_at");
            totalUpdated += migrateTable("material_request", "received_at");
            totalUpdated += migrateTable("material_request", "first_review_time");
            totalUpdated += migrateTable("material_request", "second_review_time");
            totalUpdated += migrateTable("material_request", "deleted_time");
            totalUpdated += migrateTable("material_request", "purge_after_time");
            totalUpdated += migrateTable("material_stock_movement", "created_at");
            totalUpdated += migrateTable("material_operation_log", "created_at");
            totalUpdated += migrateTable("material_cart", "updated_at");
            totalUpdated += migrateTable("material_demand", "created_at");

            // 3. 其他模块
            totalUpdated += migrateTable("supply_operation_log", "created_at");
            totalUpdated += migrateTable("report_form_definition", "created_at");
            totalUpdated += migrateTable("report_form_definition", "updated_at");
            totalUpdated += migrateTable("report_form_definition", "published_at");
            totalUpdated += migrateTable("report_form_submission", "submitted_at");
            totalUpdated += migrateTable("report_form_submission", "updated_at");
            totalUpdated += migrateTable("purchase_order", "created_at");
            totalUpdated += migrateTable("purchase_order", "update_time");
            totalUpdated += migrateTable("purchase_order", "deleted_time");
            totalUpdated += migrateTable("purchase_order", "purge_after_time");
            totalUpdated += migrateTable("repair_order", "created_at");
            totalUpdated += migrateTable("repair_order", "update_time");
            totalUpdated += migrateTable("repair_order", "deleted_time");
            totalUpdated += migrateTable("repair_order", "purge_after_time");
            totalUpdated += migrateTable("supply_user_cart", "updated_at");

            // 标记已执行
            markApplied();
            log.info("[tz-migration] 迁移完成！共更新 {} 行。", totalUpdated);

        } catch (Exception e) {
            log.error("[tz-migration] 迁移异常: {}", e.getMessage(), e);
        }
    }

    private boolean isAlreadyApplied() {
        try {
            jdbc.execute("SELECT 1 FROM " + SENTINEL_TABLE + " LIMIT 1");
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void markApplied() {
        jdbc.execute("CREATE TABLE IF NOT EXISTS " + SENTINEL_TABLE
                + " (id INT PRIMARY KEY, applied_at DATETIME NOT NULL, note VARCHAR(200))");
        jdbc.update("INSERT INTO " + SENTINEL_TABLE
                + " (id, applied_at, note) VALUES (1, NOW(), 'UTC+8h migration for records before " + CUTOFF + "')");
    }

    /**
     * 对指定表的时间列 +8h。使用安全条件：仅更新小于截止日期的记录。
     * 迁移后记录 >= CUTOFF，再次执行时条件不再匹配 → 天然幂等。
     */
    private int migrateTable(String table, String column) {
        try {
            // 检查表和列是否存在
            List<String> cols = jdbc.queryForList(
                    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS"
                            + " WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                    String.class, table, column);
            if (cols.isEmpty()) {
                log.debug("[tz-migration] 跳过不存在的 {}.{}", table, column);
                return 0;
            }

            // 使用安全截止：UTC 时间 +8h 后必然 >= CUTOFF，不会重复更新
            String sql = String.format(
                    "UPDATE %s SET %s = DATE_ADD(%s, INTERVAL 8 HOUR) WHERE %s < '%s' AND %s IS NOT NULL",
                    table, column, column, column, CUTOFF, column);
            int n = jdbc.update(sql);
            if (n > 0) {
                log.info("[tz-migration] {}.{} : {} 行已修正", table, column, n);
            }
            return n;
        } catch (Exception e) {
            log.warn("[tz-migration] {}.{} 跳过: {}", table, column, e.getMessage());
            return 0;
        }
    }
}
