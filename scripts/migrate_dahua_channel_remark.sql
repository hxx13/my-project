-- 通道编码备注分类 + dahua_device_channel_cache.remark_category_id
-- 适用于已有库升级；可重复执行（用存储过程判断，避免重复加列/重复索引/重复外键报错）

SET @OLD_UNIQUE_CHECKS = @@UNIQUE_CHECKS;
SET UNIQUE_CHECKS = 0;

CREATE TABLE IF NOT EXISTS dahua_device_channel_remark_category (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '备注分类ID',
    name VARCHAR(128) NOT NULL COMMENT '分类名称（用于通道备注下拉）',
    sort_order INT NOT NULL DEFAULT 0 COMMENT '排序，越小越靠前',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_dcc_remark_cat_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通道编码备注分类（可配置）';

DELIMITER $$

DROP PROCEDURE IF EXISTS proc_add_dcc_remark_column$$
CREATE PROCEDURE proc_add_dcc_remark_column()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'dahua_device_channel_cache'
          AND COLUMN_NAME = 'remark_category_id'
    ) THEN
        ALTER TABLE dahua_device_channel_cache
            ADD COLUMN remark_category_id BIGINT NULL
                COMMENT '本地备注分类（标签/二次封装）'
            AFTER device_type;
    END IF;
END$$

DROP PROCEDURE IF EXISTS proc_add_dcc_remark_index$$
CREATE PROCEDURE proc_add_dcc_remark_index()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'dahua_device_channel_cache'
          AND INDEX_NAME = 'idx_dcc_remark_cat'
    ) THEN
        CREATE INDEX idx_dcc_remark_cat ON dahua_device_channel_cache (remark_category_id);
    END IF;
END$$

DROP PROCEDURE IF EXISTS proc_add_dcc_remark_fk$$
CREATE PROCEDURE proc_add_dcc_remark_fk()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND TABLE_NAME = 'dahua_device_channel_cache'
          AND CONSTRAINT_NAME = 'fk_dcc_remark_cat'
          AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    ) THEN
        ALTER TABLE dahua_device_channel_cache
            ADD CONSTRAINT fk_dcc_remark_cat
            FOREIGN KEY (remark_category_id)
            REFERENCES dahua_device_channel_remark_category (id)
            ON DELETE SET NULL;
    END IF;
END$$

DELIMITER ;

CALL proc_add_dcc_remark_column();
CALL proc_add_dcc_remark_index();
CALL proc_add_dcc_remark_fk();

DROP PROCEDURE IF EXISTS proc_add_dcc_remark_fk;
DROP PROCEDURE IF EXISTS proc_add_dcc_remark_index;
DROP PROCEDURE IF EXISTS proc_add_dcc_remark_column;

SET UNIQUE_CHECKS = @OLD_UNIQUE_CHECKS;

SELECT 'migrate_dahua_channel_remark ok' AS result;
