-- 低频 WinCC 限值拉取缓存（写在「主测量」变量行上，管理端展示）
ALTER TABLE telemetry_watchlist_tag
    ADD COLUMN cached_alarm_min_value VARCHAR(256) NULL COMMENT '缓存下限（WinCC 低频拉取）',
    ADD COLUMN cached_alarm_max_value VARCHAR(256) NULL COMMENT '缓存上限（WinCC 低频拉取）',
    ADD COLUMN cached_alarm_limits_at DATETIME NULL COMMENT '上下限缓存更新时间';
