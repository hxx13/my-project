-- 一次性修正：旧版 person_identity 用 tag_code(VARCHAR)，新版改为 tag_id(BIGINT)。
-- 幂等：仅当仍存在旧列 tag_code 时才 DROP 整表；随后由 bootstrap-person-identity.sql 的
-- CREATE TABLE IF NOT EXISTS 按新结构（tag_id）重建。该表当前为空（所有插入均因列名不匹配失败），DROP 无数据损失。
SET @old := (SELECT COUNT(1) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'person_identity' AND COLUMN_NAME = 'tag_code');
SET @sql := IF(@old > 0, 'DROP TABLE person_identity', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
