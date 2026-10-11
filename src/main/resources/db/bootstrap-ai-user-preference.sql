-- ============================================================
-- 用户偏好层：每个人自己的习惯，开启对话时追加在提示词最后。
--
-- 与「学习池」（ai_learn_entry）**共用条目结构、但绝不混成一张表**（设计 §8.6）：
--   学习池 —— 全站可见、走影子期、由分析器自动写；
--   本表   —— 仅本人可见、不走影子期、由模型在对话里自主增删。
-- 两者的作用域与治理强度完全不同，混在一起会让治理强度被最弱的那一方拉低。
--
-- 隐私红线（设计 §3.3）：这里只存**偏好内容本身**，不存整段会话、不存姓名工号。
--
-- 幂等：CREATE TABLE IF NOT EXISTS。
-- 同源：AiGatewaySchemaMigrator 的建表段（新建库走那边，这里保证老库也有）。
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_user_preference (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL COMMENT '本人 user.id（JWT 解析所得，字符串型雪花 id）',
    content VARCHAR(500) NOT NULL COMMENT '偏好内容，一行一条；键是「人 + 内容」',
    source VARCHAR(16) NOT NULL DEFAULT 'CHAT' COMMENT 'CHAT=模型在对话里写的 / ADMIN=管理端',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_content (user_id, content),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户自己的偏好（仅本人可见，不走影子期）';
