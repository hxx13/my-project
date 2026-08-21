-- 笼架违规检测：原默认窗口 07:00-22:00 与默认时刻 02:00 互斥，shouldRun 两条件永不同时满足，
-- 任务自上线从未执行。该 jobKey 已补入 isSingleTimeJob 名单（窗口不再参与判定），
-- 此处同步放开存量行的窗口，避免管理端显示出与实际判定不一致的窗口值。
UPDATE twin_job_schedule_config
SET schedule_start_time = '00:00',
    schedule_end_time   = '23:59',
    updated_by          = 'fix-cage-violation-window'
WHERE job_key = 'CAGE_STATUS_VIOLATION_CHECK'
  AND schedule_start_time = '07:00'
  AND schedule_end_time = '22:00';
