-- 与 common/schema/V20260821002__obligation_core.sql 内容一致（幂等 CREATE IF NOT EXISTS）

CREATE TABLE IF NOT EXISTS twin_obligation (
    id                   BIGINT AUTO_INCREMENT PRIMARY KEY,
    subject_user_id      VARCHAR(64)  NOT NULL COMMENT '待办主体用户',
    source_type          VARCHAR(32)  NOT NULL COMMENT 'STUDENT_VIOLATION / ANNOUNCEMENT / UNBOUND',
    source_id            VARCHAR(64)  NOT NULL COMMENT '来源业务主键',
    title                VARCHAR(256) NULL,
    content_html         MEDIUMTEXT   NULL,
    disposition_type     VARCHAR(32)  NOT NULL DEFAULT 'SHOW_ONLY'
        COMMENT 'SHOW_ONLY / ACK_READ / ACK_PUZZLE / QUIZ / SIGNATURE',
    disposition_config_json JSON      NULL COMMENT '策略自带配置',
    status               VARCHAR(32)  NOT NULL DEFAULT 'PENDING_DISPOSITION'
        COMMENT 'PENDING_DELIVERY / DELIVERED / PENDING_DISPOSITION / COMPLETED / EXPIRED / REVOKED',
    due_at               DATETIME     NULL,
    created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_obligation_source (source_type, source_id),
    KEY idx_obligation_subject_status (subject_user_id, status),
    KEY idx_obligation_due (due_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='待办事项（违规/公告/未绑卡统一模型）';

CREATE TABLE IF NOT EXISTS twin_obligation_receipt (
    id                   BIGINT AUTO_INCREMENT PRIMARY KEY,
    obligation_id        BIGINT       NOT NULL,
    subject_user_id      VARCHAR(64)  NOT NULL,
    channel              VARCHAR(32)  NOT NULL COMMENT 'SCAN / H5 / MP / NOTIFY',
    attempt_no           INT          NOT NULL DEFAULT 1,
    answer_payload       JSON         NULL COMMENT '答了什么（可举证）',
    completed_at         DATETIME     NOT NULL,
    created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_receipt_obligation_subject (obligation_id, subject_user_id),
    KEY idx_receipt_subject (subject_user_id),
    CONSTRAINT fk_receipt_obligation
        FOREIGN KEY (obligation_id) REFERENCES twin_obligation (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='处置回执（人×待办唯一）';
