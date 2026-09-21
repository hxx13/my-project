-- 区域级告警阈值加「通知对象」维度，语义同 cage_alert_default.notify_target
-- （见 bootstrap-cage-alert-default-notify-target.sql 的解释）。
--
-- 唯一键要带上 notify_target，否则「健康异常-兽医」与「健康异常-所有者」两行会撞键。
-- DEFAULT 与现有行为逐字相同 → 老行零迁移，唯一性不变。
--
-- 幂等：重复执行会因列已存在而 benign 失败（整条 ALTER 一起失败，唯一键不会被重复改），
-- 故本文件只放这一条 DDL。
ALTER TABLE cage_region_alert_rule
    ADD COLUMN notify_target VARCHAR(16) NOT NULL DEFAULT 'DEFAULT' COMMENT '通知对象：DEFAULT=原有单目标语义；VET=通知兽医；OCCUPANT=通知笼位所有者',
    DROP INDEX uk_cage_region_alert_rule,
    ADD UNIQUE KEY uk_cage_region_alert_rule (region_type, region_id, status_code, notify_target, configured_by);
