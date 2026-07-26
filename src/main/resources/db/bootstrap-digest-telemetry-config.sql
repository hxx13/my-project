-- ============================================================
-- 动物房环境报警 — 聚合通知默认配置（每次部署自动同步）
-- Layer-2 聚合间隔 ≥ Layer-1 缓冲冷却 (5min)
-- ============================================================
INSERT INTO notify_digest_default_config (source_code, digest_mode, overflow_strategy, minutely_interval, schedule_times, digest_title_tpl, digest_content_tpl, enabled)
VALUES ('TELEMETRY_ALARM', 'MINUTELY', 'ROLL_OVER', 5, NULL, 'ARO 环境监测 · {time}', '{userName}，{count} 条环境报警\n\n{items}', 1)
ON DUPLICATE KEY UPDATE
    digest_mode = VALUES(digest_mode),
    minutely_interval = VALUES(minutely_interval),
    digest_title_tpl = VALUES(digest_title_tpl),
    digest_content_tpl = VALUES(digest_content_tpl);

INSERT INTO notify_digest_default_config (source_code, digest_mode, overflow_strategy, minutely_interval, schedule_times, digest_title_tpl, digest_content_tpl, enabled)
VALUES ('TELEMETRY_RECOVERY', 'MINUTELY', 'ROLL_OVER', 5, NULL, 'ARO 环境监测 · {time}', '{userName}，{count} 条环境恢复\n\n{items}', 1)
ON DUPLICATE KEY UPDATE
    digest_mode = VALUES(digest_mode),
    minutely_interval = VALUES(minutely_interval),
    digest_title_tpl = VALUES(digest_title_tpl),
    digest_content_tpl = VALUES(digest_content_tpl);
