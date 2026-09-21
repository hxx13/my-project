-- 人员身份键改造：姓名降级，账号 id 升为唯一键
-- 前置：空字符串账号 id 必须先规范成 NULL，否则下面两条 UNIQUE 会因「多个 ''」失败
UPDATE personnel SET aro_user_id = NULLIF(aro_user_id, ''), staff_id = NULLIF(staff_id, '') WHERE aro_user_id = '' OR staff_id = '';
ALTER TABLE personnel DROP INDEX uk_personnel_name;
ALTER TABLE personnel ADD UNIQUE KEY uk_personnel_aro_user_id (aro_user_id);
ALTER TABLE personnel ADD UNIQUE KEY uk_personnel_staff_id (staff_id);
ALTER TABLE personnel ADD INDEX idx_personnel_name (name);
