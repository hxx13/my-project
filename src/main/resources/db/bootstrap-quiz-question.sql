-- 答题题库 · 题目
CREATE TABLE IF NOT EXISTS twin_quiz_question (
    id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    bank_id       VARCHAR(64)  NOT NULL COMMENT '所属题库编码',
    prompt        VARCHAR(512) NOT NULL COMMENT '题干',
    options_json  JSON         NOT NULL COMMENT '选项数组，如 ["A","B"]',
    correct_index INT          NOT NULL DEFAULT 0 COMMENT '正确选项下标（0 起）',
    enabled       TINYINT      NOT NULL DEFAULT 1 COMMENT '1=启用（抽题只取启用题）',
    sort_order    INT          NOT NULL DEFAULT 0 COMMENT '排序；同库内唯一，兼作种子幂等键',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_quiz_question_order (bank_id, sort_order),
    KEY idx_quiz_question_bank (bank_id, enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='答题题库·题目';
