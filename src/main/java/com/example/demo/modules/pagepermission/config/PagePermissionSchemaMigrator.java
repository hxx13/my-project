package com.example.demo.modules.pagepermission.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(130)
public class PagePermissionSchemaMigrator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(PagePermissionSchemaMigrator.class);
    private final JdbcTemplate jdbcTemplate;

    public PagePermissionSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS page_permission_item (
                        id BIGINT PRIMARY KEY AUTO_INCREMENT,
                        platform VARCHAR(16) NOT NULL COMMENT 'WEB/MINI',
                        node_key VARCHAR(255) NOT NULL COMMENT '唯一节点键',
                        node_type VARCHAR(16) NOT NULL COMMENT 'PAGE/ENTRY',
                        display_name VARCHAR(255) NULL COMMENT '展示名',
                        path_or_route VARCHAR(255) NOT NULL COMMENT '路由或pagePath',
                        entry_source VARCHAR(64) NULL COMMENT 'sidebar/tabbar/mine/home/other',
                        min_role VARCHAR(32) NOT NULL DEFAULT 'STUDENT' COMMENT '最小角色阈值',
                        default_min_role VARCHAR(32) NOT NULL DEFAULT 'STUDENT' COMMENT '扫描推断默认阈值',
                        enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用',
                        parent_node_key VARCHAR(255) NULL COMMENT '父节点',
                        chain_key VARCHAR(255) NULL COMMENT '同页多入口联动键',
                        auto_discovered TINYINT NOT NULL DEFAULT 1 COMMENT '自动发现',
                        manual_override TINYINT NOT NULL DEFAULT 0 COMMENT '人工覆盖',
                        last_discovered_at DATETIME NULL COMMENT '最近扫描时间',
                        created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY uk_page_permission_node_key (node_key),
                        KEY idx_page_permission_platform (platform),
                        KEY idx_page_permission_chain (chain_key)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='页面与入口权限配置'
                    """);
            log.info("[page-permission-schema] 页面权限表结构已就绪");
        } catch (Exception e) {
            log.error("[page-permission-schema] 迁移失败: {}", e.getMessage());
        }
        try {
            jdbcTemplate.execute("""
                    INSERT IGNORE INTO page_permission_item(
                        platform, node_key, node_type, display_name, path_or_route, entry_source,
                        min_role, default_min_role, enabled, parent_node_key, chain_key,
                        auto_discovered, manual_override
                    ) VALUES (
                        'WEB', 'entry:web:admin:telemetry-archive', 'ENTRY', '温湿度数据归档', '/admin/telemetry-archive', 'sidebar',
                        'ADMIN', 'ADMIN', 1, NULL, NULL,
                        0, 0
                    )
                    """);
            log.info("[page-permission-schema] 已种子 WEB sidebar：温湿度数据归档（INSERT IGNORE）");
        } catch (Exception e) {
            log.debug("[page-permission-schema] telemetry-archive 入口种子跳过: {}", e.getMessage());
        }
        try {
            jdbcTemplate.execute("""
                    INSERT IGNORE INTO page_permission_item(
                        platform, node_key, node_type, display_name, path_or_route, entry_source,
                        min_role, default_min_role, enabled, parent_node_key, chain_key,
                        auto_discovered, manual_override
                    ) VALUES (
                        'WEB', 'entry:web:admin:facility-maintenance', 'ENTRY', '检查维护', '/admin/facility-maintenance', 'sidebar',
                        'STAFF', 'STAFF', 1, NULL, NULL,
                        0, 0
                    )
                    """);
            jdbcTemplate.execute("""
                    INSERT IGNORE INTO page_permission_item(
                        platform, node_key, node_type, display_name, path_or_route, entry_source,
                        min_role, default_min_role, enabled, parent_node_key, chain_key,
                        auto_discovered, manual_override
                    ) VALUES (
                        'MINI', 'entry:mini:mine:facility-maintenance', 'ENTRY', '检查维护', '/pages/facilityMaintenance/index', 'mine',
                        'STAFF', 'STAFF', 1, NULL, NULL,
                        0, 0
                    )
                    """);
            log.info("[page-permission-schema] 已种子 检查维护 WEB/MINI（INSERT IGNORE）");
        } catch (Exception e) {
            log.debug("[page-permission-schema] facility-maintenance 入口种子跳过: {}", e.getMessage());
        }
        try {
            jdbcTemplate.execute("""
                    INSERT IGNORE INTO page_permission_item(
                        platform, node_key, node_type, display_name, path_or_route, entry_source,
                        min_role, default_min_role, enabled, parent_node_key, chain_key,
                        auto_discovered, manual_override
                    ) VALUES (
                        'WEB', 'entry:web:admin:file-templates', 'ENTRY', '文件模板库', '/admin/file-templates', 'sidebar',
                        'STAFF', 'STAFF', 1, NULL, NULL,
                        0, 0
                    )
                    """);
            log.info("[page-permission-schema] 已种子 WEB sidebar：文件模板下载（INSERT IGNORE）");
        } catch (Exception e) {
            log.debug("[page-permission-schema] file-templates 入口种子跳过: {}", e.getMessage());
        }
        try {
            jdbcTemplate.execute("""
                    INSERT IGNORE INTO page_permission_item(
                        platform, node_key, node_type, display_name, path_or_route, entry_source,
                        min_role, default_min_role, enabled, parent_node_key, chain_key,
                        auto_discovered, manual_override
                    ) VALUES (
                        'MINI', 'entry:mini:mine:file-templates', 'ENTRY', '文件模板库', '/pages/fileTemplates/index', 'mine',
                        'STAFF', 'STAFF', 1, NULL, NULL,
                        0, 0
                    )
                    """);
            log.info("[page-permission-schema] 已种子 MINI mine：文件模板下载（INSERT IGNORE）");
        } catch (Exception e) {
            log.debug("[page-permission-schema] MINI file-templates 入口种子跳过: {}", e.getMessage());
        }
        try {
            jdbcTemplate.execute("""
                    INSERT IGNORE INTO page_permission_item(
                        platform, node_key, node_type, display_name, path_or_route, entry_source,
                        min_role, default_min_role, enabled, parent_node_key, chain_key,
                        auto_discovered, manual_override
                    ) VALUES (
                        'WEB', 'entry:web:admin:content-hub', 'ENTRY', '小程序内容中心', '/admin/content-hub', 'sidebar',
                        'ADMIN', 'ADMIN', 1, NULL, NULL,
                        0, 0
                    )
                    """);
            log.info("[page-permission-schema] 已种子 WEB sidebar：小程序内容中心（INSERT IGNORE）");
        } catch (Exception e) {
            log.debug("[page-permission-schema] content-hub WEB 入口种子跳过: {}", e.getMessage());
        }
        try {
            jdbcTemplate.execute("""
                    INSERT IGNORE INTO page_permission_item(
                        platform, node_key, node_type, display_name, path_or_route, entry_source,
                        min_role, default_min_role, enabled, parent_node_key, chain_key,
                        auto_discovered, manual_override
                    ) VALUES (
                        'MINI', 'entry:mini:settings:announcement-admin', 'ENTRY', '公告管理', '/pages/announcementAdmin/index', 'settings',
                        'ADMIN', 'ADMIN', 1, NULL, NULL,
                        0, 0
                    )
                    """);
            jdbcTemplate.execute("""
                    INSERT IGNORE INTO page_permission_item(
                        platform, node_key, node_type, display_name, path_or_route, entry_source,
                        min_role, default_min_role, enabled, parent_node_key, chain_key,
                        auto_discovered, manual_override
                    ) VALUES (
                        'MINI', 'entry:mini:settings:release-notes-admin', 'ENTRY', '版本公告管理', '/pages/releaseNotesAdmin/index', 'settings',
                        'PLATFORM_OWNER', 'PLATFORM_OWNER', 1, NULL, NULL,
                        0, 0
                    )
                    """);
            log.info("[page-permission-schema] 已种子 MINI settings：公告/版本管理入口（INSERT IGNORE）");
        } catch (Exception e) {
            log.debug("[page-permission-schema] MINI 内容管理入口种子跳过: {}", e.getMessage());
        }
        try {
            jdbcTemplate.execute("""
                    INSERT IGNORE INTO page_permission_item(
                        platform, node_key, node_type, display_name, path_or_route, entry_source,
                        min_role, default_min_role, enabled, parent_node_key, chain_key,
                        auto_discovered, manual_override
                    ) VALUES (
                        'MINI', 'page:mini:supplies-audit', 'PAGE', '领用审计', '/pages/suppliesAudit/index', NULL,
                        'STAFF', 'STAFF', 1, NULL, NULL,
                        0, 0
                    )
                    """);
            jdbcTemplate.execute("""
                    INSERT IGNORE INTO page_permission_item(
                        platform, node_key, node_type, display_name, path_or_route, entry_source,
                        min_role, default_min_role, enabled, parent_node_key, chain_key,
                        auto_discovered, manual_override
                    ) VALUES (
                        'MINI', 'entry:mini:home:supplies-audit', 'ENTRY', '领用审计', '/pages/suppliesAudit/index', 'home',
                        'STAFF', 'STAFF', 1, NULL, NULL,
                        0, 0
                    )
                    """);
            jdbcTemplate.execute("""
                    INSERT IGNORE INTO page_permission_item(
                        platform, node_key, node_type, display_name, path_or_route, entry_source,
                        min_role, default_min_role, enabled, parent_node_key, chain_key,
                        auto_discovered, manual_override
                    ) VALUES (
                        'MINI', 'entry:mini:mine:supplies-audit', 'ENTRY', '领用审计', '/pages/suppliesAudit/index', 'mine',
                        'STAFF', 'STAFF', 1, NULL, NULL,
                        0, 0
                    )
                    """);
            try {
                jdbcTemplate.update("""
                        UPDATE page_permission_item SET display_name = '领用审计'
                        WHERE platform = 'MINI' AND node_key IN ('page:mini:supplies-audit', 'entry:mini:mine:supplies-audit')
                        """);
            } catch (Exception e) {
                log.debug("[page-permission-schema] MINI supplies-audit 展示名同步跳过: {}", e.getMessage());
            }
            log.info("[page-permission-schema] 已种子 MINI：领用审计 PAGE + home/mine 入口（INSERT IGNORE）");
        } catch (Exception e) {
            log.debug("[page-permission-schema] MINI supplies-audit 入口种子跳过: {}", e.getMessage());
        }
        try {
            jdbcTemplate.execute("""
                    INSERT IGNORE INTO page_permission_item(
                        platform, node_key, node_type, display_name, path_or_route, entry_source,
                        min_role, default_min_role, enabled, parent_node_key, chain_key,
                        auto_discovered, manual_override
                    ) VALUES (
                        'WEB', 'entry:web:twin:animal-room-telemetry', 'ENTRY', '动物房温湿度监测', '/animal-room-telemetry', 'sidebar',
                        'ADMIN', 'ADMIN', 1, NULL, NULL,
                        0, 0
                    )
                    """);
            jdbcTemplate.execute("""
                    INSERT IGNORE INTO page_permission_item(
                        platform, node_key, node_type, display_name, path_or_route, entry_source,
                        min_role, default_min_role, enabled, parent_node_key, chain_key,
                        auto_discovered, manual_override
                    ) VALUES (
                        'WEB', 'entry:web:twin:animal-room-cockpit', 'ENTRY', '动物房驾驶舱', '/animal-room-cockpit', 'sidebar',
                        'ADMIN', 'ADMIN', 1, NULL, NULL,
                        0, 0
                    )
                    """);
            log.info("[page-permission-schema] 已种子 WEB sidebar：动物房温湿度/驾驶舱 Twin 全屏入口（INSERT IGNORE）");
        } catch (Exception e) {
            log.debug("[page-permission-schema] 动物房 Twin 入口种子跳过: {}", e.getMessage());
        }
        try {
            jdbcTemplate.execute("""
                    INSERT IGNORE INTO page_permission_item(
                        platform, node_key, node_type, display_name, path_or_route, entry_source,
                        min_role, default_min_role, enabled, parent_node_key, chain_key,
                        auto_discovered, manual_override
                    ) VALUES (
                        'WEB', 'entry:web:admin:analytics', 'ENTRY', '统计与审计', '/admin/analytics', 'sidebar',
                        'STAFF', 'STAFF', 1, NULL, NULL,
                        0, 0
                    )
                    """);
            log.info("[page-permission-schema] 已种子 WEB sidebar：统计与审计（INSERT IGNORE）");
        } catch (Exception e) {
            log.debug("[page-permission-schema] 统计与审计入口种子跳过: {}", e.getMessage());
        }
    }
}

