-- 长期归档·已选变量记录所属导入分区（查看/导出按分区分组）。
ALTER TABLE telemetry_longterm_variable
    ADD COLUMN bundle_code VARCHAR(128) NULL COMMENT '所属导入分区 code；空=未分区' AFTER unit;
