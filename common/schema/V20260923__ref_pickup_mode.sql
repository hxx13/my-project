-- 归档迁移：订购行的领用方式标记（FARM 饲养 / TAKE 取走）
-- 与 src/main/resources/db/bootstrap-ref-cart-pickup-mode.sql、
--    src/main/resources/db/bootstrap-ref-order-line-pickup-mode.sql 同源。
-- 手动执行：两条各自独立，已存在的那条报「重复列」可忽略。
--
-- 为什么需要这一列：取走不占笼位也不选房间，pickup_room_id / target_animal_cage_id 都是 NULL。
-- 光看「房间为空」区分不了「取走」和「历史单丢了快照」，审核页与导出就没法如实显示领用方式。
ALTER TABLE ref_cart ADD COLUMN pickup_mode VARCHAR(16) NOT NULL DEFAULT 'FARM' COMMENT '领用方式：FARM 饲养（预定笼位）/ TAKE 取走（不占笼位不选房间）';
ALTER TABLE ref_order_line ADD COLUMN pickup_mode VARCHAR(16) NOT NULL DEFAULT 'FARM' COMMENT '领用方式：FARM 饲养 / TAKE 取走（下单时自购物车快照）';
