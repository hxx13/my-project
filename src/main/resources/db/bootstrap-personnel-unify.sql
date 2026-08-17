-- ============================================================
-- 统一人员资料库：院校字典 + 课题组字典 + sys_user 加资料字段
-- 由 EmbeddedTwinSystemCoreDdlBootstrap 自动幂等执行
-- 设计：sys_user 是账号源（学生 id=19位学号 / 教职工 id=工号），
--      资料字段（姓名/部门/课题组/院校）从 aro_personnel 同步，账号字段不被覆盖。
-- ============================================================

-- ① 院校字典（学院/机构/医院，可配置，type 区分校内/附属医院/其他科研机构）
CREATE TABLE IF NOT EXISTS institution (
    id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code       VARCHAR(64)  NOT NULL UNIQUE COMMENT '稳定标识（环境变量种子可配）',
    name       VARCHAR(128) NOT NULL COMMENT '院校名称',
    type       VARCHAR(32)  NULL COMMENT '机构类型：INSIDE=校内 / HOSPITAL=附属医院 / OTHER=其他科研机构',
    sort_order INT          NOT NULL DEFAULT 0,
    active     TINYINT      NOT NULL DEFAULT 1,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='院校字典（学院/机构/医院，用户选择所属）';

-- ② 部门字典（即「院校」，从 aro_personnel.department_name 自动聚合，含校内/校外归属）
CREATE TABLE IF NOT EXISTS department (
    id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(128) NOT NULL COMMENT '部门名称（= 院校/学院）',
    is_school  TINYINT      NULL COMMENT '校内/校外（is_school，按该部门多数人聚合）',
    sort_order INT          NOT NULL DEFAULT 0,
    active     TINYINT      NOT NULL DEFAULT 1,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_department_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='部门字典（院校，从 aro_personnel 聚合）';

-- ③ 课题组字典（归部门，层级：部门 → 课题组 → 人员）
CREATE TABLE IF NOT EXISTS project_group (
    id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(128) NOT NULL COMMENT '课题组名称',
    department_id BIGINT       NULL COMMENT '归属部门 department.id',
    sort_order    INT          NOT NULL DEFAULT 0,
    active        TINYINT      NOT NULL DEFAULT 1,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_project_group_name (name),
    KEY idx_pg_department (department_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='课题组字典（归部门）';

-- ③ sys_user 加资料字段（幂等逐列）
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'name');
SET @sql = IF(@col = 0, 'ALTER TABLE sys_user ADD COLUMN name VARCHAR(128) NULL COMMENT ''姓名''', 'SELECT ''name exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'job_number');
SET @sql = IF(@col = 0, 'ALTER TABLE sys_user ADD COLUMN job_number VARCHAR(64) NULL COMMENT ''工号/学号''', 'SELECT ''job_number exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'department_name');
SET @sql = IF(@col = 0, 'ALTER TABLE sys_user ADD COLUMN department_name VARCHAR(128) NULL COMMENT ''部门''', 'SELECT ''department_name exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'project_group_name');
SET @sql = IF(@col = 0, 'ALTER TABLE sys_user ADD COLUMN project_group_name VARCHAR(128) NULL COMMENT ''课题组名称''', 'SELECT ''project_group_name exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'institution_id');
SET @sql = IF(@col = 0, 'ALTER TABLE sys_user ADD COLUMN institution_id BIGINT NULL COMMENT ''归属院校 institution.id''', 'SELECT ''institution_id exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'user_type_names');
SET @sql = IF(@col = 0, 'ALTER TABLE sys_user ADD COLUMN user_type_names VARCHAR(256) NULL COMMENT ''人员类型''', 'SELECT ''user_type_names exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'head');
SET @sql = IF(@col = 0, 'ALTER TABLE sys_user ADD COLUMN head VARCHAR(512) NULL COMMENT ''头像''', 'SELECT ''head exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'gender');
SET @sql = IF(@col = 0, 'ALTER TABLE sys_user ADD COLUMN gender TINYINT NULL COMMENT ''性别''', 'SELECT ''gender exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'mobile_phone');
SET @sql = IF(@col = 0, 'ALTER TABLE sys_user ADD COLUMN mobile_phone VARCHAR(32) NULL COMMENT ''手机号''', 'SELECT ''mobile_phone exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'email');
SET @sql = IF(@col = 0, 'ALTER TABLE sys_user ADD COLUMN email VARCHAR(128) NULL COMMENT ''邮箱''', 'SELECT ''email exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'is_school');
SET @sql = IF(@col = 0, 'ALTER TABLE sys_user ADD COLUMN is_school TINYINT NULL COMMENT ''是否校内 0/1''', 'SELECT ''is_school exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ④ 统一人员表（以姓名为中心，双 id：staff_id 教职工 + student_id 19位学号）
CREATE TABLE IF NOT EXISTS personnel (
    id                BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name              VARCHAR(128) NOT NULL COMMENT '姓名（唯一主键，id 为识别 id）',
    staff_id          VARCHAR(64)  NULL COMMENT '教职工身份 id（sys_user.id，STAFF_ 前缀）',
    aro_user_id       VARCHAR(64)  NULL COMMENT 'ARO 唯一认证 id（aro_personnel.user_id，学生视角索引）',
    job_number        VARCHAR(64)  NULL COMMENT '工号（aro_personnel.job_number）',
    department_name   VARCHAR(128) NULL COMMENT '部门',
    project_group_name VARCHAR(128) NULL COMMENT '课题组名称',
    institution_id    BIGINT       NULL COMMENT '归属院校 institution.id（暂留空，后续按课题组归属自动判定校内/校外）',
    user_type_names   VARCHAR(256) NULL COMMENT '人员类型',
    head              VARCHAR(512) NULL COMMENT '头像',
    gender            TINYINT      NULL COMMENT '性别',
    mobile_phone      VARCHAR(32)  NULL COMMENT '手机号',
    email             VARCHAR(128) NULL COMMENT '邮箱',
    is_school         TINYINT      NULL COMMENT '是否校内 0/1',
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_personnel_name (name),
    KEY idx_personnel_staff (staff_id),
    KEY idx_personnel_aro_user (aro_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='统一人员表（姓名唯一主键 + 双 id 识别）';

-- 幂等补列：已存在的 personnel 表补 job_number
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel' AND COLUMN_NAME = 'job_number');
SET @sql = IF(@col = 0, 'ALTER TABLE personnel ADD COLUMN job_number VARCHAR(64) NULL COMMENT ''工号（aro_personnel.job_number）''', 'SELECT ''job_number exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 幂等补列：已存在的 project_group 表补 department_id（旧表是 institution_id）
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_group' AND COLUMN_NAME = 'department_id');
SET @sql = IF(@col = 0, 'ALTER TABLE project_group ADD COLUMN department_id BIGINT NULL COMMENT ''归属部门 department.id''', 'SELECT ''department_id exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
