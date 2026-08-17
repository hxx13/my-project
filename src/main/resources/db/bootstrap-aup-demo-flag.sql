-- AUP 计划书新增「演示示例」标记（与 common/schema/V20260815__aup_demo_flag.sql 同源）。
-- 幂等：重复执行时列已存在即跳过（启动链 isBenignInChain 判定为良性）。
ALTER TABLE aup_record ADD COLUMN is_demo TINYINT NOT NULL DEFAULT 0 COMMENT '演示示例标记 0/1（1=演示，阻止流转，可恢复重置）' AFTER created_by;
