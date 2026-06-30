package com.example.demo.common.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.util.List;

/**
 * 回滚 2026-06-22 的时区数据迁移（原迁移错误地将已为北京时间的旧记录 +8h）。
 * 回滚逻辑：对原迁移涉及的表/列，将 &lt; 2026-06-13 08:00:00 的记录 -8h，
 * 覆盖所有被原迁移触碰的记录（含跨日期边界被移入 06-13 的）。
 * 使用独立哨兵表确保只执行一次。
 */
/**
 * @deprecated 已由 {@link TimezoneWallClockFinalFix} 取代；保留类避免误删历史引用，不再注册为 Bean。
 */
@Deprecated
public class TimezoneDataMigrationRevert implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(TimezoneDataMigrationRevert.class);
    private static final String SENTINEL = "_tz_migration_revert_20260622";
    /** 覆盖截止：原迁移 cutoff=06-13 00:00，+8h 后最多移入 06-13 08:00 */
    private static final String REVERT_CUTOFF = "2026-06-13 08:00:00";

    private final JdbcTemplate jdbc;

    public TimezoneDataMigrationRevert(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    @Override
    public void run(ApplicationArguments args) {
        if (isAlreadyApplied()) {
            log.info("[tz-revert] 回滚已执行过，跳过。");
            return;
        }
        log.info("[tz-revert] 开始回滚错误的时区迁移（-8h，截止 {}）...", REVERT_CUTOFF);
        int total = 0;

        try {
            // 与 TimezoneDataMigration 完全相同的表/列列表
            total += revertTable("supply_inventory_movement", "created_at");
            total += revertTable("supply_claim_order", "created_at");
            total += revertTable("supply_claim_order", "fulfilled_at");
            total += revertTable("supply_claim_order", "deleted_time");
            total += revertTable("supply_claim_order", "purge_after_time");
            total += revertTable("supply_item", "created_at");
            total += revertTable("supply_item", "updated_at");
            total += revertTable("supply_item", "last_inbound_at");
            total += revertTable("supply_item", "deleted_time");
            total += revertTable("supply_item", "purge_after_time");
            total += revertTable("supply_claim_export_file", "created_time");
            total += revertTable("supply_claim_export_file", "expire_at");
            total += revertTable("supply_user_view_state", "last_viewed_at");

            total += revertTable("material_item", "created_at");
            total += revertTable("material_item", "updated_at");
            total += revertTable("material_item", "last_inbound_at");
            total += revertTable("material_item", "deleted_time");
            total += revertTable("material_item", "purge_after_time");
            total += revertTable("material_request", "created_at");
            total += revertTable("material_request", "updated_at");
            total += revertTable("material_request", "fulfilled_at");
            total += revertTable("material_request", "received_at");
            total += revertTable("material_request", "first_review_time");
            total += revertTable("material_request", "second_review_time");
            total += revertTable("material_request", "deleted_time");
            total += revertTable("material_request", "purge_after_time");
            total += revertTable("material_stock_movement", "created_at");
            total += revertTable("material_operation_log", "created_at");
            total += revertTable("material_cart", "updated_at");
            total += revertTable("material_demand", "created_at");

            total += revertTable("supply_operation_log", "created_at");
            total += revertTable("report_form_definition", "created_at");
            total += revertTable("report_form_definition", "updated_at");
            total += revertTable("report_form_definition", "published_at");
            total += revertTable("report_form_submission", "submitted_at");
            total += revertTable("report_form_submission", "updated_at");
            total += revertTable("purchase_order", "created_at");
            total += revertTable("purchase_order", "update_time");
            total += revertTable("purchase_order", "deleted_time");
            total += revertTable("purchase_order", "purge_after_time");
            total += revertTable("repair_order", "created_at");
            total += revertTable("repair_order", "update_time");
            total += revertTable("repair_order", "deleted_time");
            total += revertTable("repair_order", "purge_after_time");
            total += revertTable("supply_user_cart", "updated_at");

            // 注意：不删除原迁移哨兵表 _tz_migration_utc_to_beijing_20260622，
            // 否则原迁移会在下次启动时再次执行，导致循环。

            markApplied();
            log.info("[tz-revert] 回滚完成！共回滚 {} 行。", total);
        } catch (Exception e) {
            log.error("[tz-revert] 回滚异常: {}", e.getMessage(), e);
        }
    }

    private boolean isAlreadyApplied() {
        try {
            jdbc.execute("SELECT 1 FROM " + SENTINEL + " LIMIT 1");
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void markApplied() {
        jdbc.execute("CREATE TABLE IF NOT EXISTS " + SENTINEL
                + " (id INT PRIMARY KEY, applied_at DATETIME NOT NULL, note VARCHAR(200))");
        jdbc.update("INSERT INTO " + SENTINEL
                + " (id, applied_at, note) VALUES (1, NOW(), 'Revert bad tz migration: -8h for records < " + REVERT_CUTOFF + "')");
    }

    private int revertTable(String table, String column) {
        try {
            List<String> cols = jdbc.queryForList(
                    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS"
                            + " WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                    String.class, table, column);
            if (cols.isEmpty()) {
                return 0;
            }
            // 覆盖所有被原迁移影响的记录：< 06-13 00:00 的 +8h 后最多到 06-13 08:00
            String sql = String.format(
                    "UPDATE %s SET %s = DATE_SUB(%s, INTERVAL 8 HOUR) WHERE %s < '%s' AND %s IS NOT NULL",
                    table, column, column, column, REVERT_CUTOFF, column);
            int n = jdbc.update(sql);
            if (n > 0) {
                log.info("[tz-revert] {}.{} : {} 行已回滚", table, column, n);
            }
            return n;
        } catch (Exception e) {
            log.warn("[tz-revert] {}.{} 跳过: {}", table, column, e.getMessage());
            return 0;
        }
    }
}
