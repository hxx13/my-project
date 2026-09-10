-- 归档迁移：笼位同步保护锁表（与 src/main/resources/db/bootstrap-cage-sync-lock.sql 同源）。
CREATE TABLE IF NOT EXISTS cage_sync_lock (
    id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    scope_type    VARCHAR(16)  NOT NULL COMMENT 'FLOOR | ROOM | SHELF | CELL',
    scope_key     VARCHAR(64)  NOT NULL COMMENT 'floor_id / room_id / shelve_id / animal_cage_id 字符串化',
    locked        TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '1=锁定跳过同步 0=显式解锁(白名单)',
    reason        VARCHAR(255) NULL COMMENT '加锁原因',
    operator_id   VARCHAR(64)  NULL COMMENT '操作人 sys_user.id',
    operator_name VARCHAR(128) NULL COMMENT '操作人姓名快照',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_cage_sync_lock (scope_type, scope_key),
    KEY idx_cage_sync_lock_scope (scope_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='笼位同步保护锁（楼层/房间/笼架/笼位）';
