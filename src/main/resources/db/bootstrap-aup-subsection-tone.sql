-- AUP 表单小章节新增「说明文字高亮变体」（与 common/schema/V20260817__aup_subsection_tone.sql 同源）。
-- 幂等：重复执行时列已存在即跳过（启动链 isBenignInChain 判定为良性）。
ALTER TABLE form_subsection ADD COLUMN description_tone VARCHAR(16) NULL COMMENT '小节说明高亮变体 info/warn/danger/muted' AFTER description;
