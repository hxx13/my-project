-- ============================================================
-- ai_drawer_feedback 增列 replies_json
--
-- 官方回复从「单个回复位」改成「回复串」：多次回复逐条追加到 JSON 数组，
-- 不再互相覆盖。旧单回复列（reply_content/reply_image_urls/replied_by/replied_at）
-- 保留作兼容读，值等于回复串的最后一条。
--
-- 幂等：先查 information_schema 再 ALTER，存在即跳过。
-- 同源：db/bootstrap-ai-drawer-feedback.sql（新建表已含此列）。
-- ============================================================
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_drawer_feedback' AND COLUMN_NAME = 'replies_json');
SET @sql = IF(@col = 0, 'ALTER TABLE ai_drawer_feedback ADD COLUMN replies_json TEXT NULL COMMENT ''回复串（JSON 数组，按时间升序，元素 {content,imageUrls,repliedBy,repliedAt}）'' AFTER status', 'SELECT ''replies_json exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
