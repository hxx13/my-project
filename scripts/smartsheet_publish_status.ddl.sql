-- 目标库 twin_system（与 application.properties 一致）
-- 填报报表发布状态
ALTER TABLE smartsheet_definition
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'draft' COMMENT 'draft|published';
