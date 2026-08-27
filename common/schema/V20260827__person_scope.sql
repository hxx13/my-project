-- 归档迁移：人员负责范围表（与 src/main/resources/db/bootstrap-person-scope.sql 同源）。
CREATE TABLE IF NOT EXISTS person_scope (
    id         BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id    VARCHAR(64) NOT NULL COMMENT '= personnel.id（与 person_identity.user_id 同口径）',
    scope_type VARCHAR(16) NOT NULL COMMENT 'CAMPUS | FLOOR | ROOM',
    scope_id   VARCHAR(64) NOT NULL COMMENT 'cage_shelf_index 的 campus_id / floor_id / room_id 字符串化',
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_person_scope (user_id, scope_type, scope_id),
    KEY idx_person_scope_user (user_id),
    KEY idx_person_scope_scope (scope_type, scope_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='人员负责范围（校区/楼层/房间，逐人挂载）';
