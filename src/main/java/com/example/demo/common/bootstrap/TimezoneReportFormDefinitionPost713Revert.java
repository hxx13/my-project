package com.example.demo.common.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.util.List;

/**
 * 回滚 {@link TimezoneReportFormDbDefaultPost713Fix} 对 report_form_definition 的误 +8h
 * （Java LocalDateTime.now() 写入的已是北京时间，不应再叠加）。
 * 仅当 post713 哨兵表存在时执行一次。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 2)
public class TimezoneReportFormDefinitionPost713Revert implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(TimezoneReportFormDefinitionPost713Revert.class);
    private static final String POST713_SENTINEL = "_tz_report_form_dbdefault_post713_20260622";
    private static final String REVERT_SENTINEL = "_tz_report_form_post713_revert_20260622";
    private static final String POST_713_LOWER = "2026-06-13 00:00:00";

    private final JdbcTemplate jdbc;

    public TimezoneReportFormDefinitionPost713Revert(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    @Override
    public void run(ApplicationArguments args) {
        if (isAlreadyReverted()) {
            log.info("[tz-report-form-revert] 回滚已执行过，跳过。");
            return;
        }
        if (!post713WasApplied()) {
            log.info("[tz-report-form-revert] post713 未执行，无需回滚。");
            markReverted("skipped-post713-absent");
            return;
        }
        log.info("[tz-report-form-revert] 开始回滚 report_form_definition 误 +8h…");
        int total = 0;
        try {
            total += shiftHours("report_form_definition", "created_at", -8);
            total += shiftHours("report_form_definition", "updated_at", -8);
            total += shiftHours("report_form_definition", "published_at", -8);
            markReverted("reverted post713 overcorrect -8h");
            log.info("[tz-report-form-revert] 完成，共回滚 {} 行。", total);
        } catch (Exception e) {
            log.error("[tz-report-form-revert] 异常: {}", e.getMessage(), e);
        }
    }

    private boolean post713WasApplied() {
        try {
            jdbc.execute("SELECT 1 FROM " + POST713_SENTINEL + " LIMIT 1");
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private boolean isAlreadyReverted() {
        try {
            jdbc.execute("SELECT 1 FROM " + REVERT_SENTINEL + " LIMIT 1");
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void markReverted(String note) {
        jdbc.execute("CREATE TABLE IF NOT EXISTS " + REVERT_SENTINEL
                + " (id INT PRIMARY KEY, applied_at DATETIME NOT NULL, note VARCHAR(300))");
        jdbc.update("INSERT INTO " + REVERT_SENTINEL
                + " (id, applied_at, note) VALUES (1, NOW(), ?)", note);
    }

    private int shiftHours(String table, String column, int hours) {
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
                    "UPDATE %s SET %s = %s(%s, INTERVAL %d HOUR)"
                            + " WHERE %s >= '%s' AND %s IS NOT NULL",
                    table, column, op, column, abs, column, POST_713_LOWER, column);
            int n = jdbc.update(sql);
            if (n > 0) {
                log.info("[tz-report-form-revert] {}.{} {:+d}h : {} 行", table, column, hours, n);
            }
            return n;
        } catch (Exception e) {
            log.warn("[tz-report-form-revert] {}.{} 跳过: {}", table, column, e.getMessage());
            return 0;
        }
    }
}
