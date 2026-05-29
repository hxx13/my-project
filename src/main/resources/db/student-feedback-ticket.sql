CREATE TABLE IF NOT EXISTS student_feedback_ticket (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    content TEXT,
    type VARCHAR(32) DEFAULT 'suggestion',
    status VARCHAR(32) DEFAULT 'pending',
    reply_content TEXT,
    replied_by VARCHAR(64),
    replied_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
