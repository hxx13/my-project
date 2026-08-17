-- AUP 快照增加草稿来源，区分 stage=draft 时的退回来源（first/piReturn/formatReturn/expertReturn/rollback）。
-- 前端快照抽屉据此在「返修」阶段显示准确名称，而非笼统的「填写草稿」。
ALTER TABLE aup_snapshot ADD COLUMN draft_source VARCHAR(32) NULL COMMENT '草稿来源（stage=draft 时有效）first/piReturn/formatReturn/expertReturn/rollback' AFTER stage;
