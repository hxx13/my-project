-- 区域级学生能力：某个区域的**饲养组长**决定「本区域的学生能用哪些功能」。
-- 粒度与区域分配一致（超管把区域分到哪一级，组长就在哪一级配）。
-- 与 cage_permission_grant（身份矩阵）的关系：**矩阵是上限**，区域配置只能勾矩阵允许的那些；
-- 组员级 cage_member_capability 仍是「逐人覆盖」，与区域配置分属两条路（人 vs 地）。
-- 幂等：CREATE TABLE IF NOT EXISTS。
CREATE TABLE IF NOT EXISTS cage_region_capability (
    id              BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    region_type     VARCHAR(16) NOT NULL COMMENT 'CAMPUS | FLOOR | ROOM',
    region_id       VARCHAR(64) NOT NULL,
    capability_code VARCHAR(64) NOT NULL COMMENT '引用 cage_permission_capability.code（学生侧）',
    configured_by   VARCHAR(64) NULL COMMENT '配置人 sys_user.id（该区域的组长或超管）',
    created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_cage_region_capability (region_type, region_id, capability_code),
    KEY idx_crc_region (region_type, region_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='区域级学生能力（该区域组长配置）';

-- 学生侧模式注册为能力（列为 STUDENT 组）。key 与前端模式 key 一致，映射保持一一对应。
-- 「归档」也是其中之一：学生能用它**归档本人的笼位**（写入门禁另有「只能归档本人占用」一道，
-- 见 CageLocalController#archive）；个人这条腿与「合笼（学生）」那套同款。
INSERT IGNORE INTO cage_permission_capability (code, label, view_group, sort_order) VALUES
('cage.student.mode.studentClaim', '申请预约（学生）', 'STUDENT', 210),
('cage.student.mode.division',     '划分（学生）',     'STUDENT', 220),
('cage.student.mode.confirm',      '确认（学生）',     'STUDENT', 230),
('cage.student.mode.archive',      '归档（学生）',     'STUDENT', 240);

-- 矩阵上限：默认给全部学生视角身份（与「学生侧本来就能用这几个模式」等价）。
INSERT IGNORE INTO cage_permission_grant (capability_code, identity_code) VALUES
('cage.student.mode.studentClaim', 'LAB_MEMBER'), ('cage.student.mode.studentClaim', 'PI'),
('cage.student.mode.studentClaim', 'GROUP_LEADER'), ('cage.student.mode.studentClaim', 'GROUP_STEWARD'),
('cage.student.mode.division',     'LAB_MEMBER'), ('cage.student.mode.division', 'PI'),
('cage.student.mode.division',     'GROUP_LEADER'), ('cage.student.mode.division', 'GROUP_STEWARD'),
('cage.student.mode.confirm',      'LAB_MEMBER'), ('cage.student.mode.confirm', 'PI'),
('cage.student.mode.confirm',      'GROUP_LEADER'), ('cage.student.mode.confirm', 'GROUP_STEWARD'),
('cage.student.mode.archive',      'LAB_MEMBER'), ('cage.student.mode.archive', 'PI'),
('cage.student.mode.archive',      'GROUP_LEADER'), ('cage.student.mode.archive', 'GROUP_STEWARD');
