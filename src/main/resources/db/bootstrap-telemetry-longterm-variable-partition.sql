-- 长期归档·已选变量归属自定义分区（空=未分区）。
ALTER TABLE telemetry_longterm_variable
    ADD COLUMN partition_id BIGINT NULL COMMENT '自定义分区 id；空=未分区' AFTER bundle_code;
