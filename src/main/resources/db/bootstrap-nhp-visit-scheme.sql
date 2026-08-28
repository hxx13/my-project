-- 访视方案（与 common/schema/V20260828__nhp_visit_scheme.sql 同源）。
-- 幂等：表/列已存在即跳过。

CREATE TABLE IF NOT EXISTS crf_visit_scheme (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL COMMENT '方案名',
    description VARCHAR(255) NULL,
    active      TINYINT      NOT NULL DEFAULT 1,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @db = DATABASE();

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_visit' AND COLUMN_NAME = 'scheme_id'
    ),
    'SELECT ''crf_visit.scheme_id exists''',
    'ALTER TABLE crf_visit ADD COLUMN scheme_id BIGINT NULL COMMENT ''所属方案 FK→crf_visit_scheme.id（NULL=默认）'' AFTER id'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_transplant' AND COLUMN_NAME = 'visit_scheme_id'
    ),
    'SELECT ''crf_transplant.visit_scheme_id exists''',
    'ALTER TABLE crf_transplant ADD COLUMN visit_scheme_id BIGINT NULL COMMENT ''项目选用的访视方案 FK→crf_visit_scheme.id（NULL=默认）'' AFTER team_id'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
