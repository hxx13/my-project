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
 * 一次性修正 2026-06-13 之后 report_form_submission 仍由 MySQL DEFAULT（UTC 会话）写入的时间戳 +8h。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 3)
public class TimezoneReportFormSubmissionPost713Fix implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(TimezoneReportFormSubmissionPost713Fix.class);
    private static final String SENTINEL = "_tz_report_form_submission_post713_20260622";
    private static final String POST_713_LOWER = "2026-06-13 00:00:00";

    private final JdbcTemplate jdbc;

    public TimezoneReportFormSubmissionPost713Fix(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    @Override
    public void run(ApplicationArguments args) {
        if (isAlreadyApplied()) {
            log.info("[tz-report-submission-post713] 已执行过，跳过。");
            return;
        }
        log.info("[tz-report-submission-post713] 开始修正 report_form_submission 6/13 后 UTC 默认时间…");
        int total = 0;
        try {
            total += shiftHours("report_form_submission", "created_at", 8);
            total += shiftHours("report_form_submission", "updated_at", 8);
            total += shiftHours("report_form_submission", "submitted_at", 8);
            markApplied();
            log.info("[tz-report-submission-post713] 完成，共修正 {} 行。", total);
        } catch (Exception e) {
            log.error("[tz-report-submission-post713] 异常: {}", e.getMessage(), e);
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
                + " (id, applied_at, note) VALUES (1, NOW(), 'report_form_submission post-713 +8h')");
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
            String sql = String.format(
                    "UPDATE %s SET %s = DATE_ADD(%s, INTERVAL %d HOUR)"
                            + " WHERE %s >= '%s' AND %s IS NOT NULL",
                    table, column, column, hours, column, POST_713_LOWER, column);
            int n = jdbc.update(sql);
            if (n > 0) {
                log.info("[tz-report-submission-post713] {}.{} +{}h : {} 行", table, column, hours, n);
            }
            return n;
        } catch (Exception e) {
            log.warn("[tz-report-submission-post713] {}.{} 跳过: {}", table, column, e.getMessage());
            return 0;
        }
    }
}
