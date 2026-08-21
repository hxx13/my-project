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

    public List<AdminNavConfigNode> getFullTree(String scope) {
        List<AdminNavConfigNode> all = jdbcTemplate.query(
                "SELECT id, parent_id, type, scope, title, item_path, item_icon, item_badge_key, sort_order, visible FROM admin_nav_config WHERE scope = ? ORDER BY sort_order",
                new NodeRowMapper(), scope);

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
        sortTreeNodes(roots);
        return roots;
    }

    private void sortTreeNodes(List<AdminNavConfigNode> nodes) {
        nodes.sort(Comparator
                .comparingInt(AdminNavConfigNode::getSortOrder)
                .thenComparing(AdminNavConfigNode::getId));
        for (AdminNavConfigNode n : nodes) {
            sortTreeNodes(n.getChildren());
        }
    }

    @Transactional
    public AdminNavConfigNode createGroup(String scope, String parentId, String type, String title, int sortOrder) {
        boolean hasParent = parentId != null && !parentId.isBlank();
        if (hasParent) {
            AdminNavConfigNode parent = getById(parentId);
            if (parent == null) {
                throw new IllegalArgumentException("父文件夹不存在");
            }
            if (!scope.equals(parent.getScope())) {
                throw new IllegalArgumentException("父文件夹 scope 不一致");
            }
            if (!"GROUP".equals(parent.getType()) && !"SUBGROUP".equals(parent.getType())) {
                throw new IllegalArgumentException("只能在文件夹下创建子文件夹");
            }
            type = "SUBGROUP";
        } else {
            parentId = null;
            type = "GROUP";
        }
        if (sortOrder <= 0) {
            Integer maxSort = jdbcTemplate.queryForObject(
                    "SELECT COALESCE(MAX(sort_order), -1) FROM admin_nav_config WHERE parent_id <=> ? AND scope = ?",
                    Integer.class, parentId, scope);
            sortOrder = (maxSort != null ? maxSort : -1) + 1;
        }
        String id = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        jdbcTemplate.update(
                "INSERT INTO admin_nav_config (id, parent_id, type, scope, title, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
                id, parentId, type, scope, title, sortOrder);
        return getById(id);
    }

    /**
     * 在同级节点中上移/下移，并重排 sort_order 为连续序号（0..n-1）。
     */
    @Transactional
    public AdminNavConfigNode moveGroupRelative(String id, int delta) {
        AdminNavConfigNode node = getById(id);
        if (node == null) {
            throw new IllegalArgumentException("节点不存在");
        }
        if (!"GROUP".equals(node.getType()) && !"SUBGROUP".equals(node.getType())) {
            throw new IllegalArgumentException("仅文件夹可调整排序");
        }
        List<AdminNavConfigNode> siblings = listSiblings(node.getScope(), node.getParentId());
        List<Integer> folderIndices = new ArrayList<>();
        for (int i = 0; i < siblings.size(); i++) {
            AdminNavConfigNode s = siblings.get(i);
            if ("GROUP".equals(s.getType()) || "SUBGROUP".equals(s.getType())) {
                folderIndices.add(i);
            }
        }
        int folderPos = -1;
        for (int i = 0; i < folderIndices.size(); i++) {
            if (siblings.get(folderIndices.get(i)).getId().equals(id)) {
                folderPos = i;
                break;
            }
        }
        if (folderPos < 0) {
            throw new IllegalArgumentException("节点不在同级文件夹列表中");
        }
        int newFolderPos = folderPos + delta;
        if (newFolderPos < 0 || newFolderPos >= folderIndices.size()) {
            return node;
        }
        int idxA = folderIndices.get(folderPos);
        int idxB = folderIndices.get(newFolderPos);
        AdminNavConfigNode swap = siblings.get(idxB);
        siblings.set(idxB, siblings.get(idxA));
        siblings.set(idxA, swap);
        List<String> ids = new ArrayList<>();
        for (AdminNavConfigNode s : siblings) {
            ids.add(s.getId());
        }
        reindexSortOrders(ids);
        return getById(id);
    }

    private List<AdminNavConfigNode> listSiblings(String scope, String parentId) {
        if (parentId == null || parentId.isBlank()) {
            return jdbcTemplate.query(
                    "SELECT id, parent_id, type, scope, title, item_path, item_icon, item_badge_key, sort_order, visible "
                            + "FROM admin_nav_config WHERE parent_id IS NULL AND scope = ? ORDER BY sort_order, id",
                    new NodeRowMapper(), scope);
        }
        return jdbcTemplate.query(
                "SELECT id, parent_id, type, scope, title, item_path, item_icon, item_badge_key, sort_order, visible "
                        + "FROM admin_nav_config WHERE parent_id = ? AND scope = ? ORDER BY sort_order, id",
                new NodeRowMapper(), parentId, scope);
    }

    private void reindexSortOrders(List<String> ids) {
        for (int i = 0; i < ids.size(); i++) {
            jdbcTemplate.update(
                    "UPDATE admin_nav_config SET sort_order = ?, updated_at = NOW() WHERE id = ?",
                    i, ids.get(i));
        }
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
        AdminNavConfigNode item = getById(itemId);
        if (item == null) {
            throw new IllegalArgumentException("节点不存在");
        }
        if (newParentId != null && !newParentId.isBlank()) {
            AdminNavConfigNode parent = getById(newParentId);
            if (parent == null) {
                throw new IllegalArgumentException("目标文件夹不存在");
            }
            if (!item.getScope().equals(parent.getScope())) {
                throw new IllegalArgumentException("目标文件夹 scope 不一致");
            }
        }
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

    /**
     * 按给定顺序重排某父级（或顶层）下的同级节点，sort_order 重排为连续序号 0..n-1。
     * 兼容文件夹（GROUP/SUBGROUP）与入口（ITEM）混排；未出现在 orderedIds 中的同级兜底追加到末尾，
     * 避免 sort_order 残留导致排序错乱。
     */
    @Transactional
    public void reorderNodes(String scope, String parentId, List<String> orderedIds) {
        if (orderedIds == null) return;
        List<AdminNavConfigNode> siblings = listSiblings(scope, parentId);
        Set<String> siblingIds = new HashSet<>();
        for (AdminNavConfigNode s : siblings) siblingIds.add(s.getId());

        LinkedHashSet<String> reordered = new LinkedHashSet<>();
        for (String id : orderedIds) {
            if (id != null && siblingIds.contains(id)) reordered.add(id);
        }
        for (AdminNavConfigNode s : siblings) reordered.add(s.getId());
        reindexSortOrders(new ArrayList<>(reordered));
    }

    /**
     * 确保一个入口存在于 DB 中（如不存在则自动创建）。
     * 若所属 GROUP 不存在也自动创建。
     */
    @Transactional
    public Map<String, Object> ensureItem(String scope, String path, String label, String icon, String groupTitle) {
        // 找到或创建 GROUP
        String groupId = findOrCreateGroup(scope, groupTitle);

        // 获取当前最大 sort_order
        Integer maxSort = jdbcTemplate.queryForObject(
                "SELECT COALESCE(MAX(sort_order), -1) FROM admin_nav_config WHERE parent_id = ? AND scope = ?",
                Integer.class, groupId, scope);
        int sortOrder = (maxSort != null ? maxSort : -1) + 1;

        // INSERT ... ON DUPLICATE KEY UPDATE —— UNIQUE(scope, item_path) 保证无竞态重复
        String id = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        int affected = jdbcTemplate.update(
                "INSERT INTO admin_nav_config (id, parent_id, type, scope, title, item_path, item_icon, sort_order, visible) " +
                "VALUES (?, ?, 'ITEM', ?, ?, ?, ?, ?, 1) " +
                "ON DUPLICATE KEY UPDATE title = VALUES(title), parent_id = VALUES(parent_id), " +
                "item_icon = VALUES(item_icon), sort_order = VALUES(sort_order), visible = 1",
                id, groupId, scope, label, path, icon, sortOrder);
        if (affected == 0) {
            // duplicate key hit an existing row but no update needed
            List<String> existing = jdbcTemplate.queryForList(
                    "SELECT id FROM admin_nav_config WHERE item_path = ? AND type = 'ITEM' AND scope = ?",
                    String.class, path, scope);
            if (!existing.isEmpty()) return Map.of("existed", true, "id", existing.get(0));
        }
        log.info("[admin-nav-config] ensureItem created: scope={} path={} label={} group={}", scope, path, label, groupTitle);
        return Map.of("existed", false, "id", id, "created", true);
    }

    private String findOrCreateGroup(String scope, String title) {
        List<String> existing = jdbcTemplate.queryForList(
                "SELECT id FROM admin_nav_config WHERE title = ? AND type = 'GROUP' AND scope = ?",
                String.class, title, scope);
        if (!existing.isEmpty()) {
            return existing.get(0);
        }
        // 创建 GROUP
        String id = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        Integer maxSort = jdbcTemplate.queryForObject(
                "SELECT COALESCE(MAX(sort_order), -1) FROM admin_nav_config WHERE parent_id IS NULL AND type = 'GROUP' AND scope = ?",
                Integer.class, scope);
        int sortOrder = (maxSort != null ? maxSort : -1) + 1;
        jdbcTemplate.update(
                "INSERT INTO admin_nav_config (id, parent_id, type, scope, title, sort_order, visible) VALUES (?, NULL, 'GROUP', ?, ?, ?, 1)",
                id, scope, title, sortOrder);
        log.info("[admin-nav-config] findOrCreateGroup created: scope={} title={}", scope, title);
        return id;
    }

    @Transactional
    public void resetToDefault(String scope) {
        jdbcTemplate.update("DELETE FROM admin_nav_config WHERE scope = ?", scope);
        log.info("[admin-nav-config] scope={} 配置已清空，重启后将自动播种默认值", scope);
    }

    private AdminNavConfigNode getById(String id) {
        List<AdminNavConfigNode> list = jdbcTemplate.query(
                "SELECT id, parent_id, type, scope, title, item_path, item_icon, item_badge_key, sort_order, visible FROM admin_nav_config WHERE id = ?",
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
            n.setScope(rs.getString("scope"));
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
