-- ============================================================
-- 电视墙「参观模式」的预设播放队列。
--
-- 现场要的是：把几个预设按自己排的顺序连成一条线，讲解时点「下一个」按顺序切，
-- 不用每次都去下拉里找。顺序由人排，所以必须落库（各端同一份，不是本机偏好）。
--
-- 与预设本身的关系：预设活在 ICC 平台上（task_id 是平台 id），这里只存「这面墙的队列」，
-- 所以预设被平台删掉后本表可能留孤儿行，读取时按平台返回的预设清单过滤即可。
--
-- 幂等：CREATE TABLE IF NOT EXISTS。
-- 同源：EmbeddedTwinSystemCoreDdlBootstrap 的 runAllScripts（本文件已在链上注册）。
-- ============================================================
CREATE TABLE IF NOT EXISTS dahua_tvwall_tour (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT 'ID',
    tv_wall_id VARCHAR(64) NOT NULL COMMENT '电视墙ID',
    task_id VARCHAR(64) NOT NULL COMMENT '预设（上墙任务）ID',
    sort_order INT NOT NULL DEFAULT 0 COMMENT '参观顺序，越小越靠前',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_dtt_wall_task (tv_wall_id, task_id),
    INDEX idx_dtt_wall (tv_wall_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='电视墙参观模式：预设播放队列';
