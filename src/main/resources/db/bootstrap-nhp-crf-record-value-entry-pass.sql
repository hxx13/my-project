-- ============================================================
-- NHP 双录入：crf_record_value.entry_pass（1=一录 2=二录）
-- 由 EmbeddedTwinSystemCoreDdlBootstrap 启动幂等执行。
-- 同源：common/schema/V20260821010__crf_record_value_entry_pass.sql
-- 说明：CREATE TABLE IF NOT EXISTS 不会给已有表加列，故单独 ALTER。
-- ============================================================

SET @db := DATABASE();

-- ① 补齐 entry_pass 列
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_record_value' AND COLUMN_NAME = 'entry_pass'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_record_value ADD COLUMN entry_pass TINYINT NOT NULL DEFAULT 1 COMMENT ''1=一录 2=二录'' AFTER entry_mode',
  'SELECT ''entry_pass exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ② 清理可能的重复（同 record+field+pass 保留最小 id）后再加唯一约束
DELETE t1 FROM crf_record_value t1
INNER JOIN crf_record_value t2
  ON t1.record_id = t2.record_id
 AND t1.field_id = t2.field_id
 AND COALESCE(t1.entry_pass, 1) = COALESCE(t2.entry_pass, 1)
 AND t1.id > t2.id;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_record_value' AND INDEX_NAME = 'uk_crf_rv_record_field_pass'
);
SET @sql = IF(@idx = 0,
  'ALTER TABLE crf_record_value ADD UNIQUE KEY uk_crf_rv_record_field_pass (record_id, field_id, entry_pass)',
  'SELECT ''uk_crf_rv_record_field_pass exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
