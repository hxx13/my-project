-- ============================================================
-- ai_message 增列 prompt_cache_miss_tokens —— 本轮输入里**没命中缓存**的 token 数。
--
-- 与命中那列成对，见 bootstrap-ai-message-cache-hit-tokens.sql 的说明。
-- 两列一起才算得出命中率：hit / (hit + miss)。
--
-- 幂等：先查 information_schema 再 ALTER，存在即跳过。
-- 同源：AiGatewaySchemaMigrator 的 CREATE TABLE ai_message（新建库已含此列）。
-- ============================================================
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_message' AND COLUMN_NAME = 'prompt_cache_miss_tokens');
SET @sql = IF(@col = 0, 'ALTER TABLE ai_message ADD COLUMN prompt_cache_miss_tokens INT NULL COMMENT ''本轮输入未命中缓存的 token 数（上游精确给出）''', 'SELECT ''prompt_cache_miss_tokens exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
