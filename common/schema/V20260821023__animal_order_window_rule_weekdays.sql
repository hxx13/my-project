-- 可购窗口：一次性日历区间 → 按星期循环（ISO 1=周一 … 7=周日）
-- 不修改 V20260821019；本迁移仅 ALTER + 回填。

ALTER TABLE animal_order_window_rule
    ADD COLUMN weekdays VARCHAR(32) NULL
        COMMENT 'ISO星期逗号分隔 1=周一…7=周日；WEEKLY必填'
        AFTER shape;

-- 旧 DAILY（每日）视为每周全天循环
UPDATE animal_order_window_rule
SET shape = 'WEEKLY',
    weekdays = '1,2,3,4,5,6,7'
WHERE shape = 'DAILY'
  AND (weekdays IS NULL OR weekdays = '');
