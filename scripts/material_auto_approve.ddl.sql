-- 物资申领自动审批规则
-- 目标库见 application.properties spring.datasource.url（默认 twin_system）

CREATE TABLE IF NOT EXISTS material_auto_trust (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    owner_user_id VARCHAR(64) NOT NULL COMMENT '配置人（通常为审核教职工）',
    subject_user_id VARCHAR(64) NOT NULL COMMENT '被信任申请人',
    item_id BIGINT NOT NULL COMMENT 'material_item.id，必填',
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    trigger_mode VARCHAR(20) NOT NULL DEFAULT 'ON_SUBMIT' COMMENT 'ON_SUBMIT/SCHEDULED',
    schedule_cron VARCHAR(64) NULL COMMENT 'trigger_mode=SCHEDULED 时 Cron',
    note VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_mat_trust (owner_user_id, subject_user_id, item_id),
    KEY idx_mat_trust_owner (owner_user_id, enabled),
    KEY idx_mat_trust_subject (subject_user_id, item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物资申领按人信任自动审批';

CREATE TABLE IF NOT EXISTS material_auto_batch (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    owner_user_id VARCHAR(64) NOT NULL COMMENT '配置人',
    name VARCHAR(128) NOT NULL DEFAULT '批量自动审批',
    item_ids JSON NOT NULL COMMENT 'item id 数组，至少一项',
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    schedule_cron VARCHAR(64) NOT NULL DEFAULT '0 */15 * * * *' COMMENT '默认定时每15分钟',
    max_per_run INT NOT NULL DEFAULT 20,
    only_if_reviewer_match TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_mat_batch_owner (owner_user_id, enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物资申领批量自动审批';

CREATE TABLE IF NOT EXISTS material_auto_approve_log (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    rule_type VARCHAR(16) NOT NULL COMMENT 'trust/batch',
    rule_id BIGINT NULL,
    request_id VARCHAR(32) NOT NULL,
    result VARCHAR(32) NOT NULL COMMENT 'APPROVED/SKIPPED/FAILED',
    message VARCHAR(255) NULL,
    executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_mat_auto_log_req (request_id),
    KEY idx_mat_auto_log_at (executed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物资申领自动审批执行日志';
