package com.example.demo.modules.admin.service;

import com.example.demo.modules.admin.model.AdminNavConfigNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.*;

@Service
public class AdminNavConfigService {
    private static final Logger log = LoggerFactory.getLogger(AdminNavConfigService.class);
    private final JdbcTemplate jdbcTemplate;

    public AdminNavConfigService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<AdminNavConfigNode> getFullTree() {
        List<AdminNavConfigNode> all = jdbcTemplate.query(
                "SELECT id, parent_id, type, title, item_path, item_icon, item_badge_key, sort_order, visible FROM admin_nav_config ORDER BY sort_order",
                new NodeRowMapper());

        Map<String, AdminNavConfigNode> map = new LinkedHashMap<>();
        for (AdminNavConfigNode n : all) {
            map.put(n.getId(), n);
        }
        List<AdminNavConfigNode> roots = new ArrayList<>();
        for (AdminNavConfigNode n : all) {
            if (n.getParentId() == null || n.getParentId().isEmpty()) {
                roots.add(n);
            } else {
                AdminNavConfigNode parent = map.get(n.getParentId());
                if (parent != null) {
                    parent.getChildren().add(n);
                } else {
                    roots.add(n);
                }
            }
        }
        return roots;
    }

    @Transactional
    public AdminNavConfigNode createGroup(String parentId, String type, String title, int sortOrder) {
        String id = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        jdbcTemplate.update(
                "INSERT INTO admin_nav_config (id, parent_id, type, title, sort_order) VALUES (?, ?, ?, ?, ?)",
                id, parentId, type, title, sortOrder);
        return getById(id);
    }

    @Transactional
    public AdminNavConfigNode updateGroup(String id, String title, Integer sortOrder, Boolean visible) {
        StringBuilder sql = new StringBuilder("UPDATE admin_nav_config SET ");
        List<Object> params = new ArrayList<>();
        if (title != null) { sql.append("title = ?, "); params.add(title); }
        if (sortOrder != null) { sql.append("sort_order = ?, "); params.add(sortOrder); }
        if (visible != null) { sql.append("visible = ?, "); params.add(visible ? 1 : 0); }
        if (params.isEmpty()) return getById(id);
        sql.append("updated_at = NOW() WHERE id = ?");
        params.add(id);
        jdbcTemplate.update(sql.toString().replace(",  WHERE", " WHERE"), params.toArray());
        return getById(id);
    }

    @Transactional
    public void deleteGroup(String id) {
        Set<String> toDelete = new HashSet<>();
        collectDescendantIds(id, toDelete);
        toDelete.add(id);
        for (String did : toDelete) {
            jdbcTemplate.update("DELETE FROM admin_nav_config WHERE id = ?", did);
        }
    }

    private void collectDescendantIds(String parentId, Set<String> out) {
        List<String> children = jdbcTemplate.queryForList(
                "SELECT id FROM admin_nav_config WHERE parent_id = ?", String.class, parentId);
        for (String cid : children) {
            out.add(cid);
            collectDescendantIds(cid, out);
        }
    }

    @Transactional
    public void moveItem(String itemId, String newParentId) {
        jdbcTemplate.update(
                "UPDATE admin_nav_config SET parent_id = ?, updated_at = NOW() WHERE id = ? AND type = 'ITEM'",
                newParentId, itemId);
    }

    @Transactional
    public void reorderItems(List<Map<String, Object>> orders) {
        for (Map<String, Object> o : orders) {
            jdbcTemplate.update(
                    "UPDATE admin_nav_config SET sort_order = ?, updated_at = NOW() WHERE id = ?",
                    o.get("sortOrder"), o.get("id"));
        }
    }

    @Transactional
    public void resetToDefault() {
        jdbcTemplate.update("DELETE FROM admin_nav_config");
        log.info("[admin-nav-config] 配置已清空，重启后将自动播种默认值");
    }

    private AdminNavConfigNode getById(String id) {
        List<AdminNavConfigNode> list = jdbcTemplate.query(
                "SELECT id, parent_id, type, title, item_path, item_icon, item_badge_key, sort_order, visible FROM admin_nav_config WHERE id = ?",
                new NodeRowMapper(), id);
        return list.isEmpty() ? null : list.get(0);
    }

    private static class NodeRowMapper implements RowMapper<AdminNavConfigNode> {
        @Override
        public AdminNavConfigNode mapRow(ResultSet rs, int rowNum) throws SQLException {
            AdminNavConfigNode n = new AdminNavConfigNode();
            n.setId(rs.getString("id"));
            n.setParentId(rs.getString("parent_id"));
            n.setType(rs.getString("type"));
            n.setTitle(rs.getString("title"));
            n.setItemPath(rs.getString("item_path"));
            n.setItemIcon(rs.getString("item_icon"));
            n.setItemBadgeKey(rs.getString("item_badge_key"));
            n.setSortOrder(rs.getInt("sort_order"));
            n.setVisible(rs.getInt("visible") == 1);
            return n;
        }
    }
}
