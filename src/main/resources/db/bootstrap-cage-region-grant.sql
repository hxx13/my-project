-- 区域归属：合并 person_scope（可见范围）与 cage_audit_assignment（审核人归属）。
-- grant_role 区分语义：SCOPE=纯补充可见范围 / REVIEWER=审核作用域 / LEADER=饲养组长负责区域 / MEMBER=组长纳入的组员。
-- user_id 统一 = personnel.id（沿用 person_scope 口径；旧 cage_audit_assignment 存的是 sys_user.id，下方迁移时折算）。
-- 幂等：CREATE TABLE IF NOT EXISTS + INSERT IGNORE。
CREATE TABLE IF NOT EXISTS cage_region_grant (
    id              BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    region_type     VARCHAR(16) NOT NULL COMMENT 'CAMPUS | FLOOR | ROOM',
    region_id       VARCHAR(64) NOT NULL COMMENT 'cage_shelf_index 的 campus_id / floor_id / room_id 字符串化',
    user_id         VARCHAR(64) NOT NULL COMMENT '= personnel.id',
    grant_role      VARCHAR(16) NOT NULL COMMENT 'SCOPE | LEADER | MEMBER | REVIEWER',
    leader_user_id  VARCHAR(64) NULL COMMENT '仅 MEMBER 行有值，指向其饲养组长的 personnel.id',
    granted_by      VARCHAR(64) NULL COMMENT '操作人 sys_user.id',
    created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_cage_region_grant (region_type, region_id, user_id, grant_role),
    KEY idx_crg_user (user_id, grant_role),
    KEY idx_crg_region (region_type, region_id),
    KEY idx_crg_leader (leader_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='区域归属（可见范围 / 审核作用域 / 组长-组员）';

-- 迁移 ①：person_scope → SCOPE（user_id 已是 personnel.id，直接搬）
INSERT IGNORE INTO cage_region_grant (region_type, region_id, user_id, grant_role)
SELECT ps.scope_type, ps.scope_id, ps.user_id, 'SCOPE'
FROM person_scope ps;

-- 迁移 ②：cage_audit_assignment → REVIEWER（reviewer_user_id 是 sys_user.id，须折算成 personnel.id）
-- COLLATE 不能省：老表与新表排序规则可能不同，跨拨比较会抛 1267 且常被静默吞掉。
INSERT IGNORE INTO cage_region_grant (region_type, region_id, user_id, grant_role)
SELECT caa.scope_type, caa.scope_id, COALESCE(p1.id, p2.id), 'REVIEWER'
FROM cage_audit_assignment caa
LEFT JOIN personnel p1 ON p1.staff_id   COLLATE utf8mb4_unicode_ci = caa.reviewer_user_id COLLATE utf8mb4_unicode_ci
LEFT JOIN personnel p2 ON p2.aro_user_id COLLATE utf8mb4_unicode_ci = caa.reviewer_user_id COLLATE utf8mb4_unicode_ci
WHERE COALESCE(p1.id, p2.id) IS NOT NULL;
