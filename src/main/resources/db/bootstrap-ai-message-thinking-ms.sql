-- ============================================================
-- ai_message 增列 thinking_ms —— **真正的思考用时**（毫秒）。
--
-- 与非流式那个 latency_ms 不是一回事：latency_ms 是模型调用的总耗时，**含思考也含正文生成**，
-- 界面上的「用时」拿它冒充的话，看到的是「用户等了多久」而不是「模型想了多久」——
-- 而用户等的那些秒里，大头往往是工具在查数据。
--
-- 这个数只在**流式**下才存在：整包返回没有「思考结束」这个时刻。取得方式是
-- 「从请求发出，到第一个非思考增量到达」的那段毫秒（见 DashScopeChatClient.streamToolCall）。
--
-- 幂等：先查 information_schema 再 ALTER，存在即跳过。
-- 同源：AiGatewaySchemaMigrator 的 CREATE TABLE ai_message（新建库已含此列）。
-- ============================================================
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_message' AND COLUMN_NAME = 'thinking_ms');
SET @sql = IF(@col = 0, 'ALTER TABLE ai_message ADD COLUMN thinking_ms BIGINT NULL COMMENT ''真正的思考用时（毫秒）：请求发出到第一个非思考增量到达''', 'SELECT ''thinking_ms exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
