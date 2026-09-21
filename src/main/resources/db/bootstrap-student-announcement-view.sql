-- 移动端公告已读游标（一人一行）：手机端公告红点判定用。
-- 由 EmbeddedTwinSystemCoreDdlBootstrap 在启动时执行，幂等。
-- 注意：本仓约定一个 bootstrap 文件只放一条 DDL，多的会被前一条 benign 失败整段跳过。
CREATE TABLE IF NOT EXISTS student_announcement_view (
    user_id VARCHAR(64) NOT NULL COMMENT '读游标所属用户（账号 id）',
    last_viewed_at DATETIME(3) NOT NULL COMMENT '已看到该时间戳（含）之前的公告',
    PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='移动端公告已读游标（一人一行）';
