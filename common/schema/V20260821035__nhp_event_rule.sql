-- NHP event rule engine（archive; runtime bootstrap-nhp-event-rule.sql）
-- V20260821035 §6.3
-- capture_form on crf_form lives here (SERIES/LEDGER/PANEL)

CREATE TABLE IF NOT EXISTS crf_event_rule (
    id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    source_atom  VARCHAR(16)  NOT NULL COMMENT '源事件类型=原子 code，如 SMP/MED/TX/AE/XM',
    trigger_on   VARCHAR(20)  NOT NULL COMMENT 'CREATED 入库 / STATUS_CHANGED 状态变更',
    trigger_cond VARCHAR(32)  NULL COMMENT 'STATUS_CHANGED 目标状态，如 APPROVED',
    action       VARCHAR(20)  NOT NULL COMMENT 'EXPAND_SCHEDULE/GENERATE_TODO/CREATE_EVENT/ADVANCE_STATE',
    action_spec  TEXT         NULL COMMENT 'JSON：schedule_anchor/todo_type/event_atom/target_state',
    sort_order   INT          NOT NULL DEFAULT 0,
    active       TINYINT      NOT NULL DEFAULT 1,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_event_rule_src_act (source_atom, trigger_on, action, sort_order),
    KEY idx_crf_event_rule_atom (source_atom)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP 事件规则引擎';

CREATE TABLE IF NOT EXISTS crf_todo (
    id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    subject_id    BIGINT       NOT NULL COMMENT 'FK→crf_subject',
    transplant_id BIGINT       NULL COMMENT 'FK→crf_transplant',
    todo_type     VARCHAR(32)  NOT NULL COMMENT 'TEST_ORDER/BIOPSY/TROUGH/…',
    source        VARCHAR(20)  NOT NULL COMMENT 'SCHEDULE / EVENT_RULE',
    source_ref    VARCHAR(64)  NULL COMMENT 'visit_instance_id 或事件 id',
    due_date      DATE         NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'OPEN' COMMENT 'OPEN/DONE/CANCELLED；OVERDUE 派生不落库',
    active        TINYINT      NOT NULL DEFAULT 1,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_crf_todo_subject (subject_id),
    KEY idx_crf_todo_status (status),
    KEY idx_crf_todo_due (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP 待办（调度+事件双源）';

ALTER TABLE crf_form
    ADD COLUMN IF NOT EXISTS capture_form VARCHAR(16) NULL COMMENT '采集形态 SERIES/LEDGER/PANEL（推导）' AFTER frequency;

-- seed 5 驱动链（AE 拆 2 条 action → 共 6 行，INSERT IGNORE 幂等）
INSERT IGNORE INTO crf_event_rule (source_atom, trigger_on, trigger_cond, action, action_spec, sort_order, active) VALUES
('SMP', 'CREATED', NULL, 'GENERATE_TODO', '{"todo_type":"TEST_ORDER"}', 10, 1),
('TX', 'CREATED', NULL, 'EXPAND_SCHEDULE', '{"schedule_anchor":"POST_TX"}', 20, 1),
('AE', 'CREATED', NULL, 'GENERATE_TODO', '{"todo_type":"BIOPSY"}', 30, 1),
('AE', 'CREATED', NULL, 'CREATE_EVENT', '{"event_atom":"TP10"}', 31, 1),
('MED', 'CREATED', NULL, 'GENERATE_TODO', '{"todo_type":"TROUGH"}', 40, 1),
('XM', 'STATUS_CHANGED', 'APPROVED', 'ADVANCE_STATE', '{"target_state":"MATCHING"}', 50, 1);
