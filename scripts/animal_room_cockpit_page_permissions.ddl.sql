-- 动物房温湿度监测 / 动物房驾驶舱：WEB 侧栏 ENTRY（与 PagePermissionSchemaMigrator 启动种子一致）
-- 在目标库（如 application.properties 中 spring.datasource.url 指向的库）执行一次即可；INSERT IGNORE 可重复执行。

INSERT IGNORE INTO page_permission_item(
    platform, node_key, node_type, display_name, path_or_route, entry_source,
    min_role, default_min_role, enabled, parent_node_key, chain_key,
    auto_discovered, manual_override
) VALUES (
    'WEB', 'entry:web:twin:animal-room-telemetry', 'ENTRY', '动物房温湿度监测', '/animal-room-telemetry', 'sidebar',
    'ADMIN', 'ADMIN', 1, NULL, NULL,
    0, 0
);

INSERT IGNORE INTO page_permission_item(
    platform, node_key, node_type, display_name, path_or_route, entry_source,
    min_role, default_min_role, enabled, parent_node_key, chain_key,
    auto_discovered, manual_override
) VALUES (
    'WEB', 'entry:web:twin:animal-room-cockpit', 'ENTRY', '动物房驾驶舱', '/animal-room-cockpit', 'sidebar',
    'ADMIN', 'ADMIN', 1, NULL, NULL,
    0, 0
);
