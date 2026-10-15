-- ============================================================
-- 安维迪报警口径的初始两行。
--
-- 带唯一键 + INSERT IGNORE，重启多少次都只有两行（裸 INSERT 会每次堆重复行）。
-- 默认：新报警即推开着、当日累计阈值关着（阈值 5）—— 阈值那条会明显吵，默认不替用户打开。
--
-- 幂等：唯一键 + IGNORE。须排在 bootstrap-avidity-alarm-rule.sql 之后。
-- 同源：EmbeddedTwinSystemCoreDdlBootstrap 的 runAllScripts（本文件已在链上注册）。
-- ============================================================
INSERT IGNORE INTO avidity_alarm_rule (rule_code, rule_name, enabled, threshold_count)
VALUES ('NEW_ALARM', '新报警出现即推', 1, NULL),
       ('DAILY_COUNT', '当日累计超阈值才推', 0, 5);
