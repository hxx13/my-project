-- 统计审计：订阅开关 + 周期对比审计日志
-- 目标库默认 twin_system（见 application.properties spring.datasource.url）
-- 启动应用前在目标库执行本脚本，或依赖 AnalyticsSchemaMigrator 自动迁移

ALTER TABLE analytics_user_view
    ADD COLUMN IF NOT EXISTS is_subscribed TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=参与自动审计对比' AFTER is_default;

CREATE TABLE IF NOT EXISTS analytics_audit_log (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    view_id BIGINT NOT NULL,
    report_key VARCHAR(64) NOT NULL,
    view_name VARCHAR(128) NOT NULL DEFAULT '',
    period_type VARCHAR(16) NOT NULL COMMENT 'day|week|month',
    period_label VARCHAR(32) NOT NULL COMMENT '如 2026-05-17 / 2026-W20 / 2026-05',
    current_start DATETIME NOT NULL,
    current_end DATETIME NOT NULL,
    previous_start DATETIME NOT NULL,
    previous_end DATETIME NOT NULL,
    current_rounds BIGINT NOT NULL DEFAULT 0,
    previous_rounds BIGINT NOT NULL DEFAULT 0,
    current_users INT NOT NULL DEFAULT 0,
    previous_users INT NOT NULL DEFAULT 0,
    current_groups INT NOT NULL DEFAULT 0,
    previous_groups INT NOT NULL DEFAULT 0,
    delta_rounds BIGINT NOT NULL DEFAULT 0,
    delta_pct DECIMAL(10, 2) NULL,
    top_groups_json JSON NULL COMMENT '当期课题组 TOP 快照',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_aal_user_report_time (user_id, report_key, created_at),
    KEY idx_aal_view_period (view_id, period_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='统计审计-订阅周期对比日志';
