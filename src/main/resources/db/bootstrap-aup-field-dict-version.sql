-- =============================================================
-- form_field 码表绑定钉版本（幂等）——启动自动执行
-- 同源：common/schema/V20260824015__aup_field_dict_version.sql
-- =============================================================

SET @db := DATABASE();

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='form_field' AND COLUMN_NAME='dict_version');
SET @sql = IF(@c=0, 'ALTER TABLE form_field ADD COLUMN dict_version INT NULL COMMENT ''发布时钉住的 dict 版本；NULL=跟随最新已发布'' AFTER dict_key', 'SELECT ''form_field.dict_version exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
