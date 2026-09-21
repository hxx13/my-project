-- 移动端公告已读游标（一人一行）：记录「已看到哪个时间点为止」，不逐条记已读。
-- 与 chat_conversation_read 同型，用于手机端公告红点「有新公告没看」。
--
-- 幂等：bootstrap 侧走 db/bootstrap-student-announcement-view.sql（CREATE TABLE IF NOT EXISTS）。
-- 本文件仅作归档记录，服务器上手动执行。
CREATE TABLE IF NOT EXISTS student_announcement_view (
    user_id VARCHAR(64) NOT NULL COMMENT '读游标所属用户（账号 id）',
    last_viewed_at DATETIME(3) NOT NULL COMMENT '已看到该时间戳（含）之前的公告',
    PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='移动端公告已读游标（一人一行）';
