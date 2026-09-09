-- 资产存放地点树 + 资产地点外键（与 common/schema/V20260909__asset_location.sql 逐字一致）
-- 第 2 条起重复执行会报「已存在」，由 EmbeddedTwinSystemCoreDdlBootstrap.isBenignInChain 兜住
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

ALTER TABLE asset_record ADD COLUMN location_node_id BIGINT NULL COMMENT '所属存放地点节点ID';
CREATE INDEX idx_asset_record_loc_node ON asset_record(location_node_id);
