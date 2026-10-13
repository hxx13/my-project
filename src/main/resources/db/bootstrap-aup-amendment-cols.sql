-- ============================================================
-- aup_record 增加「修订轨道」三列，支撑通过后修改（小修/大修）。
-- 修订期间 current_stage 恒为 approved 不动，进度与内容走本轨道，
-- 因此所有既有生效判定（订购可用性、笼位绑定、到期扫描）零改动。
-- 幂等：逐列判断 information_schema 后 ALTER。
-- 同源：common/schema/V20260942__aup_amendment_cols.sql
-- ============================================================

-- ① 修订轨道当前阶段（NULL = 无修订进行中）：draft/piReview/formatReview/expertReview
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aup_record' AND COLUMN_NAME = 'amendment_stage');
SET @sql = IF(@col = 0, 'ALTER TABLE aup_record ADD COLUMN amendment_stage VARCHAR(32) NULL COMMENT ''修订轨道阶段（NULL=无修订）：draft/piReview/formatReview/expertReview''', 'SELECT ''amendment_stage exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ② 修订中的完整内容（修订期间 aup_data.data 保持为现行有效版本不动）
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aup_record' AND COLUMN_NAME = 'amendment_data');
SET @sql = IF(@col = 0, 'ALTER TABLE aup_record ADD COLUMN amendment_data MEDIUMTEXT NULL COMMENT ''修订中的计划书内容（通过后写入 aup_data.data）''', 'SELECT ''amendment_data exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ③ 计划书版本号（大修审核通过后 +1）
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aup_record' AND COLUMN_NAME = 'plan_version');
SET @sql = IF(@col = 0, 'ALTER TABLE aup_record ADD COLUMN plan_version INT NOT NULL DEFAULT 1 COMMENT ''计划书版本号，大修通过后递增''', 'SELECT ''plan_version exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
