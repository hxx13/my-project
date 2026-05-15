-- 若已按旧版建过 telemetry_watchlist_tag（无 structure_type / data_type），在 twin_system 中执行一次。

ALTER TABLE telemetry_watchlist_tag
    ADD COLUMN structure_type VARCHAR(128) NULL COMMENT '结构类型（CSV）' AFTER wincc_variable_name,
    ADD COLUMN data_type VARCHAR(255) NULL COMMENT '数据类型（CSV）' AFTER structure_type;
