-- 可购窗口：跨星期连续区间（Form B）
-- Form A = WEEKLY（weekdays 多选 + 每日同一起止时刻）
-- Form B = WEEKLY_SPAN（start_weekday+start_time → end_weekday+end_time，周环连续弧）

ALTER TABLE animal_order_window_rule
    ADD COLUMN start_weekday TINYINT NULL
        COMMENT 'WEEKLY_SPAN：起始ISO星期 1=周一…7=周日'
        AFTER weekdays,
    ADD COLUMN end_weekday TINYINT NULL
        COMMENT 'WEEKLY_SPAN：结束ISO星期 1=周一…7=周日'
        AFTER start_weekday;
