-- AUP 快照增加草稿来源（与 common/schema/V20260817__aup_snapshot_draft_source.sql 同源）。
-- 幂等：重复执行时列已存在即跳过（启动链 isBenignInChain 判定为良性）。
ALTER TABLE aup_snapshot ADD COLUMN draft_source VARCHAR(32) NULL COMMENT '草稿来源（stage=draft 时有效）first/piReturn/formatReturn/expertReturn/rollback' AFTER stage;
