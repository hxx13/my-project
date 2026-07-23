package com.example.demo.common.bootstrap;

import com.example.demo.common.logging.annotation.StartupPhase;
import com.example.demo.common.logging.model.StartupContext;
import com.example.demo.common.logging.model.StartupResult;
import com.example.demo.common.logging.model.StartupRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.util.List;

/**
 * 一次性修正 2026-06-22 错误时区迁移造成的混乱。
 * 使用独立哨兵表，仅执行一次。
 */
@StartupPhase(
    name = "时区数据修正",
    order = Ordered.HIGHEST_PRECEDENCE,
    description = "一次性 UTC→北京时区校正（已执行则跳过）",
    subtasks = true
)
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TimezoneWallClockFinalFix implements StartupRunner {

    private static final String SENTINEL = "_tz_wallclock_final_fix_20260622";
    private static final String UTC_ERA_CUTOFF = "2026-06-13 00:00:00";
    private static final String SUPPLY_OVERCORRECT_CUTOFF = "2026-06-13 08:00:00";

    private final JdbcTemplate jdbc;

    public TimezoneWallClockFinalFix(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    @Override
    public StartupResult run(StartupContext ctx) {
        if (isAlreadyApplied()) {
            return StartupResult.success("已跳过（曾执行过）");
        }

        int total;
        try {
            total = shiftHours("supply_inventory_movement", "created_at", -8, SUPPLY_OVERCORRECT_CUTOFF, ctx);
            total += shiftHours("supply_claim_order", "created_at", -8, SUPPLY_OVERCORRECT_CUTOFF, ctx);
            total += shiftHours("supply_claim_order", "fulfilled_at", -8, SUPPLY_OVERCORRECT_CUTOFF, ctx);
            total += shiftHours("supply_claim_order", "deleted_time", -8, SUPPLY_OVERCORRECT_CUTOFF, ctx);
            total += shiftHours("supply_claim_order", "purge_after_time", -8, SUPPLY_OVERCORRECT_CUTOFF, ctx);
            total += shiftHours("supply_item", "created_at", -8, SUPPLY_OVERCORRECT_CUTOFF, ctx);
            total += shiftHours("supply_item", "updated_at", -8, SUPPLY_OVERCORRECT_CUTOFF, ctx);
            total += shiftHours("supply_item", "last_inbound_at", -8, SUPPLY_OVERCORRECT_CUTOFF, ctx);
            total += shiftHours("supply_item", "deleted_time", -8, SUPPLY_OVERCORRECT_CUTOFF, ctx);
            total += shiftHours("supply_item", "purge_after_time", -8, SUPPLY_OVERCORRECT_CUTOFF, ctx);
            total += shiftHours("supply_claim_export_file", "created_time", -8, SUPPLY_OVERCORRECT_CUTOFF, ctx);
            total += shiftHours("supply_claim_export_file", "expire_at", -8, SUPPLY_OVERCORRECT_CUTOFF, ctx);
            total += shiftHours("supply_user_view_state", "last_viewed_at", -8, SUPPLY_OVERCORRECT_CUTOFF, ctx);
            total += shiftHours("supply_operation_log", "created_at", -8, SUPPLY_OVERCORRECT_CUTOFF, ctx);
            total += shiftHours("supply_user_cart", "updated_at", -8, SUPPLY_OVERCORRECT_CUTOFF, ctx);

            total += shiftHours("material_item", "created_at", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("material_item", "updated_at", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("material_item", "last_inbound_at", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("material_item", "deleted_time", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("material_item", "purge_after_time", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("material_request", "created_at", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("material_request", "updated_at", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("material_request", "fulfilled_at", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("material_request", "received_at", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("material_request", "first_review_time", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("material_request", "second_review_time", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("material_request", "deleted_time", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("material_request", "purge_after_time", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("material_stock_movement", "created_at", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("material_operation_log", "created_at", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("material_cart", "updated_at", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("material_demand", "created_at", 8, UTC_ERA_CUTOFF, ctx);

            total += shiftHours("repair_order", "create_time", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("repair_order", "start_time", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("repair_order", "finish_time", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("repair_order", "update_time", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("repair_order", "deleted_time", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("repair_order", "purge_after_time", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("purchase_order", "create_time", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("purchase_order", "start_time", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("purchase_order", "finish_time", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("purchase_order", "update_time", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("purchase_order", "deleted_time", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("purchase_order", "purge_after_time", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("asset_transfer_request", "create_time", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("asset_transfer_request", "transfer_time", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("asset_transfer_log", "create_time", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("asset_record", "create_time", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("asset_record", "update_time", 8, UTC_ERA_CUTOFF, ctx);

            total += shiftHours("report_form_definition", "created_at", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("report_form_definition", "updated_at", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("report_form_definition", "published_at", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("report_form_submission", "submitted_at", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("report_form_submission", "updated_at", 8, UTC_ERA_CUTOFF, ctx);
            total += shiftHours("report_form_submission", "created_at", 8, UTC_ERA_CUTOFF, ctx);

            markApplied();
            return StartupResult.success("修正 " + total + " 行");
        } catch (Exception e) {
            return StartupResult.failed(e.getMessage(), e);
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
                + " (id INT PRIMARY KEY, applied_at DATETIME NOT NULL, note VARCHAR(300))");
        jdbc.update("INSERT INTO " + SENTINEL
                + " (id, applied_at, note) VALUES (1, NOW(), 'Wall-clock tz final fix 2026-06-22')");
    }

    private int shiftHours(String table, String column, int hours, String cutoffExclusive, StartupContext ctx) {
        try {
            List<String> cols = jdbc.queryForList(
                    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS"
                            + " WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                    String.class, table, column);
            if (cols.isEmpty()) {
                return 0;
            }
            String op = hours >= 0 ? "DATE_ADD" : "DATE_SUB";
            int abs = Math.abs(hours);
            String sql = String.format(
                    "UPDATE %s SET %s = %s(%s, INTERVAL %d HOUR) WHERE %s < '%s' AND %s IS NOT NULL",
                    table, column, op, column, abs, column, cutoffExclusive, column);
            int n = jdbc.update(sql);
            if (n > 0 && ctx != null) {
                ctx.subtask(null, () -> {}); // 静默推进进度
            }
            return n;
        } catch (Exception e) {
            if (ctx != null) {
                ctx.warn(table + "." + column + " 跳过: " + e.getMessage());
            }
            return 0;
        }
    }
}
