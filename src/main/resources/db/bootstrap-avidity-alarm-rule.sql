-- ============================================================
-- 安维迪报警的推送口径配置。
--
-- 用户定的口径是「两种都做、可配」：
--   NEW_ALARM   —— 厂平台「当前报警」里新冒出来一条就推一次（按报警 ID 去重）
--   DAILY_COUNT —— 某个点位当天累计报警次数达到阈值才推（避免零星单次扰民）
-- 两行各自独立开关；DAILY_COUNT 还带一个阈值。
--
-- 幂等：CREATE TABLE IF NOT EXISTS。一文件一 DDL。
-- 同源：EmbeddedTwinSystemCoreDdlBootstrap 的 runAllScripts（本文件已在链上注册）。
-- ============================================================
CREATE TABLE IF NOT EXISTS avidity_alarm_rule (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rule_code VARCHAR(32) NOT NULL COMMENT '口径编码：NEW_ALARM / DAILY_COUNT',
    rule_name VARCHAR(64) NOT NULL COMMENT '口径名称（后台展示用）',
    enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '该口径是否生效',
    threshold_count INT NULL COMMENT '仅 DAILY_COUNT 用：当日累计次数阈值',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_avidity_alarm_rule (rule_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='安维迪报警推送口径配置';
