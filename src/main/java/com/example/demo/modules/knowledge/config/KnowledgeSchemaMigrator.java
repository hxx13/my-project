package com.example.demo.modules.knowledge.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(110)
public class KnowledgeSchemaMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeSchemaMigrator.class);

    private final JdbcTemplate jdbcTemplate;

    public KnowledgeSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            // 1. 建表 + 迁移（递增式 ALTER，幂等安全）
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS knowledge_categories (
                        id          BIGINT AUTO_INCREMENT PRIMARY KEY,
                        parent_id   BIGINT        NULL COMMENT '父分类ID（NULL=顶级）',
                        name        VARCHAR(100)  NOT NULL COMMENT '分类名称',
                        slug        VARCHAR(100)  NOT NULL UNIQUE COMMENT 'URL 标识',
                        sort_order  INT           DEFAULT 0 COMMENT '排序',
                        icon        VARCHAR(50)   DEFAULT 'BookOpen' COMMENT 'Lucide 图标名',
                        description VARCHAR(300)  COMMENT '分类描述',
                        created_at  DATETIME      DEFAULT NOW(),
                        updated_at  DATETIME      DEFAULT NOW(),
                        FOREIGN KEY (parent_id) REFERENCES knowledge_categories(id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识库分类'
                    """);

            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS knowledge_pages (
                        id            BIGINT AUTO_INCREMENT PRIMARY KEY,
                        category_id   BIGINT        NOT NULL COMMENT '关联分类',
                        slug          VARCHAR(200)  NOT NULL COMMENT 'URL 标识',
                        title         VARCHAR(300)  NOT NULL COMMENT '文档标题',
                        content_html  MEDIUMTEXT    NOT NULL COMMENT '内容（渲染用）',
                        content_md    MEDIUMTEXT    COMMENT 'Markdown 内容（编辑用）',
                        source        VARCHAR(20)   DEFAULT 'manual' COMMENT '来源：imported/agent/manual',
                        version       INT           DEFAULT 1 COMMENT '版本号',
                        author        VARCHAR(100)  DEFAULT 'system' COMMENT '作者',
                        is_published  TINYINT(1)    DEFAULT 1 COMMENT '是否发布',
                        created_at    DATETIME      DEFAULT NOW(),
                        updated_at    DATETIME      DEFAULT NOW(),
                        UNIQUE INDEX idx_category_slug (category_id, slug),
                        INDEX idx_category (category_id),
                        INDEX idx_updated (updated_at),
                        FOREIGN KEY (category_id) REFERENCES knowledge_categories(id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识库文档'
                    """);

            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS knowledge_history (
                        id           BIGINT AUTO_INCREMENT PRIMARY KEY,
                        page_id      BIGINT        NOT NULL COMMENT '关联文档',
                        version      INT           NOT NULL COMMENT '版本号',
                        content_html MEDIUMTEXT    NOT NULL COMMENT '该版本的内容快照',
                        content_md   MEDIUMTEXT    COMMENT '该版本的 MD 快照',
                        author       VARCHAR(100)  NOT NULL COMMENT '作者',
                        summary      VARCHAR(500)  COMMENT '修改摘要',
                        created_at   DATETIME      DEFAULT NOW(),
                        FOREIGN KEY (page_id) REFERENCES knowledge_pages(id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识库版本历史'
                    """);

            // 迁移：为已有表添加 parent_id 列（幂等）
            addColumnIfMissing("knowledge_categories", "parent_id",
                "BIGINT NULL COMMENT '父分类ID（NULL=顶级）'");

            // 迁移：为已有表添加 tags 列（幂等）
            addColumnIfMissing("knowledge_pages", "tags",
                "JSON DEFAULT '[]' COMMENT '标签数组'");

            log.info("[knowledge-schema] 三张表已就绪");

            // 2. 页面权限种子数据
            seedPagePermissions();

        } catch (Exception e) {
            log.error("[knowledge-schema] 迁移失败: {}", e.getMessage());
        }
    }

    private void addColumnIfMissing(String table, String column, String definition) {
        try {
            jdbcTemplate.queryForObject("SELECT " + column + " FROM " + table + " LIMIT 1", Object.class);
        } catch (Exception e) {
            jdbcTemplate.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
            log.info("[knowledge-schema] {} {} 列已添加", table, column);
        }
    }

    private void seedPagePermissions() {
        String[][] seeds = {
            {"WEB", "knowledge", "ENTRY", "知识库（入口）", "/admin/knowledge", "sidebar", "STAFF", "STAFF", "1"},
            {"WEB", "knowledge:edit", "ENTRY", "知识库 - 编辑", "/admin/knowledge", "sidebar", "ADMIN", "ADMIN", "1"},
            {"WEB", "knowledge:categories", "ENTRY", "知识库 - 分类管理", "/admin/knowledge", "sidebar", "SUPER_ADMIN", "SUPER_ADMIN", "1"},
        };

        for (String[] seed : seeds) {
            try {
                jdbcTemplate.update(
                    "INSERT IGNORE INTO page_permission_item (platform, node_key, node_type, display_name, path_or_route, entry_source, min_role, default_min_role, enabled) " +
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (Object[]) seed);
            } catch (Exception e) {
                log.warn("[knowledge-schema] 权限种子 {} 插入失败: {}", seed[1], e.getMessage());
            }
        }
    }
}
