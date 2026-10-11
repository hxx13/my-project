-- ============================================================
-- 条件触发器（监视器）：**当 <条件> 成立时，执行 <动作>**。
--
-- 与 ai_timer 的区别是**触发源**：定时器到点就执行，监视器要先把条件查出来。
-- 而「查什么、怎么判、盯多久」这三样 ai_timer 装不下，所以另起一张表。
--
-- 两个关键字段的由来：
--   baseline_value —— 创建时先跑一次检查、把这个值存下来。
--     判据是「**比开始时多了**」，不是「大于 0」。写「>0」有两个坑：
--     ① 盯之前就发生过的事会被当成刚发生；② 大华是定时拉取的，记录可能晚一两分钟才落库，
--     窗口若按「上次检查→现在」滑动，晚到的记录会掉进两窗之间的缝里、永远查不到。
--     窗口从 started_at 一直开到"现在"（只增不减）+ 比基线，两个坑都没有。
--   next_check_at —— 下一次该查的时刻。就地更新，不加调度基建。
--
-- 幂等：CREATE TABLE IF NOT EXISTS。
-- 同源：EmbeddedTwinSystemCoreDdlBootstrap 的 runAllScripts（本文件已在链上注册）。
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_watch (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    owner_user_id VARCHAR(50) NOT NULL COMMENT '建单人 user.id —— 到点执行时用它做身份与鉴权',
    owner_name_snapshot VARCHAR(64) NULL COMMENT '建单人姓名快照，列表里直接显示',
    session_id BIGINT NULL COMMENT '从哪条会话建的（做完回话用）',
    message_id BIGINT NULL,
    label VARCHAR(200) NOT NULL COMMENT '人话说明，例如「大厅开门后开监控室的门」',
    check_tool VARCHAR(64) NOT NULL COMMENT '检查用哪个工具',
    check_args MEDIUMTEXT NULL COMMENT '检查参数 JSON（时间窗由调度器填，见 started_at）',
    check_field VARCHAR(128) NOT NULL COMMENT '从检查结果里取哪个字段来判，支持 a.b 路径',
    check_op VARCHAR(16) NOT NULL COMMENT '比较符：INCREASED/CHANGED/NOT_EMPTY/EMPTY/GT/LT/EQ/NE',
    check_value VARCHAR(64) NULL COMMENT '比较值（INCREASED/CHANGED/NOT_EMPTY/EMPTY 不用）',
    baseline_value VARCHAR(64) NULL COMMENT '创建时那次检查的取值 —— 判「比开始时多了」的基准',
    act_tool VARCHAR(64) NOT NULL COMMENT '条件成立后执行哪个工具',
    act_args MEDIUMTEXT NULL COMMENT '动作参数 JSON',
    interval_seconds INT NOT NULL COMMENT '多久查一次',
    timeout_seconds INT NOT NULL COMMENT '最多盯多久（到点还没成立就放弃并通知）',
    status VARCHAR(16) NOT NULL DEFAULT 'WATCHING' COMMENT 'WATCHING/DONE/EXPIRED/CANCELLED/FAILED',
    attempts INT NOT NULL DEFAULT 0 COMMENT '已经查过几次',
    last_checked_at DATETIME NULL,
    next_check_at DATETIME NOT NULL COMMENT '下一次该查的时刻',
    started_at DATETIME NOT NULL COMMENT '开始盯的时刻 —— 检查窗口的左端，也是超时的起点',
    finished_at DATETIME NULL,
    result_text TEXT NULL COMMENT '成立时那次动作的结果 / 失败原因',
    notify_user_ids VARCHAR(512) NULL COMMENT '结果推给谁（空=建单人）',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_status_next (status, next_check_at),
    INDEX idx_owner (owner_user_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 条件触发器（条件成立才执行，到点不等人）';
