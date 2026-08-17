-- AUP 逐字段评审意见新增「评审角色」（与 common/schema/V20260815__aup_review_item_role.sql 同源）。
-- 幂等：重复执行时列已存在即跳过（启动链 isBenignInChain 判定为良性）。
ALTER TABLE aup_review_item ADD COLUMN reviewer_role VARCHAR(16) NULL COMMENT '评审角色 secretary/expert（格式=秘书 / 内容=专家）' AFTER reviewer;
