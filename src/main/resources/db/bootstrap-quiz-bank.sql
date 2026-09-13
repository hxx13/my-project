-- 答题题库（违规「答题」处置策略的题库主表）
CREATE TABLE IF NOT EXISTS twin_quiz_bank (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    bank_id     VARCHAR(64)  NOT NULL COMMENT '题库编码，策略配置里填这个',
    name        VARCHAR(128) NOT NULL COMMENT '题库名称',
    enabled     TINYINT      NOT NULL DEFAULT 1 COMMENT '1=启用',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_quiz_bank_id (bank_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='答题题库';
