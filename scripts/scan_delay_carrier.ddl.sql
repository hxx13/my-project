-- 扫码延迟：载体按钮 + 二级菜单分层（目标库 twin_system）
-- 执行一次即可；与 schema.sql 中 twin_scan_delay_carrier 定义一致

CREATE TABLE IF NOT EXISTS twin_scan_delay_carrier (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    button_label VARCHAR(32) NOT NULL DEFAULT '延迟' COMMENT '载体按钮文案',
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='扫码延迟载体按钮';

SET @col_exists := (
    SELECT COUNT(1) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'twin_scan_delay_option'
      AND COLUMN_NAME = 'carrier_id'
);
SET @ddl := IF(
    @col_exists = 0,
    'ALTER TABLE twin_scan_delay_option ADD COLUMN carrier_id BIGINT NULL COMMENT ''twin_scan_delay_carrier.id'' AFTER id',
    'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 按既有 button_label 迁移载体（幂等：仅处理 carrier_id 为空的行）
INSERT INTO twin_scan_delay_carrier (button_label, enabled, sort_order)
SELECT DISTINCT TRIM(button_label), 1, 0
FROM twin_scan_delay_option
WHERE carrier_id IS NULL
  AND TRIM(button_label) <> ''
  AND TRIM(button_label) NOT IN (SELECT button_label FROM twin_scan_delay_carrier);

UPDATE twin_scan_delay_option o
INNER JOIN twin_scan_delay_carrier c ON c.button_label = TRIM(o.button_label)
SET o.carrier_id = c.id
WHERE o.carrier_id IS NULL;

INSERT INTO twin_scan_delay_carrier (button_label, enabled, sort_order)
SELECT '延迟', 1, 0
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM twin_scan_delay_carrier LIMIT 1);

UPDATE twin_scan_delay_option
SET carrier_id = (SELECT id FROM twin_scan_delay_carrier ORDER BY id ASC LIMIT 1)
WHERE carrier_id IS NULL;
