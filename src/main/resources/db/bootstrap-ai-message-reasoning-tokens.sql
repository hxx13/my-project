-- ============================================================
-- ai_message 增列 reasoning_tokens —— 本轮思考消耗的 token。
--
-- 上游 `usage.completion_tokens_details.reasoning_tokens` **精确给出**，不是估的。
-- 用来在界面上显示「思考了 N 字」——比拿前端墙钟冒充「思考中」可靠得多
-- （墙钟里绝大部分其实是工具在查数据）。
--
-- 幂等：先查 information_schema 再 ALTER，存在即跳过。
-- 同源：AiGatewaySchemaMigrator 的 CREATE TABLE ai_message（新建库已含此列）。
-- ============================================================
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_message' AND COLUMN_NAME = 'reasoning_tokens');
SET @sql = IF(@col = 0, 'ALTER TABLE ai_message ADD COLUMN reasoning_tokens INT NULL COMMENT ''本轮思考消耗的 token（上游精确给出）''', 'SELECT ''reasoning_tokens exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
