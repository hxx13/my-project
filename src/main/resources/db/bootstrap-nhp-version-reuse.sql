-- =============================================================
-- NHP 版号补位：唯一键仅约束活跃行（幂等）
-- 由 EmbeddedTwinSystemCoreDdlBootstrap 启动执行
-- 同源：common/schema/V20260821018__nhp_version_reuse_uk.sql
--
-- 应用层约定（优先）：补位落库须复活同 (code,version) 的 inactive 行
-- （NhpTemplateService / NhpCodelistService insertOrReactivate*），
-- 勿对软删槽再 INSERT。本 UK 为防御网：旧库未迁完时仍可能撞
-- uk_crf_*_code_ver；迁完后可防「双行同版号」。
-- =============================================================

SET @db := DATABASE();

-- ---------- crf_form ----------
SET @uk_form_old := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_form' AND INDEX_NAME = 'uk_crf_form_study_code_ver'
);
SET @sql = IF(@uk_form_old > 0,
  'ALTER TABLE crf_form DROP INDEX uk_crf_form_study_code_ver',
  'SELECT ''uk_crf_form_study_code_ver already dropped''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @uk_form_new := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_form' AND INDEX_NAME = 'uk_crf_form_study_code_active_ver'
);
SET @sql = IF(@uk_form_new = 0,
  'ALTER TABLE crf_form ADD UNIQUE KEY uk_crf_form_study_code_active_ver (study_id, code, ((CASE WHEN `active` = 1 THEN `version` ELSE NULL END)))',
  'SELECT ''uk_crf_form_study_code_active_ver exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- crf_codelist ----------
SET @uk_cl_old := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_codelist' AND INDEX_NAME = 'uk_crf_codelist_code_ver'
);
SET @sql = IF(@uk_cl_old > 0,
  'ALTER TABLE crf_codelist DROP INDEX uk_crf_codelist_code_ver',
  'SELECT ''uk_crf_codelist_code_ver already dropped''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @uk_cl_new := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_codelist' AND INDEX_NAME = 'uk_crf_codelist_code_active_ver'
);
SET @sql = IF(@uk_cl_new = 0,
  'ALTER TABLE crf_codelist ADD UNIQUE KEY uk_crf_codelist_code_active_ver (code, ((CASE WHEN `active` = 1 THEN `version` ELSE NULL END)))',
  'SELECT ''uk_crf_codelist_code_active_ver exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
