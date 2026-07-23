-- ① 角色列：STUDENT → MEMBER（若上次迁移未执行）
UPDATE sys_user SET role = 'MEMBER' WHERE role = 'STUDENT';
-- ② 新增 account_source 列（已存在则 isBenignDdlSkip 静默跳过）
ALTER TABLE sys_user ADD COLUMN account_source VARCHAR(16) NULL COMMENT '账号来源库: STUDENT | STAFF' AFTER auth_profile;
-- 历史数据回填（仅回填可确定来源的角色）
UPDATE sys_user SET account_source = 'STUDENT' WHERE role = 'MEMBER' AND account_source IS NULL;
UPDATE sys_user SET account_source = 'STAFF' WHERE role = 'STAFF' AND account_source IS NULL;
-- 纠正：有 ARO 人员库记录的必定是学生库
UPDATE sys_user u INNER JOIN aro_personnel a ON u.id = a.user_id SET u.account_source = 'STUDENT' WHERE u.account_source IS NULL OR u.account_source = 'STAFF';
