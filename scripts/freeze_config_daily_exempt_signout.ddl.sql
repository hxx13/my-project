-- twin_freeze_config：每日豁免回收后自动签离开关
-- 目标库 twin_system

ALTER TABLE twin_freeze_config
    ADD COLUMN daily_exempt_revoke_auto_signout_enabled TINYINT NOT NULL DEFAULT 0
        COMMENT '每日豁免回收后是否自动签离';
