-- 结构化映射列（旧库升级）。重复执行时可能报 Duplicate column，initializer 已 continueOnError。

ALTER TABLE telemetry_watchlist_tag
    ADD COLUMN floor_code VARCHAR(32) NULL COMMENT '楼层，如 2F、B1F' AFTER display_label;

ALTER TABLE telemetry_watchlist_tag
    ADD COLUMN room_base VARCHAR(64) NULL COMMENT '房间号主体，如 201' AFTER floor_code;

ALTER TABLE telemetry_watchlist_tag
    ADD COLUMN room_canonical VARCHAR(128) NULL COMMENT '归并展示键，如 2F-201；201A/201B 可同键' AFTER room_base;

ALTER TABLE telemetry_watchlist_tag
    ADD COLUMN suite_suffix VARCHAR(16) NULL COMMENT '套间后缀 A/B 等' AFTER room_canonical;

ALTER TABLE telemetry_watchlist_tag
    ADD COLUMN metric_kind_code VARCHAR(64) NULL COMMENT '指标类型，对应 telemetry_metric_kind.code' AFTER suite_suffix;
