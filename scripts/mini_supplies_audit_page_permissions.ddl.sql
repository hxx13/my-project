-- 小程序「领用审计」页面与权限入口（与 PagePermissionSchemaMigrator 启动种子一致）
-- 目标库执行一次即可；已存在 node_key 时 INSERT IGNORE 不报错。

INSERT IGNORE INTO page_permission_item(
    platform, node_key, node_type, display_name, path_or_route, entry_source,
    min_role, default_min_role, enabled, parent_node_key, chain_key,
    auto_discovered, manual_override
) VALUES (
    'MINI', 'page:mini:supplies-audit', 'PAGE', '领用审计', '/pages/suppliesAudit/index', NULL,
    'STAFF', 'STAFF', 1, NULL, NULL,
    0, 0
);

INSERT IGNORE INTO page_permission_item(
    platform, node_key, node_type, display_name, path_or_route, entry_source,
    min_role, default_min_role, enabled, parent_node_key, chain_key,
    auto_discovered, manual_override
) VALUES (
    'MINI', 'entry:mini:home:supplies-audit', 'ENTRY', '领用审计', '/pages/suppliesAudit/index', 'home',
    'STAFF', 'STAFF', 1, NULL, NULL,
    0, 0
);

INSERT IGNORE INTO page_permission_item(
    platform, node_key, node_type, display_name, path_or_route, entry_source,
    min_role, default_min_role, enabled, parent_node_key, chain_key,
    auto_discovered, manual_override
) VALUES (
    'MINI', 'entry:mini:mine:supplies-audit', 'ENTRY', '领用审计', '/pages/suppliesAudit/index', 'mine',
    'STAFF', 'STAFF', 1, NULL, NULL,
    0, 0
);

-- 已上线库：同步展示名称（INSERT IGNORE 不会更新旧行）
UPDATE page_permission_item SET display_name = '领用审计'
WHERE platform = 'MINI' AND node_key IN ('page:mini:supplies-audit', 'entry:mini:mine:supplies-audit');
