-- 归档迁移：笼位预定表（与 src/main/resources/db/bootstrap-cage-order-reservation.sql 同源）。
-- 竞态闸门 = active_cage_id 唯一索引；LOCKED 时写入 animal_cage_id，释放/消耗置 NULL。
CREATE TABLE IF NOT EXISTS cage_order_reservation (
    id             BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    animal_cage_id BIGINT       NOT NULL COMMENT '被预定的笼位ID',
    active_cage_id BIGINT       NULL COMMENT '活跃预定闸门：status=LOCKED 时=animal_cage_id，否则 NULL',
    aup_record_id  BIGINT       NULL COMMENT '预定时锁定的 AUP → aup_record.id',
    cart_id        BIGINT       NULL COMMENT '来源购物车行 → ref_cart.id',
    order_id       BIGINT       NULL COMMENT '下单后指向的订单 → ref_order.id',
    spec_key       VARCHAR(255) NULL COMMENT '规格选项标识（模板名: 选项），用于「一笼一规格」判定',
    strain_name    VARCHAR(255) NULL COMMENT '品系名称快照（取订购链 ANIMAL_STRAIN 节点）',
    sex            VARCHAR(32)  NULL COMMENT '性别快照（取规格选项）',
    quantity       INT          NOT NULL DEFAULT 0 COMMENT '预定数量',
    reserver_id    VARCHAR(64)  NULL COMMENT '预定人 accountId',
    reserver_name  VARCHAR(128) NULL COMMENT '预定人姓名快照',
    group_name     VARCHAR(128) NULL COMMENT '预定时的课题组快照',
    status         VARCHAR(16)  NOT NULL DEFAULT 'LOCKED' COMMENT 'LOCKED=预定中 / CONSUMED=已转占用 / RELEASED=已释放',
    release_reason VARCHAR(255) NULL COMMENT '释放原因',
    written_json   TEXT         NULL COMMENT '预定时写进笼位表单的 canonical→值，释放时按此精确撤销',
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_reservation_active (active_cage_id),
    KEY idx_reservation_cage_status (animal_cage_id, status),
    KEY idx_reservation_cart (cart_id),
    KEY idx_reservation_order (order_id),
    KEY idx_reservation_reserver (reserver_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='笼位预定（订购锁定笼位，笼位状态保持type2）';

-- 预定候选池按 (状态, AUP) 查询，补索引避免扫 3.7 万行详情表。
ALTER TABLE cage_cell_detail ADD INDEX idx_cage_detail_type_aup (cage_type_code, aup_id);
