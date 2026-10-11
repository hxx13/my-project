-- ============================================================
-- ai_capability_prompt 增列 note（操作备注）
--
-- 每条推荐词多一句「点了会做什么」的说明 —— 只有标题时，用户不知道点下去会发生什么。
-- 同源：db/bootstrap-ai-capability-prompt.sql（新建表已含此列）。
--
-- 幂等：先查 information_schema 再 ALTER，存在即跳过。
-- （MySQL 不认 `ADD COLUMN IF NOT EXISTS`，必须走这一段动态 SQL。）
-- ============================================================
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_capability_prompt' AND COLUMN_NAME = 'note');
SET @sql = IF(@col = 0, 'ALTER TABLE ai_capability_prompt ADD COLUMN note VARCHAR(255) NOT NULL DEFAULT '''' COMMENT ''操作备注：这条提示词点了会做什么（给用户看的说明）'' AFTER prompt_text', 'SELECT ''note exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
