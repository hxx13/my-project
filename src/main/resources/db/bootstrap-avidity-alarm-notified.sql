-- ============================================================
-- 安维迪报警的「已推送」台账 —— 既是去重依据，也是事后可查的推送留痕。
--
-- 两个口径共用一张表，靠 notify_key 前缀区分：
--   NEW:<报警ID>                            新报警那条，报警 ID 由厂平台给，天然唯一
--   COUNT:<统计日>:<设备ID>:<告警名称>        当日累计那条，同一天同一口径只推一次
--
-- 报警恢复后再犯，厂平台给的报警 ID 是新的，所以会重新推 —— 这正是想要的。
-- 体量：按天新增最多「新报警条数 + 点位条数」（2F 满配约 150），一年十万级，可接受。
--
-- 幂等：CREATE TABLE IF NOT EXISTS。一文件一 DDL。
-- 同源：EmbeddedTwinSystemCoreDdlBootstrap 的 runAllScripts（本文件已在链上注册）。
-- ============================================================
CREATE TABLE IF NOT EXISTS avidity_alarm_notified (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    notify_key VARCHAR(191) NOT NULL COMMENT '去重键：NEW:<报警ID> 或 COUNT:<日>:<设备ID>:<告警名>',
    rule_code VARCHAR(32) NOT NULL COMMENT '来源口径：NEW_ALARM / DAILY_COUNT',
    device_name VARCHAR(128) NULL COMMENT '设备名快照',
    alarm_name VARCHAR(128) NULL COMMENT '告警名称快照',
    message VARCHAR(500) NULL COMMENT '推送正文摘要',
    notified_at DATETIME NOT NULL COMMENT '推送时刻',
    UNIQUE KEY uk_avidity_alarm_notified (notify_key),
    INDEX idx_avidity_alarm_notified_at (notified_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='安维迪报警已推送台账（去重 + 留痕）';
