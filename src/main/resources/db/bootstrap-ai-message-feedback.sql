-- ============================================================
-- ai_message_feedback —— **回复级**反馈（赞 / 踩）。
--
-- 为什么要新表，不复用 ai_drawer_feedback：
--   那张是**意见箱**（用户提意见 + 截图，超管回复），挂在**人**身上；
--   这张是**对某一条回复**的评价，挂在**消息**上，且**同一人对同一回复只算一次**（唯一键保证）。
--   两者语义与治理都不同，混一张表会让「这条回复好不好」被「张三提过一个意见」污染。
--
-- 用途：判据的**显式**那一路（设计文档 §5）。它样本稀（大多数人不会点），所以是**辅助**——
--   主判据是行为（认了 / 没听懂 / 点选 / 弃聊），那几路从留痕里算，不靠这张表。
--
-- 幂等：CREATE TABLE IF NOT EXISTS。
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_message_feedback (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    message_id  BIGINT       NOT NULL COMMENT '挂在哪一条 assistant 回复上',
    session_id  BIGINT       NOT NULL COMMENT '冗余一份：按会话聚合时不必联表',
    user_id     VARCHAR(50)  NOT NULL COMMENT '谁点的（JWT 解析所得，字符串型雪花 id）',
    vote        VARCHAR(8)   NOT NULL COMMENT 'up = 赞 / down = 踩',
    reason      VARCHAR(255) NOT NULL DEFAULT '' COMMENT '踩时选一句原因，可空',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_message_user (message_id, user_id),
    KEY idx_session (session_id),
    KEY idx_vote_created (vote, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 回复级反馈（赞/踩）';
