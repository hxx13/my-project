-- NHP 编码规则改造（归档；运行时由 bootstrap-nhp-id-scope.sql 幂等执行）
-- V20260821027：crf_sequence 泛化 scope_key；crf_id_rule 加 derived；TP 码去横线；FU/XM pattern 修正
-- 同源：src/main/resources/db/bootstrap-nhp-id-scope.sql

-- 1) crf_sequence 加 scope_key 并回填（year 用 YY，对齐 NhpIdService.year2 / % 100）
ALTER TABLE crf_sequence
    ADD COLUMN IF NOT EXISTS scope_key VARCHAR(128) NOT NULL DEFAULT '' COMMENT '取号作用域键（id_type 内唯一）' AFTER id_type;

UPDATE crf_sequence
SET scope_key = CONCAT(IFNULL(center_code, ''), '|', MOD(IFNULL(year, 0), 100))
WHERE scope_key = '' OR scope_key IS NULL;

-- 规范化：已写入完整年（|2026）纠正为 YY（|26）
UPDATE crf_sequence
SET scope_key = CONCAT(IFNULL(center_code, ''), '|', MOD(IFNULL(year, 0), 100))
WHERE scope_key REGEXP '\\|[12][0-9]{3}$';

-- 唯一键切换：(id_type, center_code, year) → (id_type, scope_key)
-- 与 bootstrap 语义一致；纯 Flyway 环境执行下列 DDL（bootstrap 用 information_schema 幂等）
ALTER TABLE crf_sequence DROP INDEX uk_crf_seq_type_center_year;
ALTER TABLE crf_sequence ADD UNIQUE KEY uk_crf_seq_type_scope (id_type, scope_key);

-- 2) crf_id_rule 加 derived
ALTER TABLE crf_id_rule
    ADD COLUMN IF NOT EXISTS derived TINYINT NOT NULL DEFAULT 0 COMMENT '1=派生键不走取号器（ANES/HX/RS）' AFTER pattern;

-- 3) TP 码统一无横线 TP-01 → TP01
UPDATE crf_visit SET code = REPLACE(code, 'TP-', 'TP') WHERE code LIKE 'TP-%';

-- 4) 编码规则字典修正（FU/XM）+ derived 标记
UPDATE crf_id_rule SET pattern = 'FU-{TX}-{TP}-{seq:2}' WHERE id_type = 'FU' AND pattern LIKE 'FU-%';
UPDATE crf_id_rule SET pattern = 'XM-{DONOR}-{RECIP}-{seq:2}' WHERE id_type = 'XM' AND (pattern = 'XM-{DONOR}-{RECIP}' OR pattern LIKE 'XM-{DONOR}-{RECIP}');
UPDATE crf_id_rule SET pattern = REPLACE(pattern, '{时点}', '{TP}') WHERE pattern LIKE '%{时点}%';
UPDATE crf_id_rule SET derived = 1 WHERE id_type IN ('ANES', 'HX', 'RS');
