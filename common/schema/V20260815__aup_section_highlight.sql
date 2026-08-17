-- AUP 表单大段新增「突出显示」开关（0 号前置说明等板块可用作强调卡片，后台可配置）。
-- 幂等：重复执行时列已存在即跳过（启动链 isBenignInChain 判定为良性）。
ALTER TABLE form_section ADD COLUMN highlight TINYINT NOT NULL DEFAULT 0 COMMENT '是否突出显示 0/1（前置说明等）' AFTER show_when;
