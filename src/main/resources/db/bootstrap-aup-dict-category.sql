-- AUP 公共字典新增「分类」列（与 common/schema/V20260814002__aup_dict_category.sql 同源）。
-- 幂等：重复执行时列已存在即跳过（启动链 isBenignInChain 判定为良性）。
ALTER TABLE dict ADD COLUMN category VARCHAR(64) NULL COMMENT '字典分类（分组用，NULL=未分类）' AFTER name;
