-- 笼位预定（动物订购 → 笼位）：加购时把订单行锁定到一个 type2（已预约空笼盒）笼位上。
-- 这是「预定态」的持久化：笼位本身保持 type2 不变，预定记录才表达「已被谁、被哪张订单占住」，
-- 因此不涉及笼位状态回滚；动物到货后把 status 置 CONSUMED、笼位 2→3。
--
-- 竞态闸门 = active_cage_id 上的唯一索引：
--   LOCKED 时写入 animal_cage_id，释放/消耗时置 NULL。MySQL 唯一索引允许任意多个 NULL，
--   于是「同一笼位只能有一条活跃预定」由数据库保证，两个人同时点同一个笼位必然有一个拿到
--   重复键异常 → 前端提示换笼位。不要用「先查再插」代替，那正是竞态本身。
--
-- 幂等：CREATE TABLE IF NOT EXISTS。
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

-- 预定候选池每次开抽屉都要按 (状态, AUP) 捞一遍 3.7 万行详情表，补个索引别扫全表。
-- 重复执行会报「索引已存在」，由启动链 isBenignInChain 吞掉。
ALTER TABLE cage_cell_detail ADD INDEX idx_cage_detail_type_aup (cage_type_code, aup_id);
