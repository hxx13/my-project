-- AUP 逐字段评审意见新增「评审角色」（与 src/main/resources/db/bootstrap-aup-review-item-role.sql 同源）。
-- reviewer_role：secretary=格式审查（格式错误）/ expert=专家审查（内容错误），供前端区分批注来源与逐人聚合。
-- 幂等：重复执行时列已存在即跳过（启动链 isBenignInChain 判定为良性）。
ALTER TABLE aup_review_item ADD COLUMN reviewer_role VARCHAR(16) NULL COMMENT '评审角色 secretary/expert（格式=秘书 / 内容=专家）' AFTER reviewer;
