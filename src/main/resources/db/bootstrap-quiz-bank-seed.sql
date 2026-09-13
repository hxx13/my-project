-- 题库种子：默认题库（幂等，靠 uk_quiz_bank_id）
INSERT IGNORE INTO twin_quiz_bank (bank_id, name, enabled)
VALUES ('default', '默认题库', 1);
