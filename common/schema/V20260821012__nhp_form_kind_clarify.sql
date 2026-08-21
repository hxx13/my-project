-- 归档：NHP form_type 原子/组合澄清（与 db/bootstrap-nhp-form-kind.sql 同源）
-- 原子：裸 D*/DD* / 套内 {dict}__D* → DOMAIN/MODULE
-- 组合：其余码（含 nhp-crf）→ TEMPLATE；纠正误标为 DOMAIN 的存量

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

UPDATE crf_form
SET form_type = 'TEMPLATE'
WHERE active = 1
  AND code NOT REGEXP '^[Dd]+[0-9]{1,3}$'
  AND code NOT REGEXP '^[a-zA-Z0-9_-]+__[Dd]+[0-9]{1,3}$'
  AND (form_type IS NULL OR form_type = '' OR form_type IN (
        'PUBLIC', 'COMPOSITE', 'ATOM', 'DOMAIN', 'MODULE', 'TEMPLATE'
      ));
