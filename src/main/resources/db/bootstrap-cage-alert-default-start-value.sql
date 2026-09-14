-- 告警区间的「计时起点」要能配：现在 foldRows 写死「字段变 1 就开区间、变 0 就闭区间」，
-- 表达不了「出现 0 才开始计时、0→1 结束」这种反向语义。
--
-- start_value 语义（布尔只有两个值，所以起点定了终点就是它的反向，一个列即可完整表达两个边）：
--   start_value = 1 → 出现 1 开始记录，1→0 结束（= 现状）
--   start_value = 0 → 出现 0 开始记录，0→1 结束（反向）
--
-- DEFAULT 1 = 与现有行为逐字相同（现网 611 条 ACTIVE 与全部既有区间零变化）。
-- 可见范围/阈值/动作仍照旧按区域覆盖；方向不一致时由保存链拒绝，不走并集（方向无法取 min/并集）。
--
-- 幂等：重复执行会因列已存在而 benign 失败（故本文件只放这一条 DDL）。
ALTER TABLE cage_alert_default
    ADD COLUMN start_value TINYINT NOT NULL DEFAULT 1 COMMENT '计时起点：1=出现 1 开始(1→0 结束)；0=出现 0 开始(0→1 结束)';
