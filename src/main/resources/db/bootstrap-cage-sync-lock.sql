-- 笼位同步保护锁：同步（一键同步/同步本房间）时跳过被锁节点的写入，避免人工修正内容被 ARO 数据覆盖。
-- 四层粒度 FLOOR/ROOM/SHELF/CELL，scope_key 存对应 ID 的字符串形式。
-- locked 三态：无该行=继承上级；1=锁定跳过；0=显式解锁（白名单，上级锁了这层也同步）。
-- 幂等：CREATE TABLE IF NOT EXISTS。
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
