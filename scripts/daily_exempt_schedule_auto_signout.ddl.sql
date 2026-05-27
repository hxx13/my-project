-- 每日豁免回收任务：回收后自动签离开关（与 twin_freeze_config 解耦，由定时管理页配置）
-- 目标库 twin_system

ALTER TABLE twin_job_schedule_config
    ADD COLUMN revoke_auto_signout_enabled TINYINT NOT NULL DEFAULT 0
        COMMENT '仅 DAILY_EXEMPT_RESET：今日曾豁免且流水仍在馆时自动签离';
