-- 区域级告警阈值的「计时起点」覆盖位，语义同 cage_alert_default.start_value（见
-- bootstrap-cage-alert-default-start-value.sql 的解释）。
--
-- 为什么区域也要存：方向允许区域覆盖全局（与阈值/动作同口径），但**同一区域内不同组长必须一致** ——
-- 阈值能取 min、动作能取并集，方向没有可合并的语义，所以不一致时在保存链直接拒绝，不走并集。
--
-- DEFAULT 1 = 与现有行为逐字相同。
--
-- 幂等：重复执行会因列已存在而 benign 失败（故本文件只放这一条 DDL）。
ALTER TABLE cage_region_alert_rule
    ADD COLUMN start_value TINYINT NOT NULL DEFAULT 1 COMMENT '计时起点：1=出现 1 开始(1→0 结束)；0=出现 0 开始(0→1 结束)';
