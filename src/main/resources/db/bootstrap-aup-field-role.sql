-- AUP 字段新增「字段角色」（对齐 cage/NHP FieldRole），与 common/schema/V20260825002__aup_field_role.sql 同源。
-- 幂等：重复执行时列已存在即跳过（启动链 isBenignInChain 判定为良性）。
-- role：VALUE 可填写 / DERIVED 自动获取只读 / PK 取号只读 / FK 实体只读。
-- 注意：PI/秘书/专家是「身份标识（person_identity_tag）」，不进入字段 role。
ALTER TABLE aup_field_def ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'VALUE' COMMENT '字段角色 VALUE/DERIVED/PK/FK' AFTER type;
ALTER TABLE form_field ADD COLUMN role VARCHAR(16) NULL COMMENT '字段角色快照 VALUE/DERIVED/PK/FK（缺省 VALUE）' AFTER type;
