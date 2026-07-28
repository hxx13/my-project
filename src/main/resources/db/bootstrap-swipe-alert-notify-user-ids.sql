ALTER TABLE swipe_alert_rule ADD COLUMN notify_user_ids JSON DEFAULT NULL COMMENT '推送目标userId列表';
