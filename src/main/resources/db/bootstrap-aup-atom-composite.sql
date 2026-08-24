-- =============================================================
-- AUP 原子域/组合域（幂等）——启动自动执行
-- 同源：common/schema/V20260824013__aup_atom_composite.sql
-- =============================================================

SET @db := DATABASE();

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='form_template' AND COLUMN_NAME='kind');
SET @sql = IF(@c=0, 'ALTER TABLE form_template ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT ''PROTOCOL'' COMMENT ''PROTOCOL/ATOM/COMPOSITE'' AFTER form_key', 'SELECT ''form_template.kind exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='form_template' AND COLUMN_NAME='folder_id');
SET @sql = IF(@c=0, 'ALTER TABLE form_template ADD COLUMN folder_id BIGINT NULL COMMENT ''FK→aup_folder(owner_type=ATOM)'' AFTER kind', 'SELECT ''form_template.folder_id exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='form_template' AND COLUMN_NAME='origin');
SET @sql = IF(@c=0, 'ALTER TABLE form_template ADD COLUMN origin VARCHAR(16) NOT NULL DEFAULT ''USER'' COMMENT ''SEED/USER/COMPOSED'' AFTER folder_id', 'SELECT ''form_template.origin exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='form_template' AND COLUMN_NAME='submitted_at');
SET @sql = IF(@c=0, 'ALTER TABLE form_template ADD COLUMN submitted_at DATETIME NULL COMMENT ''提交审核时间'' AFTER published_at', 'SELECT ''form_template.submitted_at exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='form_template' AND COLUMN_NAME='review_comment');
SET @sql = IF(@c=0, 'ALTER TABLE form_template ADD COLUMN review_comment VARCHAR(512) NULL COMMENT ''最近一次驳回/通过意见'' AFTER submitted_at', 'SELECT ''form_template.review_comment exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'form_template' AND INDEX_NAME = 'idx_template_kind'
);
SET @sql = IF(@fk = 0,
  'ALTER TABLE form_template ADD KEY idx_template_kind (kind)',
  'SELECT ''idx_template_kind already present''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS aup_composite_atom (
    id                    BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    composite_template_id BIGINT      NOT NULL COMMENT 'FK→form_template.id(kind=COMPOSITE)',
    atom_form_key         VARCHAR(64) NOT NULL COMMENT '原子域 form_key',
    atom_template_id      BIGINT      NOT NULL COMMENT '钉住的原子域版本行 id',
    sort_order            INT         NOT NULL DEFAULT 0,
    created_at            DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_aup_comp_atom (composite_template_id, atom_form_key),
    KEY idx_aup_comp_atom_atom (atom_template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AUP组合域钉住的原子域版本引用';
