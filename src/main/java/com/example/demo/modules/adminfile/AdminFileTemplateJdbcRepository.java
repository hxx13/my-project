package com.example.demo.modules.adminfile;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class AdminFileTemplateJdbcRepository {

    private final JdbcTemplate jdbc;

    public AdminFileTemplateJdbcRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<Map<String, Object>> ROW = (rs, i) -> Map.of(
            "id", rs.getString("id"),
            "originalName", rs.getString("original_name"),
            "mimeType", rs.getString("mime_type") == null ? "" : rs.getString("mime_type"),
            "sizeBytes", rs.getLong("size_bytes"),
            "uploadedByUserId", rs.getString("uploaded_by_user_id") == null ? "" : rs.getString("uploaded_by_user_id"),
            "createTime", rs.getTimestamp("create_time").toInstant().toString()
    );

    public void insert(String id, String originalName, String storageKey, String mimeType, long sizeBytes, String uploadedByUserId) {
        jdbc.update(
                "INSERT INTO admin_file_template(id, original_name, storage_key, mime_type, size_bytes, uploaded_by_user_id) VALUES(?,?,?,?,?,?)",
                id, originalName, storageKey, mimeType == null ? "" : mimeType, sizeBytes, uploadedByUserId
        );
    }

    public List<Map<String, Object>> listAll() {
        return jdbc.query(
                "SELECT id, original_name, mime_type, size_bytes, uploaded_by_user_id, create_time FROM admin_file_template ORDER BY create_time DESC",
                ROW
        );
    }

    public Optional<Map<String, Object>> findById(String id) {
        List<Map<String, Object>> rows = jdbc.query(
                "SELECT id, original_name, storage_key, mime_type, size_bytes, uploaded_by_user_id, create_time FROM admin_file_template WHERE id = ? LIMIT 1",
                (rs, rowNum) -> Map.of(
                        "id", rs.getString("id"),
                        "originalName", rs.getString("original_name"),
                        "storageKey", rs.getString("storage_key"),
                        "mimeType", rs.getString("mime_type") == null ? "" : rs.getString("mime_type"),
                        "sizeBytes", rs.getLong("size_bytes"),
                        "uploadedByUserId", rs.getString("uploaded_by_user_id") == null ? "" : rs.getString("uploaded_by_user_id"),
                        "createTime", rs.getTimestamp("create_time").toInstant().toString()
                ),
                id
        );
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public int deleteById(String id) {
        return jdbc.update("DELETE FROM admin_file_template WHERE id = ?", id);
    }
}
