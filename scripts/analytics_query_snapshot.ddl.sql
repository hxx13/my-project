-- 统计查询快照（封闭历史周期，避免重复聚合）
-- 目标库默认 twin_system

CREATE TABLE IF NOT EXISTS analytics_query_snapshot (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    view_id BIGINT NOT NULL COMMENT '关联 analytics_user_view.id',
    report_key VARCHAR(64) NOT NULL,
    period_key VARCHAR(64) NOT NULL COMMENT '如 day:2026-05-16 / week:2026-W19 / month:2026-04',
    query_cycle VARCHAR(16) NOT NULL,
    filter_json JSON NOT NULL,
    report_json JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_aqs_view_period (user_id, view_id, report_key, period_key),
    KEY idx_aqs_view (view_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='隔离统计-历史周期查询快照';
