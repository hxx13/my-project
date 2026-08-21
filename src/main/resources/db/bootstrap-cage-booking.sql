-- ============================================================
-- 笼位预约（booking）本地化表 — 数据源 ARO room/rent 系列接口
-- 读优先本地、同步手动触发（/booking/sync），不再异步投递 ARO
-- 幂等：CREATE TABLE IF NOT EXISTS
-- ============================================================

-- ① 房间预约汇总（源 ARO GET /admin/room/rent/list 的 data.list）
CREATE TABLE IF NOT EXISTS cage_booking_room (
    id                      BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    room_id                 VARCHAR(64)  NOT NULL COMMENT 'ARO 房间ID（字符串，防精度丢失）',
    name                    VARCHAR(256) NULL COMMENT '房间名称',
    description             VARCHAR(512) NULL,
    shelve_number           INT          NULL COMMENT '笼架数量',
    animal_cage_number      INT          NULL COMMENT '笼位总数',
    rent_animal_cage_number INT          NULL COMMENT '已预约笼位数',
    used_animal_cage_number INT          NULL COMMENT '已使用笼位数',
    last_rent_number        INT          NULL COMMENT '最近预约数',
    memo                    VARCHAR(512) NULL,
    synced_at               DATETIME     NULL COMMENT '最后同步时间',
    created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_booking_room_room_id (room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='笼位预约·房间预约汇总（本地化，源 ARO room/rent/list）';

-- ② 房间内 AUP 分配明细（源 ARO GET /admin/room/rent/prepare/aups 的 data）
CREATE TABLE IF NOT EXISTS cage_booking_room_aup (
    id                      BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    aro_id                  VARCHAR(64)  NOT NULL COMMENT 'ARO 分配记录 id（唯一，upsert 键）',
    room_id                 VARCHAR(64)  NULL COMMENT '所属房间',
    name                    VARCHAR(256) NULL,
    pi_name                 VARCHAR(128) NULL COMMENT '课题组长',
    register_number         VARCHAR(128) NULL COMMENT 'AUP 编号',
    aup_id                  VARCHAR(64)  NULL COMMENT 'AUP id',
    rent_number             INT          NULL COMMENT '预约数量',
    used_animal_cage_number INT          NULL COMMENT '已使用数量',
    memo                    VARCHAR(512) NULL,
    begin_time              VARCHAR(64)  NULL,
    end_time                VARCHAR(64)  NULL,
    deleted                 TINYINT      NOT NULL DEFAULT 0 COMMENT '本地软删：1=已删除（同步不复活）',
    synced_at               DATETIME     NULL COMMENT '最后同步时间',
    created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_booking_aup_aro_id (aro_id),
    KEY idx_booking_aup_room (room_id),
    KEY idx_booking_aup_register (register_number),
    KEY idx_booking_aup_pi (pi_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='笼位预约·房间AUP分配明细（本地化，源 ARO room/rent/prepare/aups）';

-- ③ AUP 字典不再建独立表，由 aup_record（计划书主表）的 approved 记录承接。
