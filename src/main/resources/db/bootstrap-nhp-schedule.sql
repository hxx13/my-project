-- ============================================================
-- NHP schedule / 调度层（22 §6.1/6.2 / V20260821034）
-- EmbeddedTwinSystemCoreDdlBootstrap idempotent.
-- Source: common/schema/V20260821034__nhp_schedule.sql
-- ============================================================

SET @db := DATABASE();

-- crf_form.event_anchor
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_form' AND COLUMN_NAME = 'event_anchor'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_form ADD COLUMN event_anchor VARCHAR(32) NULL COMMENT ''事件锚点 ENROLL/PRE_TX/DAY0/POST_TX/…'' AFTER description',
  'SELECT ''crf_form.event_anchor exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crf_form.frequency（NO repeat_flag）
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_form' AND COLUMN_NAME = 'frequency'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_form ADD COLUMN frequency VARCHAR(32) NULL COMMENT ''频次 ONCE/PER_TP/EVENT/…；≠ONCE 即重复'' AFTER event_anchor',
  'SELECT ''crf_form.frequency exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crf_visit.end_days
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_visit' AND COLUMN_NAME = 'end_days'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_visit ADD COLUMN end_days INT NULL COMMENT ''重复时点右边界天数（如 TP07=180）'' AFTER late_days',
  'SELECT ''crf_visit.end_days exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crf_visit_instance.transplant_id
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_visit_instance' AND COLUMN_NAME = 'transplant_id'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_visit_instance ADD COLUMN transplant_id BIGINT NULL COMMENT ''FK→crf_transplant；供体/术前/灌注可为 NULL'' AFTER visit_id',
  'SELECT ''crf_visit_instance.transplant_id exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crf_record.atom_id（visit_instance_id already exists）
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_record' AND COLUMN_NAME = 'atom_id'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_record ADD COLUMN atom_id BIGINT NULL COMMENT ''逻辑原子 FK→crf_form.id（版本无关）'' AFTER visit_instance_id',
  'SELECT ''crf_record.atom_id exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crf_record.transplant_id
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_record' AND COLUMN_NAME = 'transplant_id'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_record ADD COLUMN transplant_id BIGINT NULL COMMENT ''FK→crf_transplant'' AFTER atom_id',
  'SELECT ''crf_record.transplant_id exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crf_form.host_type（表单划分：DONOR 供体域 / RECIPIENT 受体域，不靠域码推导）
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_form' AND COLUMN_NAME = 'host_type'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_form ADD COLUMN host_type VARCHAR(16) NULL COMMENT ''宿主 DONOR=供体域/RECIPIENT=受体域（表单划分）'' AFTER frequency',
  'SELECT ''crf_form.host_type exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 项目号与 TX号解耦：项目登记时无 TX号（tx_code 可空，填 D3 移植事件时才生成）
ALTER TABLE crf_transplant MODIFY tx_code VARCHAR(32) NULL;

-- 供体/受体对象不再随项目自动创建（填 D1/D2 表单时才建），donor/recipient_subject_id 可空
ALTER TABLE crf_transplant MODIFY donor_subject_id BIGINT NULL, MODIFY recipient_subject_id BIGINT NULL;

-- 表单实例先不绑对象（保存时才建研究对象），crf_record.subject_id 可空
ALTER TABLE crf_record MODIFY subject_id BIGINT NULL;

-- crf_transplant.created_by（项目创建人）
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_transplant' AND COLUMN_NAME = 'created_by'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_transplant ADD COLUMN created_by VARCHAR(64) NULL COMMENT ''创建人'' AFTER status',
  'SELECT ''crf_transplant.created_by exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crf_transplant.lifecycle_stage（生命周期挪到项目：SCREENING→MATCHING→POST_TX→ENDPOINT）
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_transplant' AND COLUMN_NAME = 'lifecycle_stage'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_transplant ADD COLUMN lifecycle_stage VARCHAR(20) NULL COMMENT ''项目生命周期 SCREENING/MATCHING/POST_TX/ENDPOINT'' AFTER status',
  'SELECT ''crf_transplant.lifecycle_stage exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
