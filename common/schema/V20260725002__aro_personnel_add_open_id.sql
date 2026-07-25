ALTER TABLE aro_personnel
  ADD COLUMN open_id VARCHAR(128) NULL COMMENT '微信openId',
  ADD INDEX idx_aro_open_id (open_id);
