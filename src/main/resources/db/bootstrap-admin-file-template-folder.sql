-- 文件模板库的文件夹树。结构对齐 asset_location（资产地点树）。
-- 改动此处请同步设计文档 docs/02-设计存档/计划文档/2026-09-15-文件模板文件夹管理器-design.md
CREATE TABLE IF NOT EXISTS admin_file_template_folder (
    id BIGINT NOT NULL AUTO_INCREMENT,
    parent_id BIGINT DEFAULT NULL COMMENT '父节点ID，NULL=根层',
    name VARCHAR(128) NOT NULL COMMENT '文件夹名称',
    sort_order INT NOT NULL DEFAULT 0 COMMENT '同级排序',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '软删：1=删',
    icon VARCHAR(16) DEFAULT NULL COMMENT '文件夹图标 emoji',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_aftf_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件模板库文件夹树';
