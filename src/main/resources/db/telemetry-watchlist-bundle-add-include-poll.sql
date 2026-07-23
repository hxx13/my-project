-- 已有 telemetry_watchlist_bundle 表时增加「是否参与 WinCC 拉数」开关列（twin_system 执行一次）。

ALTER TABLE telemetry_watchlist_bundle
    ADD COLUMN include_in_wincc_poll TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=本分区参与 WinCC 合并拉数' AFTER is_active;
