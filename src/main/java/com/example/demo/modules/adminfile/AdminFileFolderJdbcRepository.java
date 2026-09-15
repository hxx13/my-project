package com.example.demo.modules.adminfile;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Repository
public class AdminFileFolderJdbcRepository {

    private final JdbcTemplate jdbc;

    public AdminFileFolderJdbcRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<AdminFileFolder> ROW = (ResultSet rs, int i) -> {
        AdminFileFolder n = new AdminFileFolder();
        n.setId(rs.getLong("id"));
        long parent = rs.getLong("parent_id");
        n.setParentId(rs.wasNull() ? null : parent);
        n.setName(rs.getString("name"));
        n.setSortOrder(rs.getInt("sort_order"));
        n.setDeleted(rs.getInt("deleted"));
        n.setIcon(rs.getString("icon"));
        return n;
    };

    /** 全部未删除节点，扁平。树在 Service 里组装。 */
    public List<AdminFileFolder> listAll() {
        return jdbc.query(
                "SELECT id, parent_id, name, sort_order, deleted, icon FROM admin_file_template_folder"
              + " WHERE deleted = 0 ORDER BY sort_order, id", ROW);
    }

    public AdminFileFolder findById(Long id) {
        List<AdminFileFolder> r = jdbc.query(
                "SELECT id, parent_id, name, sort_order, deleted, icon FROM admin_file_template_folder"
              + " WHERE id = ? AND deleted = 0 LIMIT 1", ROW, id);
        return r.isEmpty() ? null : r.get(0);
    }

    public int insert(Long parentId, String name, int sortOrder, String icon) {
        return jdbc.update(
                "INSERT INTO admin_file_template_folder(parent_id, name, sort_order, icon) VALUES(?,?,?,?)",
                parentId, name, sortOrder, icon);
    }

    public int updateNode(Long id, String name, Long parentId, int sortOrder, String icon) {
        return jdbc.update(
                "UPDATE admin_file_template_folder SET name = ?, parent_id = ?, sort_order = ?, icon = ? WHERE id = ?",
                name, parentId, sortOrder, icon, id);
    }

    public int softDelete(Long id) {
        return jdbc.update("UPDATE admin_file_template_folder SET deleted = 1 WHERE id = ?", id);
    }

    /** 直接子节点数（未删除） */
    public int countChildren(Long id) {
        Integer n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM admin_file_template_folder WHERE parent_id = ? AND deleted = 0",
                Integer.class, id);
        return n == null ? 0 : n;
    }

    /** 该文件夹直属的未删除文件数 */
    public int countFiles(Long id) {
        Integer n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM admin_file_template WHERE folder_id = ? AND ephemeral = 0"
              + " AND purpose = 'TEMPLATE'", Integer.class, id);
        return n == null ? 0 : n;
    }

    /** 每个文件夹的直属文件数：folder_id → count。只算已归类的。 */
    public Map<Long, Integer> countFilesGroupByFolder() {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT folder_id AS fid, COUNT(*) AS cnt FROM admin_file_template"
              + " WHERE folder_id IS NOT NULL AND ephemeral = 0 AND purpose = 'TEMPLATE'"
              + " GROUP BY folder_id");
        Map<Long, Integer> out = new HashMap<>();
        for (Map<String, Object> r : rows) {
            Object fid = r.get("fid");
            Object cnt = r.get("cnt");
            if (fid instanceof Number f && cnt instanceof Number c) {
                out.put(f.longValue(), c.intValue());
            }
        }
        return out;
    }
}
