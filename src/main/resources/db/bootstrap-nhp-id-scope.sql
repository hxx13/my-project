-- ============================================================
-- NHP 编码规则 scope_key 泛化（对齐 22 §4 / V20260821027）
-- 由 EmbeddedTwinSystemCoreDdlBootstrap 启动幂等执行。
-- 同源：common/schema/V20260821027__nhp_id_scope.sql
-- ============================================================

SET @db := DATABASE();

-- crf_sequence.scope_key
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_sequence' AND COLUMN_NAME = 'scope_key'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_sequence ADD COLUMN scope_key VARCHAR(128) NOT NULL DEFAULT '''' COMMENT ''取号作用域键（id_type 内唯一）'' AFTER id_type',
  'SELECT ''scope_key exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 回填对齐 NhpIdService.year2：year % 100（如 SJ|26，非 SJ|2026）
UPDATE crf_sequence
SET scope_key = CONCAT(IFNULL(center_code, ''), '|', MOD(IFNULL(year, 0), 100))
WHERE scope_key = '' OR scope_key IS NULL;

-- 规范化：已写入完整年（|2026）纠正为 YY（|26）
UPDATE crf_sequence
SET scope_key = CONCAT(IFNULL(center_code, ''), '|', MOD(IFNULL(year, 0), 100))
WHERE scope_key REGEXP '\\|[12][0-9]{3}$';

-- 掉旧唯一键（若存在）
SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_sequence' AND INDEX_NAME = 'uk_crf_seq_type_center_year'
);
SET @sql = IF(@idx > 0,
  'ALTER TABLE crf_sequence DROP INDEX uk_crf_seq_type_center_year',
  'SELECT ''uk_crf_seq_type_center_year absent''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_sequence' AND INDEX_NAME = 'uk_crf_seq_type_scope'
);
SET @sql = IF(@idx = 0,
  'ALTER TABLE crf_sequence ADD UNIQUE KEY uk_crf_seq_type_scope (id_type, scope_key)',
  'SELECT ''uk_crf_seq_type_scope exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crf_id_rule.derived
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_id_rule' AND COLUMN_NAME = 'derived'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_id_rule ADD COLUMN derived TINYINT NOT NULL DEFAULT 0 COMMENT ''1=派生键不走取号器（ANES/HX/RS）'' AFTER pattern',
  'SELECT ''derived exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- TP 码去横线
UPDATE crf_visit SET code = REPLACE(code, 'TP-', 'TP') WHERE code LIKE 'TP-%';

-- pattern / derived 修正
UPDATE crf_id_rule SET pattern = 'FU-{TX}-{TP}-{seq:2}' WHERE id_type = 'FU';
UPDATE crf_id_rule SET pattern = 'XM-{DONOR}-{RECIP}-{seq:2}' WHERE id_type = 'XM';
UPDATE crf_id_rule SET pattern = REPLACE(pattern, '{时点}', '{TP}') WHERE pattern LIKE '%{时点}%';
UPDATE crf_id_rule SET derived = 1 WHERE id_type IN ('ANES', 'HX', 'RS');
UPDATE crf_id_rule SET derived = 0 WHERE id_type NOT IN ('ANES', 'HX', 'RS');
