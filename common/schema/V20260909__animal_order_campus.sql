-- 动物订购校区维度：策略 / 可购窗口规则分浦东、浦西两套；节假日为全国口径，不分校区。
-- 运行时 bootstrap 幂等执行（db/bootstrap-animal-order-time.sql）；本文件为 Flyway 归档。
-- ref_order.campus 由 ReferenceDataSchemaMigrator 幂等加列。

ALTER TABLE animal_order_time_policy
    ADD COLUMN campus VARCHAR(16) NOT NULL DEFAULT '浦东' COMMENT '校区：浦东|浦西',
    ADD UNIQUE KEY uk_policy_campus (campus);

-- 浦西策略初值：复制浦东现有配置，之后两校区各自独立维护
INSERT INTO animal_order_time_policy (campus, default_mode, eta_mode, eta_workday_offset, eta_weekday, active)
SELECT '浦西', default_mode, eta_mode, eta_workday_offset, eta_weekday, active
FROM animal_order_time_policy
WHERE campus = '浦东'
  AND NOT EXISTS (SELECT 1 FROM (SELECT 1 FROM animal_order_time_policy WHERE campus = '浦西') x);

ALTER TABLE animal_order_window_rule
    ADD COLUMN campus VARCHAR(16) NOT NULL DEFAULT '浦东' COMMENT '校区：浦东|浦西',
    ADD KEY idx_window_campus (campus, active);

-- 浦西窗口规则初值：复制浦东现有规则
INSERT INTO animal_order_window_rule (campus, scope, category_key, effect, shape, weekdays,
                                      start_weekday, end_weekday, daily_start_time, daily_end_time,
                                      range_start_at, range_end_at, label, sort_order, active)
SELECT '浦西', scope, category_key, effect, shape, weekdays,
       start_weekday, end_weekday, daily_start_time, daily_end_time,
       range_start_at, range_end_at, label, sort_order, active
FROM animal_order_window_rule
WHERE campus = '浦东'
  AND NOT EXISTS (SELECT 1 FROM (SELECT 1 FROM animal_order_window_rule WHERE campus = '浦西') x);
