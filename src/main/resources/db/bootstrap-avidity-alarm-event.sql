-- ============================================================
-- 安维迪报警的「我们自己记的」报警历史 —— 每个点位一条「开始时间 / 结束时间」。
--
-- 和 avidity_alarm_history 的区别（两张表名字像，用途完全不同）：
--   avidity_alarm_history  厂平台那份历史流水，拉回来只是留档，字段是他们给的
--   avidity_alarm_event    **我们自己按实时状态记的**，起止时间是我们看着灯翻红/翻绿记的，
--                          并且带上了点位在地图上的分区（前室号 / 内间名 / 点位号），
--                          好让界面按房间归成文件夹
--
-- 一次报警 = 一行。判据是「厂平台给的变化时刻」：同一个变化时刻就是同一次报警，
-- 所以重连后平台把当前值重推一遍也不会多出记录（唯一键挡掉）。
-- 灯还在红着的那些行 ended_at 为空 —— 就是「此刻正在报警」。
--
-- 幂等：CREATE TABLE IF NOT EXISTS。一文件一 DDL。
-- 同源：EmbeddedTwinSystemCoreDdlBootstrap 的 runAllScripts（本文件已在链上注册）。
-- ============================================================
CREATE TABLE IF NOT EXISTS avidity_alarm_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    virtual_device_id BIGINT NOT NULL COMMENT '设备 ID',
    alarm_name VARCHAR(128) NOT NULL COMMENT '点位标识（画面图元绑定的变量名）',
    room VARCHAR(64) NULL COMMENT '分区 / 前室号（201、E11A）',
    rack VARCHAR(64) NULL COMMENT '内间名（201-A、E11A-B106）',
    point_no INT NULL COMMENT '点位号（同一条内间内唯一）',
    started_at DATETIME NOT NULL COMMENT '报警开始（北京墙钟）',
    ended_at DATETIME NULL COMMENT '恢复时刻；为空＝此刻还在报',
    last_seen_at DATETIME NOT NULL COMMENT '最后一次收到「仍在报」的时刻',
    created_at DATETIME NOT NULL,
    UNIQUE KEY uk_avidity_alarm_event (virtual_device_id, alarm_name, started_at),
    INDEX idx_avidity_alarm_event_started (started_at),
    INDEX idx_avidity_alarm_event_open (virtual_device_id, alarm_name, ended_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='安维迪报警事件（自己记的，含起止时间与地图分区）';
