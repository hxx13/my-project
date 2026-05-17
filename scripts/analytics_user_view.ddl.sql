-- 统计与审计：用户保存的筛选视图（订阅配置）
-- 目标库默认 twin_system（见 application.properties spring.datasource.url）
-- 启动应用前在目标库执行本脚本，或执行 schema.sql 中同名段落

CREATE TABLE IF NOT EXISTS analytics_user_view (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL COMMENT '登录用户 ID',
    report_key VARCHAR(64) NOT NULL COMMENT '报表标识，如 isolation_usage',
    name VARCHAR(128) NOT NULL COMMENT '用户自定义视图名称',
    filter_json JSON NOT NULL COMMENT '筛选条件 JSON',
    is_default TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=该报表下默认视图',
    is_subscribed TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=参与自动审计对比',
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_auv_user_report (user_id, report_key),
    KEY idx_auv_user_default (user_id, report_key, is_default)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='统计审计-用户筛选订阅';
