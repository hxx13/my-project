-- 每日豁免回收任务：独立于冻结配置的「执行后自动签离」开关
-- 目标库 twin_system

ALTER TABLE twin_job_schedule_config
    ADD COLUMN post_run_auto_signout TINYINT NOT NULL DEFAULT 0
        COMMENT '任务执行成功后是否联动自动签离（仅 DAILY_EXEMPT_RESET 等按需使用）';

-- 可选：从旧冻结配置迁移（若曾开启 daily_exempt_revoke_auto_signout_enabled）
-- UPDATE twin_job_schedule_config j
-- INNER JOIN twin_freeze_config f ON f.id = 1
-- SET j.post_run_auto_signout = 1
-- WHERE j.job_key = 'DAILY_EXEMPT_RESET'
--   AND f.daily_exempt_revoke_auto_signout_enabled = 1;
