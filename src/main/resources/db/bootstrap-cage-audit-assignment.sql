-- 笼位申请审核人归属：审核人 → 楼层/房间，用于审批分发与角标按审核人过滤。
-- reviewer_user_id = 审核人 sys_user.id；scope_id 存字符串化的 cage_shelf_index 楼层/房间/校区 id。
-- 幂等：CREATE TABLE IF NOT EXISTS。
CREATE TABLE IF NOT EXISTS cage_audit_assignment (
    id                BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    reviewer_user_id  VARCHAR(64) NOT NULL COMMENT '审核人 sys_user.id',
    scope_type        VARCHAR(16) NOT NULL COMMENT 'FLOOR | ROOM | CAMPUS',
    scope_id          VARCHAR(64) NOT NULL COMMENT 'cage_shelf_index 的 floor_id / room_id / campus_id 字符串化',
    created_at        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_cage_audit_assignment (reviewer_user_id, scope_type, scope_id),
    KEY idx_cage_audit_reviewer (reviewer_user_id),
    KEY idx_cage_audit_scope (scope_type, scope_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='笼位申请审核人归属（审核人→楼层/房间）';
