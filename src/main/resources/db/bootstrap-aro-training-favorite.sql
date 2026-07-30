-- ARO 培训场次收藏表，用于审批订阅通知
CREATE TABLE IF NOT EXISTS aro_training_favorite (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     VARCHAR(64) NOT NULL,
    session_id  VARCHAR(64) NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_session (user_id, session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
