-- FIXED 模式：固定日历日 → 每周固定 ISO 星期几（1=周一 … 7=周日）
-- 不修改 V20260821019（可能已应用）；本迁移仅 ALTER。

ALTER TABLE animal_order_time_policy
    ADD COLUMN eta_weekday TINYINT NULL
        COMMENT 'FIXED：ISO weekday 1=Mon…7=Sun'
        AFTER eta_workday_offset;

-- 若已有 FIXED + eta_fixed_date，按该日期的 ISO 星期几回填（语义变更，仅保留星期几）
UPDATE animal_order_time_policy
SET eta_weekday = MOD(DAYOFWEEK(eta_fixed_date) + 5, 7) + 1
WHERE eta_mode = 'FIXED'
  AND eta_fixed_date IS NOT NULL
  AND eta_weekday IS NULL;

ALTER TABLE animal_order_time_policy
    DROP COLUMN eta_fixed_date;
