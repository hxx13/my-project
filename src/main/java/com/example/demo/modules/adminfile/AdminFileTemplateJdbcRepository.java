package com.example.demo.modules.adminfile;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class AdminFileTemplateJdbcRepository {

    private final JdbcTemplate jdbc;

    public AdminFileTemplateJdbcRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<Map<String, Object>> ROW = (rs, i) -> {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("id", rs.getString("id"));
        m.put("originalName", rs.getString("original_name"));
        m.put("mimeType", rs.getString("mime_type") == null ? "" : rs.getString("mime_type"));
        m.put("sizeBytes", rs.getLong("size_bytes"));
        m.put("uploadedByUserId", rs.getString("uploaded_by_user_id") == null ? "" : rs.getString("uploaded_by_user_id"));
        m.put("createTime", rs.getTimestamp("create_time").toInstant().toString());
        long fid = rs.getLong("folder_id");
        m.put("folderId", rs.wasNull() ? null : fid);
        return m;
    };

    public void insert(String id, String originalName, String storageKey, String mimeType,
                       long sizeBytes, String uploadedByUserId, String purpose, boolean ephemeral,
                       String pdfStorageKey, Long folderId) {
        jdbc.update(
                "INSERT INTO admin_file_template(id, original_name, storage_key, mime_type, size_bytes, uploaded_by_user_id, purpose, ephemeral, pdf_storage_key, folder_id) VALUES(?,?,?,?,?,?,?,?,?,?)",
                id, originalName, storageKey, mimeType == null ? "" : mimeType, sizeBytes,
                uploadedByUserId, purpose == null ? "" : purpose, ephemeral ? 1 : 0, pdfStorageKey, folderId
        );
    }

    /**
     * 按用途列出。一次性文件（ephemeral=1）一律不出现 —— 它就是来打完就走的。
     *
     * folderId 三态：null = 不过滤（搜索用）；0 = 只看未归类（folder_id IS NULL）；
     * 正数 = 只看该文件夹的直属文件。
     * 注意 0 是哨兵值不是合法主键（自增从 1 起），所以它生成的是 IS NULL 而不是 = 0。
     */
    public List<Map<String, Object>> listByPurpose(String purpose, Long folderId) {
        StringBuilder sql = new StringBuilder(
                "SELECT id, original_name, mime_type, size_bytes, uploaded_by_user_id, create_time, folder_id"
              + " FROM admin_file_template WHERE ephemeral = 0");
        List<Object> args = new ArrayList<>();
        if (purpose != null && !purpose.isBlank()) {
            sql.append(" AND purpose = ?");
            args.add(purpose);
        }
        if (folderId != null) {
            if (folderId == 0L) {
                sql.append(" AND folder_id IS NULL");
            } else {
                sql.append(" AND folder_id = ?");
                args.add(folderId);
            }
        }
        sql.append(" ORDER BY create_time DESC");
        return jdbc.query(sql.toString(), ROW, args.toArray());
    }

    /** 把文件移到某文件夹；folderId 为 null 表示移回未归类 */
    public int updateFolder(String id, Long folderId) {
        return jdbc.update("UPDATE admin_file_template SET folder_id = ? WHERE id = ?", folderId, id);
    }

    /** 判断某文件是否为该用户上传（用于「只能删自己传的」判定） */
    public boolean isUploadedBy(String id, String userId) {
        if (userId == null || userId.isBlank()) {
            return false;
        }
        List<String> r = jdbc.queryForList(
                "SELECT uploaded_by_user_id FROM admin_file_template WHERE id = ?", String.class, id);
        return !r.isEmpty() && userId.equals(r.get(0));
    }

    public boolean isEphemeral(String id) {
        List<Integer> r = jdbc.queryForList(
                "SELECT ephemeral FROM admin_file_template WHERE id = ?", Integer.class, id);
        return !r.isEmpty() && r.get(0) != null && r.get(0) == 1;
    }

    /**
     * 过期的一次性文件 id（没有活跃打印任务的那些）。
     *
     * 为什么要排除活跃任务：文件是工位**领到任务之后**才来下载的。
     * 任务还停在 PENDING/SENT，说明随时可能有人来取，这时删掉就是让它 404。
     *
     * COLLATE 必须写死：admin_file_template 是老表（unicode_ci 一拨），
     * print_job 是新建的（0900 一拨），跨拨列对列比较会抛 1267。
     */
    public List<String> findExpiredEphemeralIds(int minutes) {
        return jdbc.queryForList(
                "SELECT f.id FROM admin_file_template f"
              + " WHERE f.ephemeral = 1"
              + "   AND f.create_time < DATE_SUB(NOW(), INTERVAL ? MINUTE)"
              + "   AND NOT EXISTS ("
              + "       SELECT 1 FROM print_job j"
              + "        WHERE j.source_type = 'ADMIN_FILE'"
              + "          AND j.source_id COLLATE utf8mb4_unicode_ci = f.id"
              + "          AND j.status IN ('PENDING','SENT'))",
                String.class, minutes);
    }

    public Optional<Map<String, Object>> findById(String id) {
        List<Map<String, Object>> rows = jdbc.query(
                "SELECT id, original_name, storage_key, mime_type, size_bytes, uploaded_by_user_id, create_time, pdf_storage_key FROM admin_file_template WHERE id = ? LIMIT 1",
                (rs, rowNum) -> Map.of(
                        "id", rs.getString("id"),
                        "originalName", rs.getString("original_name"),
                        "storageKey", rs.getString("storage_key"),
                        "mimeType", rs.getString("mime_type") == null ? "" : rs.getString("mime_type"),
                        "sizeBytes", rs.getLong("size_bytes"),
                        "uploadedByUserId", rs.getString("uploaded_by_user_id") == null ? "" : rs.getString("uploaded_by_user_id"),
                        "createTime", rs.getTimestamp("create_time").toInstant().toString(),
                        // Map.of 不收 null，缺失一律给空串
                        "pdfStorageKey", rs.getString("pdf_storage_key") == null ? "" : rs.getString("pdf_storage_key")
                ),
                id
        );
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public int deleteById(String id) {
        return jdbc.update("DELETE FROM admin_file_template WHERE id = ?", id);
    }
}
