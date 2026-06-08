-- 滞留违规配置表新增交互式确认开关和短语
ALTER TABLE stranded_violation_config ADD COLUMN interactive_challenge_enabled TINYINT NOT NULL DEFAULT 0 COMMENT '是否启用交互式违规确认';
ALTER TABLE stranded_violation_config ADD COLUMN interactive_challenge_phrase VARCHAR(128) NOT NULL DEFAULT '一人一卡,严禁尾随' COMMENT '交互拼图目标短语';
