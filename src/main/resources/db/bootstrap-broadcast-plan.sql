-- ============================================================
-- 广播定时播放方案 —— **我方调度、平台只执行**。
--
-- 为什么不写平台的定时方案：现场平台自带的定时不可靠（播放日志显示连续 8 天零播放，
-- 且只有「当前方案」会执行）。方案存在这里、由我方调度器到点下发播放指令，
-- 平台降级为播放终端，绕开它那套引擎。
--
-- 两个刻意的取舍：
--   zone_macs / song_paths 用 TEXT 存 JSON 数组，不拆子表 —— 一表一案，
--     出参可选字段少，够用；真需要按曲目反查再加。
--   last_fired_date 防同一天重复触发：调度器每轮都跑，靠它判「今天已经放过没」。
--
-- 时间字段一律按**平台时间**解释（平台与本机差好几个小时，见 DsppaClient.platformNow）。
--
-- 幂等：CREATE TABLE IF NOT EXISTS。
-- 同源：EmbeddedTwinSystemCoreDdlBootstrap 的 runAllScripts（本文件已在链上注册）。
-- ============================================================
CREATE TABLE IF NOT EXISTS broadcast_plan (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    plan_name VARCHAR(128) NOT NULL COMMENT '方案名称（人看）',
    enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用：0 停用 / 1 启用',
    time_mode TINYINT NOT NULL DEFAULT 0 COMMENT '定时方式：0 按周循环 / 1 按日期区间',
    week_days VARCHAR(16) NULL COMMENT '按周：选中星期，1=周一…7=周日，如 "135"；按日期时忽略',
    start_date VARCHAR(10) NULL COMMENT '按日期：开始日期 yyyy-MM-dd',
    end_date VARCHAR(10) NULL COMMENT '按日期：结束日期 yyyy-MM-dd',
    start_time VARCHAR(8) NOT NULL COMMENT '每日开始时刻 HH:mm:ss（平台时间）',
    end_time VARCHAR(8) NOT NULL COMMENT '每日结束时刻 HH:mm:ss（平台时间）',
    volume INT NULL COMMENT '开播前设定的音量 0-100；为空则不动音量',
    zone_macs TEXT NULL COMMENT '目标分区 MAC 数组（JSON），如 ["00:67:75:00:96:88"]',
    song_paths MEDIUMTEXT NULL COMMENT '曲目路径数组（JSON），平台上的绝对路径',
    song_list_id VARCHAR(64) NULL COMMENT '曲目所属曲库列表编号',
    last_fired_date VARCHAR(10) NULL COMMENT '上次触发日期 yyyy-MM-dd —— 防同一天重复触发',
    last_fired_at DATETIME NULL COMMENT '上次触发时刻',
    last_stop_date VARCHAR(10) NULL COMMENT '上次收播日期 yyyy-MM-dd —— 窗口结束只收一次播',
    last_result VARCHAR(500) NULL COMMENT '上次触发结果（成功 / 失败原因）',
    created_by VARCHAR(64) NULL COMMENT '建单人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_enabled (enabled, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='广播定时播放方案（我方调度，平台只执行）';
