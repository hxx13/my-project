-- 可见范围口径收窄到 SUPER_ADMIN 后，account_source=STUDENT 且 role=ADMIN 的双视角账号
-- 会从「看全院」掉回「只看本课题组」。这些账号本是按高权限在使用学生视角，故一并提升，
-- 避免「最高权限突然看不到东西」。
-- 幂等：只对 role='ADMIN' 的行生效，重复执行无副作用。

UPDATE sys_user
SET role = 'SUPER_ADMIN'
WHERE account_source = 'STUDENT' AND role = 'ADMIN';
