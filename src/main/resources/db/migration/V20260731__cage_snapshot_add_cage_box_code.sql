ALTER TABLE cage_special_status_snapshot ADD COLUMN cage_box_code VARCHAR(128) DEFAULT NULL COMMENT '笼盒编码（从QR URL提取的纯数字码，用于扫码快速索引）' AFTER cage_box_qr_code;
CREATE INDEX idx_cage_box_code ON cage_special_status_snapshot(cage_box_code);
