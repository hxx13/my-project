-- V20260822002：crf_template_field 加 role / role_meta（PK 取号规则、FK 实体、DERIVED 来源）
-- 呈现层字段角色与 type 正交；role_meta 存 JSON：{ pkRule, entityType, derivedSource }

ALTER TABLE crf_template_field
    ADD COLUMN IF NOT EXISTS role VARCHAR(16) NULL COMMENT 'PK/FK/VALUE/DERIVED（缺省 VALUE）' AFTER dict_key;

ALTER TABLE crf_template_field
    ADD COLUMN IF NOT EXISTS role_meta TEXT NULL COMMENT 'role 专属元数据 JSON：pkRule/entityType/derivedSource' AFTER role;
