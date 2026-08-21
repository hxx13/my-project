-- =============================================================
-- NHP：澄清 crf_form.form_type — 原子模板 vs 组合模板
-- DOMAIN/MODULE = 原子模板（裸 D1/DD1 / 套内 monkey__D1，可独立编辑）
-- TEMPLATE = 组合模板（选原子钉版本并快照；仅此类可建填写实例）
-- 幂等：仅 UPDATE 已有行。
-- 特别：纠正 nhp-crf 等非原子码被误标为 DOMAIN/MODULE/ATOM 的存量。
-- =============================================================

-- 1) 原子：裸域码或套内作用域码 → DOMAIN/MODULE
UPDATE crf_form
SET form_type = CASE
        WHEN UPPER(SUBSTRING_INDEX(code, '__', -1)) IN ('D9', 'D10') THEN 'MODULE'
        ELSE 'DOMAIN'
    END
WHERE active = 1
  AND (
        code REGEXP '^[Dd]+[0-9]{1,3}$'
        OR code REGEXP '^[a-zA-Z0-9_-]+__[Dd]+[0-9]{1,3}$'
      )
  AND (form_type IS NULL OR form_type = '' OR form_type IN ('DOMAIN', 'MODULE', 'PUBLIC', 'ATOM', 'COMPOSITE', 'TEMPLATE'));

-- 2) 组合：非原子码（如 nhp-crf）→ TEMPLATE（含误标为 DOMAIN/MODULE 的存量）
UPDATE crf_form
SET form_type = 'TEMPLATE'
WHERE active = 1
  AND code NOT REGEXP '^[Dd]+[0-9]{1,3}$'
  AND code NOT REGEXP '^[a-zA-Z0-9_-]+__[Dd]+[0-9]{1,3}$'
  AND (form_type IS NULL OR form_type = '' OR form_type IN (
        'PUBLIC', 'COMPOSITE', 'ATOM', 'DOMAIN', 'MODULE', 'TEMPLATE'
      ));
