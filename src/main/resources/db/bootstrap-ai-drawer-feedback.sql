-- AI 抽屉反馈（与学生域无关）：用户对 AI 抽屉提的意见/截图，超管回复。
-- 提交人与回复人存 id；姓名入库存快照，列表不必联表取名字。
-- 幂等：CREATE TABLE IF NOT EXISTS。
CREATE TABLE IF NOT EXISTS ai_drawer_feedback (
    id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id       VARCHAR(64)  NOT NULL COMMENT '提交人 id',
    user_name     VARCHAR(128) NULL COMMENT '提交人姓名快照',
    content       TEXT         NULL COMMENT '反馈内容',
    image_urls    TEXT         NULL COMMENT '图片地址数组（JSON 数组字符串）',
    status        VARCHAR(16)  NOT NULL DEFAULT 'PENDING' COMMENT '状态，默认 PENDING',
    replies_json  TEXT         NULL COMMENT '回复串（JSON 数组，按时间升序，元素 {content,imageUrls,repliedBy,repliedAt}）',
    reply_content TEXT         NULL COMMENT '回复内容',
    reply_image_urls TEXT      NULL COMMENT '回复附图地址数组（JSON 数组字符串）',
    replied_by    VARCHAR(64)  NULL COMMENT '回复人 id',
    replied_at    DATETIME     NULL COMMENT '回复时间',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_user (user_id),
    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 抽屉反馈（提交/回复）';
