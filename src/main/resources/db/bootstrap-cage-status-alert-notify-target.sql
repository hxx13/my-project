-- 告警实例加「通知对象」维度，语义同 cage_alert_default.notify_target。
--
-- active_key 的口径随之细化，但**不回溯**：notify_target = 'DEFAULT' 时仍然是 `笼位:状态`
-- （与现状逐字节相同，存量活跃告警行一行都不用 UPDATE），只有 VET / OCCUPANT 才拼成
-- `笼位:状态:对象`。「同笼位同状态同对象只一条活跃」仍由 uk_cage_status_alert_active 保证。
--
-- 幂等：重复执行会因列已存在而 benign 失败，故本文件只放这一条 DDL。
ALTER TABLE cage_status_alert
    ADD COLUMN notify_target VARCHAR(16) NOT NULL DEFAULT 'DEFAULT' COMMENT '通知对象：DEFAULT=原有单目标语义；VET=通知兽医；OCCUPANT=通知笼位所有者';
