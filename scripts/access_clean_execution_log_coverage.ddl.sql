-- 执行日志按日×通道分段（目标库 twin_system）

ALTER TABLE access_clean_execution_log
    ADD COLUMN coverage_day DATE NULL COMMENT '清洗覆盖自然日' AFTER execution_date;

ALTER TABLE access_clean_execution_log
    ADD COLUMN channel_code VARCHAR(128) NULL COMMENT '单通道编码' AFTER coverage_day;
