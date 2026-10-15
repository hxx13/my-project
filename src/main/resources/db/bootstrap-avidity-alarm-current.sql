-- ============================================================
-- 安维迪「当前报警」。
--
-- 这是未恢复的实时报警（现场 3 条，都是饮水点位的流量报警）。它描述的是「此刻」，
-- 不是流水，所以每轮同步整表替换 —— 报警恢复了就该从这张表里消失。
--
-- 时间统一存北京墙钟（平台给的是 UTC，写入时已换算）。
--
-- 幂等：CREATE TABLE IF NOT EXISTS。一文件一 DDL。
-- 同源：EmbeddedTwinSystemCoreDdlBootstrap 的 runAllScripts（本文件已在链上注册）。
-- ============================================================
CREATE TABLE IF NOT EXISTS avidity_alarm_current (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    alarm_id VARCHAR(191) NOT NULL COMMENT '平台报警唯一 ID',
    virtual_device_id BIGINT NOT NULL COMMENT '所属设备 ID',
    device_name VARCHAR(128) NULL COMMENT '设备名',
    alarm_name VARCHAR(128) NULL COMMENT '告警名称：RM205_A_SLV_13',
    message VARCHAR(255) NULL COMMENT '告警内容',
    state INT NULL COMMENT '平台状态：0 未恢复',
    alarm_level INT NULL COMMENT '告警等级',
    alarm_group_name VARCHAR(128) NULL COMMENT '告警组',
    triggered_time DATETIME NULL COMMENT '触发时刻（北京墙钟）',
    synced_at DATETIME NOT NULL COMMENT '本轮同步时刻',
    UNIQUE KEY uk_avidity_alarm_current (alarm_id),
    INDEX idx_avidity_alarm_current_device (virtual_device_id),
    INDEX idx_avidity_alarm_current_time (triggered_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='安维迪当前未恢复报警（每轮整表替换）';
