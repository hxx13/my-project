-- AUP 表单字段新增「说明文字」（与 common/schema/V20260815__aup_field_description.sql 同源）。
-- 幂等：重复执行时列已存在即跳过（启动链 isBenignInChain 判定为良性）。
ALTER TABLE form_field ADD COLUMN description TEXT NULL COMMENT '字段说明文字（可空，支持富文本 HTML）' AFTER label;
