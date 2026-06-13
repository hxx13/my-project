-- V20260613__smartsheet_v2_enhance.sql
-- Smartsheet V2 enhancement: row_limit, theme_config, is_template, index

ALTER TABLE smartsheet_definition
  ADD COLUMN IF NOT EXISTS row_limit INT DEFAULT 50000 COMMENT '行数上限',
  ADD COLUMN IF NOT EXISTS theme_config JSON COMMENT 'VTable 主题配置',
  ADD COLUMN IF NOT EXISTS is_template TINYINT DEFAULT 0 COMMENT '是否模板';

CREATE INDEX IF NOT EXISTS idx_sheet_row_index ON smartsheet_row(sheet_id, row_index);

ALTER TABLE smartsheet_change_log
  ADD COLUMN IF NOT EXISTS row_index INT COMMENT '行位置快照';
