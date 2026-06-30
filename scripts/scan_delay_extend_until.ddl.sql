-- 扫码延迟免冻结选项：由「延长 N 分钟」改为「延长至 HH:mm」
-- 目标库见 application.properties（默认 twin_system）；上线前执行

ALTER TABLE twin_scan_delay_option
  ADD COLUMN extend_until_time VARCHAR(5) NULL
    COMMENT '豁免延长至当日 HH:mm（优先于 duration_minutes）'
    AFTER duration_minutes;
