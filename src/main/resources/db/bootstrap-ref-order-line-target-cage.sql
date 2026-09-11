-- ref_order_line.target_animal_cage_id（本行锁定的笼位ID）
-- ⚠️ 一个文件一条 DDL —— 见 bootstrap-ref-cart-target-cage.sql 的说明。
ALTER TABLE ref_order_line ADD COLUMN target_animal_cage_id BIGINT NULL COMMENT '本行锁定的笼位ID（下单时自购物车快照）';
