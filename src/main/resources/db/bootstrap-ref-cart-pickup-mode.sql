-- ref_cart.pickup_mode（领用方式：FARM 饲养 / TAKE 取走）
-- 「取走」不占笼位也不选房间，于是它的 pickup_room_id 与 target_animal_cage_id 都是 NULL ——
-- 加这一列之前，审核页/导出/订单记录只能显示空白，且与「历史单房间快照丢了」同形，区分不了。
-- 默认 FARM：存量行都是老的饲养流程，不加列之前的语义就是 FARM。
-- ⚠️ 一个文件一条 DDL —— 见 bootstrap-ref-cart-target-cage.sql 的说明。
ALTER TABLE ref_cart ADD COLUMN pickup_mode VARCHAR(16) NOT NULL DEFAULT 'FARM' COMMENT '领用方式：FARM 饲养（预定笼位）/ TAKE 取走（不占笼位不选房间）';
