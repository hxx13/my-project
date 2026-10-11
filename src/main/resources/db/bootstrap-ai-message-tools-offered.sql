-- ============================================================
-- ai_message 增列 tools_offered —— 「本轮实际发给模型的工具名清单」。
--
-- 为什么要它：审计里原先只记了「模型调了什么」，没记「它当时手上有什么」，
-- 于是想判断「是不是选错了工具」（明明有更合适的却没挑）只能靠猜，
-- 而且**这段历史永远补不回来**（建表处那句「审计字段必须一次定全」说的就是这件事）。
--
-- 幂等：先查 information_schema 再 ALTER，存在即跳过。
-- 同源：AiGatewaySchemaMigrator 的 CREATE TABLE ai_message（新建库已含此列）。
-- ============================================================
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_message' AND COLUMN_NAME = 'tools_offered');
SET @sql = IF(@col = 0, 'ALTER TABLE ai_message ADD COLUMN tools_offered MEDIUMTEXT NULL COMMENT ''本轮实际发给模型的工具名清单（逗号分隔，已按能力过滤）''', 'SELECT ''tools_offered exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
