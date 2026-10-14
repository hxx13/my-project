-- ============================================================
-- 广播播放记录 —— **这张表是接管定时的价值点**。
--
-- 现场「时好时坏」时，靠它一眼看出到底是哪次没响、为什么没响：
-- 平台的日志只能事后翻它的服务器文件，而且分不清是「没触发」还是「触发了下发失败」。
--
-- 记录两种来源：定时调度（SCHEDULE / 补播 CATCHUP）与人工手动（MANUAL）。
-- plan_name 存快照 —— 方案被删掉之后记录仍然可读。
--
-- 幂等：CREATE TABLE IF NOT EXISTS。
-- 同源：EmbeddedTwinSystemCoreDdlBootstrap 的 runAllScripts（本文件已在链上注册）。
-- ============================================================
CREATE TABLE IF NOT EXISTS broadcast_play_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    plan_id BIGINT NULL COMMENT '来源方案 ID；手动播放为空',
    plan_name VARCHAR(128) NULL COMMENT '方案名快照（方案删了记录仍可读）',
    source VARCHAR(16) NOT NULL COMMENT '触发来源：SCHEDULE 定时 / CATCHUP 补播 / MANUAL 手动',
    action VARCHAR(16) NOT NULL COMMENT '动作：PLAY / STOP',
    fired_at DATETIME NOT NULL COMMENT '触发时刻（平台时间）',
    zone_macs TEXT NULL COMMENT '本次目标分区 MAC 数组（JSON）',
    song_paths MEDIUMTEXT NULL COMMENT '本次曲目（JSON 数组）',
    success TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否成功',
    message VARCHAR(500) NULL COMMENT '结果说明 / 失败原因',
    operator VARCHAR(64) NULL COMMENT '手动触发时的操作人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_fired (fired_at),
    INDEX idx_plan (plan_id, fired_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='广播播放记录（「今天到底响没响」看这里）';
