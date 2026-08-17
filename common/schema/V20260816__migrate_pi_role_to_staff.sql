-- 归档迁移，与 db/bootstrap-migrate-pi-role.sql 同源。
-- 删除 RoleEnum.PI（课题组负责人角色，level=4）后的数据迁移：将历史 role='PI' 用户降为 STAFF。
-- 组长身份改由 person_identity_tag 的 GROUP_LEADER 身份标识判定，不再使用 PI 角色。
-- 幂等：UPDATE 重复执行无副作用（PI 行已不存在则无匹配）。
UPDATE sys_user SET role = 'STAFF' WHERE role = 'PI';
-- 清理推送范围配置中引用 PI 角色的行（避免 valueOf("PI") 抛异常导致推送静默失效）。
UPDATE notify_source_recipient SET scope_value = 'STAFF' WHERE scope_value = 'PI';
