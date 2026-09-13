-- 笼架身份权限矩阵：能力注册表 + 授权矩阵。
-- 取代此前的 cage_mode 配置模块（key=cage.mode.{mode}，值=逗号分隔身份 code）。
-- 幂等：CREATE TABLE IF NOT EXISTS + INSERT IGNORE。
CREATE TABLE IF NOT EXISTS cage_permission_capability (
    id               BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code             VARCHAR(64)  NOT NULL COMMENT '能力码，如 cage.mode.allocate',
    label            VARCHAR(64)  NOT NULL COMMENT '中文名',
    view_group       VARCHAR(16)  NOT NULL DEFAULT 'STAFF' COMMENT 'STAFF | STUDENT（仅用于矩阵行分组展示，不参与判定）',
    leader_exclusive TINYINT      NOT NULL DEFAULT 0 COMMENT '1=饲养组长专属，不参与组员继承（第四期启用）',
    sort_order       INT          NOT NULL DEFAULT 0,
    active           TINYINT      NOT NULL DEFAULT 1,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_cage_capability_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='笼架能力注册表（只靠种子 SQL 注册）';

CREATE TABLE IF NOT EXISTS cage_permission_grant (
    id              BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    capability_code VARCHAR(64) NOT NULL COMMENT 'FK→cage_permission_capability.code',
    identity_code   VARCHAR(64) NOT NULL COMMENT 'FK→person_identity_tag.code',
    created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_cage_permission_grant (capability_code, identity_code),
    KEY idx_cage_grant_identity (identity_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='笼架权限矩阵（身份×能力，勾选=授予）';

INSERT IGNORE INTO cage_permission_capability (code, label, view_group, sort_order) VALUES
('cage.mode.booking',              '预约',        'STAFF', 10),
('cage.mode.allocate',             '分配',        'STAFF', 20),
('cage.mode.reserve',              '预定',        'STAFF', 30),
('cage.mode.edit',                 '状态',        'STAFF', 40),
('cage.mode.record',               '记录',        'STAFF', 50),
('cage.mode.archive',              '归档',        'STAFF', 60),
('cage.mode.confirm',              '确认',        'STAFF', 70),
('cage.mode.division',             '划分',        'STAFF', 80),
('cage.op.manage_identities',      '分笼/转移操作', 'STAFF', 90);

-- 迁移核心：把 cage_mode 模块每个键的 config_value（逗号分隔身份 code）拆成矩阵行。
-- 必须读 sys_system_config.config_value（运行值）而不是 sys_system_config_def.default_value：
--   cage.mode.confirm 运行值含 LAB_MEMBER 而默认值没有；
--   cage.op.manage_identities 默认值还带着已退役的 OWNER。
--
-- 段号上限靠「逗号数 + 1」来卡：MySQL 的 SUBSTRING_INDEX(str, ',', n) 在 n 超过实际段数时
-- 会原样返回整个字符串，导致最后一段被重复取出（booking 只有 1 段，不加这个条件会拆出 8 行）。
INSERT IGNORE INTO cage_permission_grant (capability_code, identity_code)
SELECT c.code,
       TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(s.config_value, ',', n.i), ',', -1)) AS identity_code
FROM sys_system_config s
JOIN cage_permission_capability c ON c.code = s.config_key
JOIN (SELECT 1 AS i UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
      UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8) n
  ON n.i <= 1 + LENGTH(s.config_value) - LENGTH(REPLACE(s.config_value, ',', ''))
WHERE s.module = 'cage_mode'
  AND s.config_key LIKE 'cage.%'
  AND TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(s.config_value, ',', n.i), ',', -1)) <> '';

