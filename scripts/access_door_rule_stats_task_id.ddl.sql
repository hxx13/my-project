-- 修复 Unknown column 'stats_task_id'：在目标库执行一次（如 twin_system）
-- 与 AccessFusionSchemaMigrator.ensureAccessCleanWorkspaceColumns 逻辑一致

ALTER TABLE access_door_rule
    ADD COLUMN stats_task_id BIGINT NOT NULL DEFAULT 0 COMMENT '统计拉取任务ID' AFTER rule_set_id;

ALTER TABLE access_door_rule DROP INDEX uk_access_door_rule_channel;

ALTER TABLE access_door_rule
    ADD UNIQUE KEY uk_access_door_rule_task_channel (stats_task_id, channel_code);
