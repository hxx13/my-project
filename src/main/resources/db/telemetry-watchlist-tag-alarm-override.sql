-- 每测点报警上下限覆盖（优先级高于 telemetry_global_alarm_limits）
ALTER TABLE telemetry_watchlist_tag
    ADD COLUMN alarm_override_min VARCHAR(256) NULL COMMENT '报警下限覆盖（可空表示不覆盖）',
    ADD COLUMN alarm_override_max VARCHAR(256) NULL COMMENT '报警上限覆盖（可空表示不覆盖）';
