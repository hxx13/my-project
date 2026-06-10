-- bootstrap-smartsheet-pin.sql — SmartSheet 置顶字段
ALTER TABLE smartsheet_definition ADD COLUMN IF NOT EXISTS is_pinned TINYINT NOT NULL DEFAULT 0 COMMENT '置顶';