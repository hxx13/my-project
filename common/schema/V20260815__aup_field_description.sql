-- AUP 表单字段新增「说明文字」（每题可选的说明；可含富文本 HTML，NULL=无）。
-- 幂等：重复执行时列已存在即跳过（启动链 isBenignInChain 判定为良性）。
ALTER TABLE form_field ADD COLUMN description TEXT NULL COMMENT '字段说明文字（可空，支持富文本 HTML）' AFTER label;
