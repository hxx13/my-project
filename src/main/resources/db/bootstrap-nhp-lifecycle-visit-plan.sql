-- ============================================================
-- NHP lifecycle + visit_plan（22 §6.5③ / V20260821038）
-- EmbeddedTwinSystemCoreDdlBootstrap idempotent.
-- Source: common/schema/V20260821038__nhp_lifecycle_visit_plan.sql
-- ============================================================

SET @db := DATABASE();

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_subject' AND COLUMN_NAME = 'lifecycle_stage'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_subject ADD COLUMN lifecycle_stage VARCHAR(20) NULL COMMENT ''SCREENING/MATCHING/POST_TX/ENDPOINT'' AFTER status',
  'SELECT ''crf_subject.lifecycle_stage exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_subject' AND COLUMN_NAME = 'arm_code'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_subject ADD COLUMN arm_code VARCHAR(16) NULL COMMENT ''研究分组 HEART/LIVER（非独立研究）'' AFTER lifecycle_stage',
  'SELECT ''crf_subject.arm_code exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_visit_plan' AND COLUMN_NAME = 'capture_form'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_visit_plan ADD COLUMN capture_form VARCHAR(16) NULL COMMENT ''采集形态 PANEL/LEDGER/SERIES（表单-事件指派级）'' AFTER required',
  'SELECT ''crf_visit_plan.capture_form exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS crf_visit_plan (
    id           BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    visit_id     BIGINT      NOT NULL COMMENT 'FK→crf_visit（TP 定义）',
    atom_id      BIGINT      NOT NULL COMMENT 'FK→crf_form（原子）',
    required     TINYINT     NOT NULL DEFAULT 1 COMMENT '该访视必做',
    capture_form VARCHAR(16) NULL COMMENT '采集形态 PANEL/LEDGER/SERIES（表单-事件指派级）',
    sort_order   INT         NOT NULL DEFAULT 0,
    UNIQUE KEY uk_crf_visit_plan (visit_id, atom_id),
    KEY idx_crf_visit_plan_visit (visit_id),
    KEY idx_crf_visit_plan_atom (atom_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP 访视编排（访视容器×原子清单）';
