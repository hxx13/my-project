ALTER TABLE sys_user ADD COLUMN contact_email VARCHAR(256) DEFAULT NULL COMMENT '联系邮箱（本地管理，用于推送通知）';
ALTER TABLE sys_user ADD COLUMN send_key VARCHAR(256) DEFAULT NULL COMMENT 'Server酱SendKey（用于微信推送通知）';
