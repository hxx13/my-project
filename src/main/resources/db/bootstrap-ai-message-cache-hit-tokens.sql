-- ============================================================
-- ai_message 增列 prompt_cache_hit_tokens —— 本轮输入里**命中缓存**的 token 数。
--
-- 上游在 `usage` 里把命中与未命中**分开给**，此前一个数都没落库，只打了一行日志。
-- 落库的理由是设计文档 §1.1 那套论证一直缺一个真实数字：
-- 「缓存命中比未命中便宜约 50 倍 → 共享内容必须拼在最前、个性化只能追加在最后」。
-- 有了这两列，命中率就能**实测**：同会话第二轮起命中应显著大于 0；恒为 0 就是拼装顺序出了问题。
--
-- 幂等：先查 information_schema 再 ALTER，存在即跳过。
-- 同源：AiGatewaySchemaMigrator 的 CREATE TABLE ai_message（新建库已含此列）。
-- ============================================================
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_message' AND COLUMN_NAME = 'prompt_cache_hit_tokens');
SET @sql = IF(@col = 0, 'ALTER TABLE ai_message ADD COLUMN prompt_cache_hit_tokens INT NULL COMMENT ''本轮输入命中缓存的 token 数（上游精确给出）''', 'SELECT ''prompt_cache_hit_tokens exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
