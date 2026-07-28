ALTER TABLE swipe_alert_rule ADD COLUMN notify_cardholder TINYINT NOT NULL DEFAULT 0 COMMENT '是否连带通知刷卡人本人';
