-- 人员负责范围：给教职工按「校区/楼层/房间」挂载可见笼架范围。
-- user_id 与 person_identity.user_id 同口径 = personnel.id（PersonIdentityService.resolveIdByAccount 解析后的纯数字 id）。
-- scope_id 存字符串化的 cage_shelf_index 主键 id（campus_id INT / floor_id BIGINT / room_id BIGINT 统一转 VARCHAR 存）。
-- 幂等：CREATE TABLE IF NOT EXISTS，重复执行无副作用。
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
