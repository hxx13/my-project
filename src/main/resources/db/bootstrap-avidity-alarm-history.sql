-- ============================================================
-- 安维迪报警的**历史流水**（每条报警一次）。
--
-- 与 avidity_alarm_stat 的分工：
--   avidity_alarm_stat    按天聚合（某点位某天报了几次），给「报警仪表盘」那张表用
--   avidity_alarm_history 原始逐条记录，给「点某点位看它的历史」用
--
-- 平台的历史接口 `HistoryAlarm/GetHistoryAlarms` 返回约 1586 条（2026-10 实测），
-- 日期筛选参数是**无效的**（传什么区间都返回同一批），但每条自带 triggeredTime，
-- 所以拉全量存本地、按时间自己分即可。按 alarm_id 幂等 upsert。
--
-- 幂等：CREATE TABLE IF NOT EXISTS。一文件一 DDL。
-- 同源：EmbeddedTwinSystemCoreDdlBootstrap 的 runAllScripts（本文件已在链上注册）。
-- ============================================================
CREATE TABLE IF NOT EXISTS avidity_alarm_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    alarm_id VARCHAR(191) NOT NULL COMMENT '平台报警唯一 ID',
    virtual_device_id BIGINT NOT NULL COMMENT '所属设备 ID',
    device_name VARCHAR(128) NULL COMMENT '设备名',
    alarm_name VARCHAR(128) NULL COMMENT '告警名称（= 平面图上的点位标识）',
    message VARCHAR(255) NULL COMMENT '告警内容',
    state INT NULL COMMENT '平台状态：0 未恢复',
    alarm_level INT NULL COMMENT '告警等级',
    alarm_group_name VARCHAR(128) NULL COMMENT '告警组',
    triggered_time DATETIME NOT NULL COMMENT '触发时刻（北京墙钟）',
    synced_at DATETIME NOT NULL COMMENT '本轮同步时刻',
    UNIQUE KEY uk_avidity_alarm_history (alarm_id),
    INDEX idx_avidity_alarm_history_name (alarm_name, triggered_time),
    INDEX idx_avidity_alarm_history_time (triggered_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='安维迪报警历史流水（逐条）';
