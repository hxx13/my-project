-- 归档迁移：答题题库（与 src/main/resources/db/bootstrap-quiz-*.sql 同源）。
-- 建表幂等；种子用 INSERT IGNORE，靠唯一键去重，可重复执行。

CREATE TABLE IF NOT EXISTS twin_quiz_bank (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    bank_id     VARCHAR(64)  NOT NULL COMMENT '题库编码，策略配置里填这个',
    name        VARCHAR(128) NOT NULL COMMENT '题库名称',
    enabled     TINYINT      NOT NULL DEFAULT 1 COMMENT '1=启用',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_quiz_bank_id (bank_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='答题题库';

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

INSERT IGNORE INTO twin_quiz_bank (bank_id, name, enabled) VALUES ('default', '默认题库', 1);

INSERT IGNORE INTO twin_quiz_question (bank_id, prompt, options_json, correct_index, enabled, sort_order) VALUES
('default', '进入动物房前必须佩戴什么？', '["口罩与隔离衣","拖鞋即可","无需防护","随意着装"]', 0, 1, 1),
('default', '一人一卡的含义是？', '["每人只用自己的门禁卡","可共用一张卡","卡坏了可借同事的","访客卡可转借"]', 0, 1, 2),
('default', '发现笼位异常应首先？', '["按规程上报并记录","自行挪笼不登记","忽略","私下处理"]', 0, 1, 3),
('default', '滞留未签退的正确做法？', '["及时签退并说明原因","第二天再说","让同学代签","不用管"]', 0, 1, 4),
('default', '扫码弹窗要求确认时？', '["按提示完成确认后再进入","关掉弹窗强行进入","让别人代答","截图即可"]', 0, 1, 5);
