package com.example.demo.modules.twin.obligation.content;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;

/**
 * 期 6 deepen：对已有 HTML、尚无 content_json 的行做 HTML→JSON 回填。
 * 失败行跳过（保留 HTML），不阻塞启动。
 */
@Component
@Order(40)
public class ContentJsonBackfillRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ContentJsonBackfillRunner.class);
    private static final int BATCH = 200;

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public ContentJsonBackfillRunner(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            int total = 0;
            total += backfill("twin_obligation", "content_html", "id");
            total += backfill("twin_student_violation", "violation_text", "id");
            total += backfill("twin_scan_popup_announcement", "content_html", "id");
            total += backfill("twin_violation_text_template", "violation_text", "id");
            total += backfill("mini_program_announcement", "body_html", "id");
            total += backfill("mini_program_release", "body_html", "id");
            if (total > 0) {
                log.info("[content-json] HTML→JSON backfill updated {} rows", total);
            }
        } catch (Exception e) {
            log.warn("[content-json] backfill skipped: {}", e.getMessage());
        }
    }

    private int backfill(String table, String htmlCol, String idCol) {
        if (!columnExists(table, "content_json") || !columnExists(table, htmlCol)) {
            return 0;
        }
        int updated = 0;
        int failed = 0;
        while (true) {
            List<Map<String, Object>> rows = jdbc.queryForList(
                    "SELECT " + idCol + " AS id, " + htmlCol + " AS html FROM " + table
                            + " WHERE content_json IS NULL AND " + htmlCol + " IS NOT NULL AND TRIM(" + htmlCol + ") <> ''"
                            + " LIMIT " + BATCH
            );
            if (rows.isEmpty()) {
                break;
            }
            for (Map<String, Object> row : rows) {
                Object id = row.get("id");
                String html = row.get("html") != null ? String.valueOf(row.get("html")) : "";
                if (!StringUtils.hasText(html)) {
                    continue;
                }
                String json = HtmlToTipTapJson.convert(objectMapper, html);
                if (json == null) {
                    failed++;
                    // 写入空对象标记已尝试？保留 NULL 以便人工复查；用无效标记避免死循环
                    jdbc.update("UPDATE " + table + " SET content_json = CAST(? AS JSON) WHERE " + idCol + " = ?",
                            "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}],\"_migrateFailed\":true}", id);
                    continue;
                }
                jdbc.update("UPDATE " + table + " SET content_json = CAST(? AS JSON) WHERE " + idCol + " = ?", json, id);
                updated++;
            }
            if (rows.size() < BATCH) {
                break;
            }
        }
        if (failed > 0) {
            log.warn("[content-json] {} migrate-failed placeholders on {}", failed, table);
        }
        return updated;
    }

    private boolean columnExists(String table, String column) {
        Integer n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        return n != null && n > 0;
    }
}
