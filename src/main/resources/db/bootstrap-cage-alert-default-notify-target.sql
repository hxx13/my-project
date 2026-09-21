-- 告警全局默认阈值加「通知对象」维度（健康异常要按 兽医 / 笼位所有者 两条独立规则通知）。
--
-- notify_target 值域：
--   'DEFAULT'  = 原有单目标语义（现有 5 状态 + 特殊饲养明细全部用它）
--   'VET'      = 通知兽医
--   'OCCUPANT' = 通知笼位所有者
--
-- 现有数据零迁移：默认值 'DEFAULT' 与原语义逐字相同，主键改成 (status_code, notify_target) 后
-- 老行仍然是唯一的，不需要 UPDATE。
--
-- 幂等：重复执行会因列已存在而 benign 失败（整条 ALTER 一起失败，主键就不会被重复改），
-- 故本文件只放这一条 DDL —— 一文件一条 DDL，否则前一条的良性失败会让后面的语句永不被执行。
ALTER TABLE cage_alert_default
    ADD COLUMN notify_target VARCHAR(16) NOT NULL DEFAULT 'DEFAULT' COMMENT '通知对象：DEFAULT=原有单目标语义；VET=通知兽医；OCCUPANT=通知笼位所有者',
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (status_code, notify_target);
