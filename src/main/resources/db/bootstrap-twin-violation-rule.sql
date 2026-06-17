-- 违规触发规则表（可扩展框架）
CREATE TABLE IF NOT EXISTS twin_violation_rule (
    id              BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    rule_code       VARCHAR(64)  NOT NULL,
    rule_name       VARCHAR(128) NOT NULL,
    enabled         TINYINT(1)   NOT NULL DEFAULT 1,
    source_tag      VARCHAR(30)  NULL,
    violation_text_tpl          TEXT         NULL,
    forbid_enter                TINYINT(1)   NOT NULL DEFAULT 0,
    expire_after_days           INT          NULL,
    show_notice_every_scan      TINYINT(1)   NOT NULL DEFAULT 1,
    interactive_challenge       VARCHAR(255) NULL,
    interactive_unlock_on_verify TINYINT(1)  NOT NULL DEFAULT 1,
    unblock_method      VARCHAR(20)  NOT NULL DEFAULT '自助解禁',
    unblock_max_count   INT          NULL,
    unblock_window_type VARCHAR(20)  NULL DEFAULT '滑动窗口',
    unblock_window_value INT         NULL DEFAULT 30,
    auto_signout_enabled TINYINT(1)  NOT NULL DEFAULT 0,
    whitelist_depts     JSON         NULL,
    cron_expression     VARCHAR(64)  NULL,
    last_execution_at   DATETIME     NULL,
    last_execution_result TEXT       NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_vr_code (rule_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 违规记录表加列（幂等：失败即跳过）
ALTER TABLE twin_student_violation ADD COLUMN rule_id BIGINT NULL;

ALTER TABLE twin_student_violation ADD INDEX idx_tsv_rule (rule_id);

-- 种子数据：滞留未签退规则
INSERT IGNORE INTO twin_violation_rule (rule_code, rule_name, source_tag, violation_text_tpl, forbid_enter, expire_after_days, unblock_method, unblock_max_count, unblock_window_type, unblock_window_value, auto_signout_enabled)
VALUES ('AUTO_STRANDED', '滞留未签退', 'AUTO_STRANDED', '${name}(${dept})滞留未签退，系统自动登记', 0, 30, '自助解禁', 3, '滑动窗口', 30, 1);

-- 种子数据：手动违规规则
INSERT IGNORE INTO twin_violation_rule (rule_code, rule_name, source_tag, forbid_enter, unblock_method, unblock_max_count, unblock_window_type, unblock_window_value)
VALUES ('MANUAL', '手动违规', 'MANUAL', 0, '仅工作人员', NULL, '滑动窗口', 30);
