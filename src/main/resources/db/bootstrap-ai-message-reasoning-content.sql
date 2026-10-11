-- ============================================================
-- ai_message 增列 reasoning_content —— 本轮模型的思考正文。
--
-- 为什么要它：上游一直在返回 reasoning_content，本仓库此前**一个字段都没读**
-- （2026-10-11 真实调用实测确认）。用户干等的那几秒里模型其实「说」了话，被丢掉了。
-- 落库后界面能折叠展示，日后也能查「它当时为什么这么选」。
--
-- 幂等：先查 information_schema 再 ALTER，存在即跳过。
-- 同源：AiGatewaySchemaMigrator 的 CREATE TABLE ai_message（新建库已含此列）。
-- ============================================================
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_message' AND COLUMN_NAME = 'reasoning_content');
SET @sql = IF(@col = 0, 'ALTER TABLE ai_message ADD COLUMN reasoning_content MEDIUMTEXT NULL COMMENT ''本轮模型的思考正文（上游 reasoning_content）''', 'SELECT ''reasoning_content exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
