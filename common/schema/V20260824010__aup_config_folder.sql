-- =============================================================
-- AUP 配置面通用文件夹表（码表/字段/原子域三处共用）
-- 归档迁移，与 src/main/resources/db/bootstrap-aup-config-folder.sql 同源。
-- 幂等：CREATE TABLE IF NOT EXISTS。
-- =============================================================

CREATE TABLE IF NOT EXISTS aup_folder (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    owner_type  VARCHAR(16)  NOT NULL COMMENT 'CODELIST/FIELD/ATOM',
    parent_id   BIGINT       NOT NULL DEFAULT 0 COMMENT '自引用父文件夹；0=根（用 0 而非 NULL，保证同级重名可被唯一键拦截）',
    name        VARCHAR(64)  NOT NULL COMMENT '文件夹显示名',
    sort_order  INT          NOT NULL DEFAULT 0 COMMENT '同级排序',
    description VARCHAR(255) NULL COMMENT '说明',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_aup_folder_owner_parent_name (owner_type, parent_id, name),
    KEY idx_aup_folder_tree (owner_type, parent_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AUP配置面通用文件夹（码表/字段/原子域共用）';

-- 存量 dict.category 回填为 CODELIST 文件夹（幂等：NOT EXISTS 去重）
INSERT INTO aup_folder (owner_type, parent_id, name, sort_order)
SELECT 'CODELIST', 0, d.category, 0
FROM (SELECT DISTINCT category FROM dict WHERE category IS NOT NULL AND TRIM(category) <> '') d
WHERE NOT EXISTS (
    SELECT 1 FROM aup_folder f
    WHERE f.owner_type = 'CODELIST' AND f.parent_id = 0 AND f.name = d.category
);
