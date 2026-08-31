-- NHP 团队归属补列 + 码表种子标记。与 common/schema/V20260831__nhp_team_id.sql 同源。
-- 幂等：information_schema 检查列是否存在，存在即跳过。

SET @db = DATABASE();

-- crf_form.team_id（NULL=平台默认模板）
SET @sql = (SELECT IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crf_form' AND COLUMN_NAME='team_id'), 'SELECT ''crf_form.team_id exists''', 'ALTER TABLE crf_form ADD COLUMN team_id BIGINT NULL COMMENT ''归属团队 FK→team.id（NULL=平台默认模板）'''));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crf_visit_scheme.team_id（NULL=平台默认方案）
SET @sql = (SELECT IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crf_visit_scheme' AND COLUMN_NAME='team_id'), 'SELECT ''crf_visit_scheme.team_id exists''', 'ALTER TABLE crf_visit_scheme ADD COLUMN team_id BIGINT NULL COMMENT ''归属团队（NULL=平台默认方案）'''));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crf_field.team_id（NULL=系统种子字段）
SET @sql = (SELECT IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crf_field' AND COLUMN_NAME='team_id'), 'SELECT ''crf_field.team_id exists''', 'ALTER TABLE crf_field ADD COLUMN team_id BIGINT NULL COMMENT ''归属团队（NULL=系统种子字段）'''));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crf_codelist.team_id（NULL=系统种子码表）
SET @sql = (SELECT IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crf_codelist' AND COLUMN_NAME='team_id'), 'SELECT ''crf_codelist.team_id exists''', 'ALTER TABLE crf_codelist ADD COLUMN team_id BIGINT NULL COMMENT ''归属团队（NULL=系统种子码表）'''));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crf_codelist.frozen_by（种子标记：seed=系统种子，与用户 FROZEN 区分）
SET @sql = (SELECT IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crf_codelist' AND COLUMN_NAME='frozen_by'), 'SELECT ''crf_codelist.frozen_by exists''', 'ALTER TABLE crf_codelist ADD COLUMN frozen_by VARCHAR(64) NULL COMMENT ''冻结人（seed=系统种子）'''));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
