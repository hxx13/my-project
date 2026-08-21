-- ============================================================
-- personnel 加 role 列（人级唯一权威角色，存 RoleEnum.code）
-- 由 EmbeddedTwinSystemCoreDdlBootstrap 自动幂等执行
-- 语义：personnel.role 是「人」的唯一角色权威值，不分视角、不取最高。
-- ============================================================

-- ① 幂等补列 role
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel' AND COLUMN_NAME = 'role');
SET @sql = IF(@col = 0, 'ALTER TABLE personnel ADD COLUMN role VARCHAR(64) NULL COMMENT ''统一角色（RoleEnum.code，人级唯一权威，不分视角）''', 'SELECT ''role exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ② 回填 role（幂等，只填空值）：教职工取 sys_user.staff_id 侧 role，纯学生取 sys_user.aro_user_id 侧 role（MEMBER）
UPDATE personnel p
LEFT JOIN sys_user su_staff ON su_staff.id = p.staff_id
LEFT JOIN sys_user su_student ON su_student.id = p.aro_user_id
SET p.role = COALESCE(su_staff.role, su_student.role)
WHERE p.role IS NULL
  AND (su_staff.role IS NOT NULL OR su_student.role IS NOT NULL);
