-- =============================================================
-- NHP 码表整表版本：同一 code 多版本行（幂等）
-- 由 EmbeddedTwinSystemCoreDdlBootstrap 启动执行
-- 同源：common/schema/V20260821017__nhp_codelist_version.sql
-- =============================================================

SET @db := DATABASE();

-- 旧唯一键 uk_crf_codelist_code → 活跃版号唯一（软删可补位；最终由 bootstrap-nhp-version-reuse 对齐）
SET @uk_old := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_codelist' AND INDEX_NAME = 'uk_crf_codelist_code'
);
SET @sql = IF(@uk_old > 0,
  'ALTER TABLE crf_codelist DROP INDEX uk_crf_codelist_code',
  'SELECT ''uk_crf_codelist_code already dropped''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 若尚未有任何 (code,version) 类唯一键，先挂旧键；version-reuse 脚本会再换成 active-only
SET @uk_ver := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_codelist'
    AND INDEX_NAME IN ('uk_crf_codelist_code_ver', 'uk_crf_codelist_code_active_ver')
);
SET @sql = IF(@uk_ver = 0,
  'ALTER TABLE crf_codelist ADD UNIQUE KEY uk_crf_codelist_code_ver (code, version)',
  'SELECT ''crf_codelist code+version unique already present''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE crf_codelist SET status = 'DRAFT' WHERE status = 'ACTIVE' AND active = 1;
