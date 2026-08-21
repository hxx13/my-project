-- =============================================================
-- NHP 字段字典套 + crf_field.dictionary_id（幂等）
-- 由 EmbeddedTwinSystemCoreDdlBootstrap 启动执行
-- 同源：common/schema/V20260821014__nhp_field_dictionary.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS crf_field_dictionary (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    dict_key    VARCHAR(64)  NOT NULL COMMENT '稳定键 pig / monkey / custom-xxx',
    name        VARCHAR(128) NOT NULL COMMENT '显示名，如 猪异种移植字段字典',
    species     VARCHAR(64)  NULL COMMENT '种属标签：猪 / 猴 / 其它',
    description VARCHAR(512) NULL COMMENT '说明',
    structure_json TEXT      NULL COMMENT '域/子模块大纲 JSON：{domains:[{code,name,sortOrder,submodules:[{code,name,sortOrder}]}]}',
    version     INT          NOT NULL DEFAULT 1 COMMENT '字典套版本号',
    status      VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE/ARCHIVED',
    active      TINYINT      NOT NULL DEFAULT 1 COMMENT '软删 0/1',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_field_dict_key (dict_key),
    KEY idx_crf_field_dict_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='NHP字段字典套（种属/方案级目录；字段归属 dictionary_id）';

INSERT INTO crf_field_dictionary (dict_key, name, species, description, version, status, active)
SELECT 'pig', '猪异种移植字段字典', '猪', '默认字典：供体猪/受体 NHP 异种移植 CRF 字段（D1–D13）', 1, 'ACTIVE', 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM crf_field_dictionary WHERE dict_key = 'pig');

INSERT INTO crf_field_dictionary (dict_key, name, species, description, version, status, active)
SELECT 'monkey', '猴字段字典', '猴', '空数据域套壳；与猪套并排独立，不继承猪 D1–D10，请自建套内域', 1, 'ACTIVE', 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM crf_field_dictionary WHERE dict_key = 'monkey');

SET @db := DATABASE();

-- 字典套：域/子模块大纲（可先于字段存在）
SET @scol := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_field_dictionary' AND COLUMN_NAME = 'structure_json'
);
SET @sql = IF(@scol = 0,
  'ALTER TABLE crf_field_dictionary ADD COLUMN structure_json TEXT NULL COMMENT ''域/子模块大纲 JSON'' AFTER description',
  'SELECT ''structure_json exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_field' AND COLUMN_NAME = 'dictionary_id'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_field ADD COLUMN dictionary_id BIGINT NULL COMMENT ''FK→crf_field_dictionary.id'' AFTER id',
  'SELECT ''dictionary_id exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 存量字段挂到猪字典
UPDATE crf_field f
INNER JOIN crf_field_dictionary d ON d.dict_key = 'pig'
SET f.dictionary_id = d.id
WHERE f.dictionary_id IS NULL;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_field' AND INDEX_NAME = 'idx_crf_field_dictionary'
);
SET @sql = IF(@idx = 0,
  'ALTER TABLE crf_field ADD KEY idx_crf_field_dictionary (dictionary_id)',
  'SELECT ''idx_crf_field_dictionary exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 唯一约束：同字典套内 field_code 唯一（跨套可同码）
SET @uk := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_field' AND INDEX_NAME = 'uk_crf_field_code'
);
SET @sql = IF(@uk > 0,
  'ALTER TABLE crf_field DROP INDEX uk_crf_field_code',
  'SELECT ''uk_crf_field_code already dropped''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @uk2 := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_field' AND INDEX_NAME = 'uk_crf_field_dict_code'
);
SET @sql = IF(@uk2 = 0,
  'ALTER TABLE crf_field ADD UNIQUE KEY uk_crf_field_dict_code (dictionary_id, field_code)',
  'SELECT ''uk_crf_field_dict_code exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
