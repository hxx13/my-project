-- ============================================================
-- NHP 概念/指标库（对齐 22 §2.2 / V20260821026）
-- 由 EmbeddedTwinSystemCoreDdlBootstrap 启动幂等执行。
-- 同源：common/schema/V20260821026__nhp_concept.sql
-- ============================================================

SET @db := DATABASE();

CREATE TABLE IF NOT EXISTS crf_concept (
    id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    concept_code VARCHAR(64)  NOT NULL COMMENT '概念码 LOINC 风格 CREAT/PLT/ALT',
    name_cn      VARCHAR(128) NOT NULL COMMENT '中文名',
    name_en      VARCHAR(64)  NULL COMMENT '英文名',
    data_type    VARCHAR(32)  NOT NULL COMMENT '默认数据类型',
    unit         VARCHAR(32)  NULL COMMENT '默认单位',
    codelist_id  BIGINT       NULL COMMENT 'FK→crf_codelist.id',
    active       TINYINT      NOT NULL DEFAULT 1 COMMENT '软删 0/1',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_concept_code (concept_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP概念/指标库（多 field 复用同一 concept）';

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_field' AND COLUMN_NAME = 'concept_code'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_field ADD COLUMN concept_code VARCHAR(64) NULL COMMENT ''FK逻辑→crf_concept.concept_code（N:1 复用）'' AFTER cdisc_test_code',
  'SELECT ''concept_code exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_field' AND INDEX_NAME = 'idx_crf_field_concept'
);
SET @sql = IF(@idx = 0,
  'ALTER TABLE crf_field ADD KEY idx_crf_field_concept (concept_code)',
  'SELECT ''idx_crf_field_concept exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO crf_concept (concept_code, name_cn, name_en, data_type, unit, active) VALUES
('ALT', '丙氨酸转氨酶', 'ALT', 'DECIMAL', 'U/L', 1),
('AST', '天冬氨酸转氨酶', 'AST', 'DECIMAL', 'U/L', 1),
('EF', '射血分数', 'EjectionFraction', 'DECIMAL', '%', 1),
('FREE_HB', '游离血红蛋白', 'FreeHemoglobin', 'DECIMAL', 'mg/dL', 1),
('INR', '国际标准化比值', 'INR', 'DECIMAL', NULL, 1),
('PAIR_SCORE', '配对评分', 'PairingScore', 'DECIMAL', NULL, 1),
('PCFDNA', '供体源性cfDNA', 'cfDNA', 'DECIMAL', '%', 1),
('PERVA', 'PERV-A拷贝', 'PERV-A', 'DECIMAL', 'copies/ml', 1),
('PERVB', 'PERV-B拷贝', 'PERV-B', 'DECIMAL', 'copies/ml', 1),
('PERVC', 'PERV-C状态', 'PERV-C', 'STRING', NULL, 1),
('PLT', '血小板', 'Platelets', 'DECIMAL', '10^9/L', 1),
('TNI', '肌钙蛋白', 'Troponin', 'DECIMAL', 'ng/mL', 1),
('VR', '血管阻力', 'VascularResistance', 'DECIMAL', NULL, 1);
