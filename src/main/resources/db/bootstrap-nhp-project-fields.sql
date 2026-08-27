-- NHP 项目计划书字段（与 common/schema/V20260826005__nhp_project_fields.sql 同源）。
-- 幂等：重复执行时列已存在即跳过。

SET @db = DATABASE();

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_transplant' AND COLUMN_NAME = 'project_name'
    ),
    'SELECT ''crf_transplant.project_name exists''',
    'ALTER TABLE crf_transplant ADD COLUMN project_name VARCHAR(128) NULL COMMENT ''项目名称'' AFTER tx_code'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_transplant' AND COLUMN_NAME = 'remark'
    ),
    'SELECT ''crf_transplant.remark exists''',
    'ALTER TABLE crf_transplant ADD COLUMN remark VARCHAR(512) NULL COMMENT ''描述备注'' AFTER project_name'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_transplant' AND COLUMN_NAME = 'team_id'
    ),
    'SELECT ''crf_transplant.team_id exists''',
    'ALTER TABLE crf_transplant ADD COLUMN team_id BIGINT NULL COMMENT ''创建者所属团队 FK→team.id（预留）'' AFTER remark'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_transplant' AND COLUMN_NAME = 'current_tp'
    ),
    'SELECT ''crf_transplant.current_tp exists''',
    'ALTER TABLE crf_transplant ADD COLUMN current_tp VARCHAR(16) NULL COMMENT ''手动选定的 TP 码（NULL=沿用后端自动推算）'' AFTER team_id'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_transplant' AND COLUMN_NAME = 'stage_lock'
    ),
    'SELECT ''crf_transplant.stage_lock exists''',
    'ALTER TABLE crf_transplant ADD COLUMN stage_lock TINYINT NOT NULL DEFAULT 0 COMMENT ''阶段锁定：1=非当前 TP 表单只读'' AFTER current_tp'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
