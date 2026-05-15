-- 领用物资购物车云端存储（与 schema.sql 一致；目标库执行一次即可）
CREATE TABLE IF NOT EXISTS supply_user_cart (
    user_id VARCHAR(64) NOT NULL PRIMARY KEY COMMENT 'sys_user.id',
    lines_json MEDIUMTEXT NOT NULL COMMENT 'JSON：物资 itemId 字符串 -> 数量',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='领用物资购物车（Web/小程序多端同步）';
