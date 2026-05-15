package com.example.demo.modules.admin.pagehelp;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class AdminPageHelpRepository {

    private final JdbcTemplate jdbc;

    public AdminPageHelpRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Map<String, Object>> findHelpRow(String pagePath) {
        List<Map<String, Object>> rows = jdbc.query(
                "SELECT body_html, updated_at, updated_by FROM admin_page_help WHERE page_path = ? LIMIT 1",
                (rs, rowNum) -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("bodyHtml", rs.getString("body_html"));
                    m.put("updatedAt", formatTs(rs.getTimestamp("updated_at")));
                    m.put("updatedBy", rs.getString("updated_by"));
                    return m;
                },
                pagePath
        );
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public List<Map<String, Object>> listMessages(String pagePath) {
        return jdbc.query(
                """
                        SELECT m.id, m.user_id, m.body, m.created_at,
                               COALESCE(NULLIF(TRIM(u.display_nickname), ''), NULLIF(TRIM(u.username), ''), m.user_id) AS author_label
                        FROM admin_page_help_message m
                        LEFT JOIN sys_user u ON u.id = m.user_id
                        WHERE m.page_path = ?
                        ORDER BY m.id DESC
                        LIMIT 100
                        """,
                (rs, rowNum) -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("id", rs.getLong("id"));
                    m.put("userId", rs.getString("user_id"));
                    m.put("body", rs.getString("body"));
                    m.put("createdAt", formatTs(rs.getTimestamp("created_at")));
                    m.put("authorLabel", rs.getString("author_label"));
                    return m;
                },
                pagePath
        );
    }

    public void upsertBody(String pagePath, String bodyHtml, String userId) {
        jdbc.update(
                """
                        INSERT INTO admin_page_help (page_path, body_html, updated_by)
                        VALUES (?, ?, ?)
                        ON DUPLICATE KEY UPDATE body_html = VALUES(body_html), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP
                        """,
                pagePath, bodyHtml, userId
        );
    }

    public long insertMessage(String pagePath, String userId, String body) {
        KeyHolder kh = new GeneratedKeyHolder();
        jdbc.update(
                connection -> {
                    PreparedStatement ps = connection.prepareStatement(
                            "INSERT INTO admin_page_help_message (page_path, user_id, body) VALUES (?, ?, ?)",
                            Statement.RETURN_GENERATED_KEYS
                    );
                    ps.setString(1, pagePath);
                    ps.setString(2, userId);
                    ps.setString(3, body);
                    return ps;
                },
                kh
        );
        Number key = kh.getKey();
        return key != null ? key.longValue() : 0L;
    }

    private static String formatTs(Timestamp ts) {
        if (ts == null) {
            return null;
        }
        return ts.toLocalDateTime().toString().replace('T', ' ');
    }
}
