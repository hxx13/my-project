-- 笼位特殊状态持续告警配置表
-- 独立于 TwinViolationRule 违规系统，轻量级全局阈值配置
CREATE TABLE IF NOT EXISTS cage_alert_config (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    status_code     VARCHAR(32)  NOT NULL UNIQUE COMMENT '状态码 e.g. NEED_DIVIDE',
    status_label    VARCHAR(64)  COMMENT '状态显示名（冗余，前端展示）',
    threshold_days  INT          NOT NULL DEFAULT 7 COMMENT '持续多少天后触发告警',
    enabled         TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '是否启用',
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 预置默认配置：请分笼/密度超标7天、健康异常3天、动物转移5天
INSERT INTO cage_alert_config (status_code, status_label, threshold_days, enabled) VALUES
('NEED_DIVIDE',     '请分笼/密度超标',  7, 1),
('HEALTH_ABNORMAL', '动物健康异常',     3, 1),
('ANIMAL_TRANSFER', '动物转移',         5, 1)
ON DUPLICATE KEY UPDATE status_label = VALUES(status_label);