-- 基线播种：**仅当矩阵完全为空**时执行。
-- 为什么需要它：上面那条迁移依赖 cage_mode 配置存在，而配置在下方被退役了。
-- 全新环境（空库启动）没有配置可迁 → 矩阵为空 → fail-closed 会把所有模式锁死。
--
-- 守卫必须用「派生表」包一层再 NOT EXISTS：MySQL 不允许 INSERT...SELECT 直接引用目标表，
-- 套一层派生表即可materialize。已实测三种场景：空表播种 / 非空跳过 / 部分清空后**不会把
-- 管理员删掉的授权复活**（所以不能用「配置不存在就播种」那种守卫）。
INSERT IGNORE INTO cage_permission_grant (capability_code, identity_code)
SELECT t.c, t.i FROM (
    SELECT 'cage.mode.booking'         AS c, 'SECRETARY'              AS i UNION ALL
    SELECT 'cage.mode.allocate',              'BREEDING_GROUP_LEADER'          UNION ALL
    SELECT 'cage.mode.reserve',               'BREEDING_GROUP_LEADER'          UNION ALL
    SELECT 'cage.mode.edit',                  'BREEDER'                        UNION ALL
    SELECT 'cage.mode.edit',                  'BREEDING_GROUP_LEADER'          UNION ALL
    SELECT 'cage.mode.record',                'BREEDER'                        UNION ALL
    SELECT 'cage.mode.record',                'BREEDING_GROUP_LEADER'          UNION ALL
    SELECT 'cage.mode.archive',               'BREEDER'                        UNION ALL
    SELECT 'cage.mode.archive',               'BREEDING_GROUP_LEADER'          UNION ALL
    SELECT 'cage.mode.confirm',               'BREEDER'                        UNION ALL
    SELECT 'cage.mode.confirm',               'BREEDING_GROUP_LEADER'          UNION ALL
    SELECT 'cage.mode.confirm',               'LAB_MEMBER'                     UNION ALL
    SELECT 'cage.mode.division',              'GROUP_STEWARD'                  UNION ALL
    SELECT 'cage.op.manage_identities',       'BREEDER'                        UNION ALL
    SELECT 'cage.op.manage_identities',       'BREEDING_GROUP_LEADER'
) t
WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM cage_permission_grant LIMIT 1) AS probe);

-- 退役 cage_mode 配置：定义与运行值都删掉。
-- 不删的话设置面板的 schema 驱动渲染会继续显示一组「改了没有任何效果」的死开关
-- （CageClaimConfigSeed 里记的同一个教训）。必须放在迁移与基线播种**之后**。
DELETE FROM sys_system_config_def WHERE module = 'cage_mode';
DELETE FROM sys_system_config     WHERE module = 'cage_mode';

-- 学生侧状态动作：学生视角的「状态模式」下可修改的动作，按**动作码**注册为能力。
-- 取代 CageModeVisibilityService 里写死的 STUDENT_EDIT_ACTIONS 放行逻辑——那张 map 只保留
-- 「动作码 → 表单 canonical」的命名关系，**放行与否读这里的授权**，与其他能力同一套机制。
INSERT IGNORE INTO cage_permission_capability (code, label, view_group, sort_order) VALUES
('cage.student.edit.cohabitation', '合笼（学生）', 'STUDENT', 200);

-- 默认授权给全部学生视角身份，与迁移前「任何学生都能标记合笼」等价。
-- 依据：实测 2501 个可折算的学生中 2497 个是纯 LAB_MEMBER，另有 PI / GROUP_LEADER / GROUP_STEWARD。
-- 注意：折算不到 personnel 的账号（本地 112 个，无姓名、用户名为雪花 id 的同步残留）身份集为空，
-- fail-closed 下会失去合笼——这是有意为之，不是遗漏。
INSERT IGNORE INTO cage_permission_grant (capability_code, identity_code) VALUES
('cage.student.edit.cohabitation', 'LAB_MEMBER'),
('cage.student.edit.cohabitation', 'PI'),
('cage.student.edit.cohabitation', 'GROUP_LEADER'),
('cage.student.edit.cohabitation', 'GROUP_STEWARD');

-- 编辑笼位表单：谁能改 cage_info_value 的表单值。
-- 取代 CageOperationService.cageEditInfo 里写死的「role>=ADMIN 或 isOpExtraOperator」。
-- 用户 2026-09-13 定：编辑权 = 饲养组长（限其所属区域）+ 学生限本人；
-- **ADMIN 不再自动拥有全量编辑**（角色不进矩阵，SUPER_ADMIN+ 仍由逃生口放行）。
-- 「限饲养组长所属区域」那半需要 cage_region_grant 的 LEADER 行，属第四期，此处只落「能力」这半。
INSERT IGNORE INTO cage_permission_capability (code, label, view_group, sort_order) VALUES
('cage.edit.form', '编辑笼位表单', 'STAFF', 100);

-- 默认授权沿用迁移前实际能编辑的身份集合（原 isOpExtraOperator = cage.op.manage_identities，默认 BREEDER,BGL）。
INSERT IGNORE INTO cage_permission_grant (capability_code, identity_code) VALUES
('cage.edit.form', 'BREEDER'),
('cage.edit.form', 'BREEDING_GROUP_LEADER');
