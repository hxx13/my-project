-- 统计与审计：用户视图新增 is_public 列，支持「对所有人可见」
-- 目标库 twin_system；仅需执行一次

ALTER TABLE analytics_user_view
    ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=对所有人可见' AFTER is_subscribed;
