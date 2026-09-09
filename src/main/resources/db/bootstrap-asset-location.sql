-- 资产存放地点树（表定义与 common/schema/V20260909__asset_location.sql 一致）
-- 只建新表：asset_record 由 AssetSchemaMigrator（ApplicationRunner）创建，晚于本启动链，
-- 因此 location_node_id 列与索引改在 AssetSchemaMigrator.ensureColumnExists/ensureIndexExists 里补。
CREATE TABLE IF NOT EXISTS asset_location (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    parent_id BIGINT NULL COMMENT '父节点ID，NULL=顶层',
    name VARCHAR(128) NOT NULL COMMENT '节点名称',
    sort_order INT NOT NULL DEFAULT 0 COMMENT '同级排序',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '软删：1=删',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_al_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产存放地点树';
