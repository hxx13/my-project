-- AUP 计划书新增「演示示例」标记（与 src/main/resources/db/bootstrap-aup-demo-flag.sql 同源）。
-- is_demo=1 的记录：列表展示「演示示例」徽标、可「恢复示例」重置；后端阻止其状态流转（transition）。
-- 幂等：重复执行时列已存在即跳过（启动链 isBenignInChain 判定为良性）。
ALTER TABLE aup_record ADD COLUMN is_demo TINYINT NOT NULL DEFAULT 0 COMMENT '演示示例标记 0/1（1=演示，阻止流转，可恢复重置）' AFTER created_by;
